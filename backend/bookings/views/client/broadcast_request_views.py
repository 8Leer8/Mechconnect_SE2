from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.utils import timezone
from django.db import transaction
from datetime import timedelta
import json
import logging

from ...models import (
    Request, BroadcastRequest, BroadcastOffer, Booking, ServiceLocation, BroadcastRequestAddOn
)
from ...serializers import BroadcastRequestSerializer, BroadcastOfferSerializer
from users.models import Account, TokenTransaction
from services.models import Service, ServiceAddOn
from services.pricing_utils import (
    get_distance_fee,
    get_traffic_surcharge,
    get_convenience_fee,
    apply_min_job_price,
    get_platform_commission,
    get_required_tokens,
)
from ...ws_utils import upsert_booking_party_notification
from notification.upsert import upsert_notification


def _send_user_event(account_id, payload):
    channel_layer = get_channel_layer()
    if channel_layer is None or not account_id:
        return
    async_to_sync(channel_layer.group_send)(f'user_{account_id}', payload)


def _calculate_total_amount(broadcast_request, distance_km, traffic_level):
    service_total = 0.0
    for service in broadcast_request.services.all():
        service_total += float(service.minimum_price)

    add_ons_total = 0.0
    for addon_relation in broadcast_request.add_ons.all():
        add_ons_total += float(addon_relation.service_add_on.price)

    service_subtotal = service_total + add_ons_total
    distance_fee = 0.0
    traffic_surcharge = 0.0
    if distance_km is not None:
        distance_fee = get_distance_fee(distance_km)
        traffic_surcharge = get_traffic_surcharge(distance_fee, traffic_level)

    convenience_fee = get_convenience_fee(service_subtotal)
    subtotal_amount = service_subtotal + distance_fee + traffic_surcharge + float(convenience_fee)
    total_amount = apply_min_job_price(subtotal_amount)
    platform_commission = get_platform_commission(total_amount)

    return {
        'service_subtotal': service_subtotal,
        'distance_fee': distance_fee,
        'traffic_surcharge': traffic_surcharge,
        'convenience_fee': convenience_fee,
        'total_amount': total_amount,
        'platform_commission': platform_commission,
        'required_tokens': get_required_tokens(total_amount),
    }


def _resolve_broadcast_request(broadcast_id, account):
    """Resolve a broadcast request by broadcast id or by parent request id."""
    try:
        return BroadcastRequest.objects.select_related('request', 'request__service_location').prefetch_related('services', 'add_ons__service_add_on').get(
            id=broadcast_id,
            request__client=account.client,
        )
    except BroadcastRequest.DoesNotExist:
        pass

    req = Request.objects.select_related('service_location', 'client').filter(
        id=broadcast_id,
        client=account.client,
        request_type='broadcast',
    ).first()
    if req and hasattr(req, 'broadcast_request'):
        return req.broadcast_request

    raise BroadcastRequest.DoesNotExist()

logger = logging.getLogger(__name__)
MIN_SEARCH_RADIUS_KM = 1
MAX_SEARCH_RADIUS_KM = 50


@api_view(['POST'])
@permission_classes([AllowAny])
def create_broadcast_request(request):
    """
    Create a new broadcast request
    Required fields: service_ids (JSON array), description, latitude, longitude, service_location
    Optional: concern_picture, add_on_ids (JSON array)
    """
    account_id = request.session.get('account_id')
    
    if not account_id:
        return Response({
            'error': 'Authentication required'
        }, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        account = Account.objects.get(id=account_id)
        
        if not hasattr(account, 'client'):
            return Response({
                'error': 'Only clients can create broadcast requests'
            }, status=status.HTTP_403_FORBIDDEN)
        
        client = account.client
        
        # Extract data
        description = request.data.get('description')
        latitude = request.data.get('latitude')
        longitude = request.data.get('longitude')
        concern_picture = request.FILES.get('concern_picture')
        search_radius_km_raw = request.data.get('search_radius_km', request.data.get('radius_km', 5))
        vehicle_type = str(request.data.get('vehicle_type') or '').strip()
        vehicle_brand = str(request.data.get('vehicle_brand') or '').strip()
        vehicle_model = str(request.data.get('vehicle_model') or '').strip()
        
        # Parse JSON fields
        try:
            service_location_str = request.data.get('service_location')
            if isinstance(service_location_str, str):
                service_location_data = json.loads(service_location_str)
            else:
                service_location_data = service_location_str
            
            service_ids_str = request.data.get('service_ids')
            if isinstance(service_ids_str, str):
                service_ids = json.loads(service_ids_str)
            else:
                service_ids = service_ids_str if service_ids_str else []
            
            # Optional add-ons
            add_on_ids_str = request.data.get('add_on_ids', '[]')
            if isinstance(add_on_ids_str, str):
                add_on_ids = json.loads(add_on_ids_str)
            else:
                add_on_ids = add_on_ids_str if add_on_ids_str else []
        except json.JSONDecodeError as e:
            return Response({
                'error': f'Invalid JSON format: {str(e)}'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate required fields
        if not description or not service_location_data:
            return Response({
                'error': 'Description and service location are required'
            }, status=status.HTTP_400_BAD_REQUEST)

        if not vehicle_type or not vehicle_brand or not vehicle_model:
            return Response({
                'error': 'Vehicle type, brand, and model are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if not service_ids or len(service_ids) == 0:
            return Response({
                'error': 'At least one service is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if latitude is None or longitude is None:
            return Response({
                'error': 'Latitude and longitude are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            latitude = float(latitude)
            longitude = float(longitude)
        except (ValueError, TypeError):
            return Response({
                'error': 'Invalid latitude or longitude format'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            search_radius_km = int(search_radius_km_raw)
        except (TypeError, ValueError):
            return Response({
                'error': 'Invalid search radius'
            }, status=status.HTTP_400_BAD_REQUEST)

        if search_radius_km < MIN_SEARCH_RADIUS_KM or search_radius_km > MAX_SEARCH_RADIUS_KM:
            return Response({
                'error': 'Search radius must be between 1 and 50 km'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate services exist
        services = Service.objects.filter(id__in=service_ids)
        if services.count() != len(service_ids):
            return Response({
                'error': 'One or more services not found'
            }, status=status.HTTP_404_NOT_FOUND)
        
        # Create service location
        service_location = ServiceLocation.objects.create(
            street_name=service_location_data.get('street_name'),
            subdivision_village=service_location_data.get('subdivision_village'),
            barangay=service_location_data.get('barangay'),
            city_municipality=service_location_data.get('city_municipality'),
            landmark=service_location_data.get('landmark')
        )
        
        # Create base request (no provider for broadcast - will be assigned when accepted)
        new_request = Request.objects.create(
            client=client,
            provider=None,  # No provider yet
            request_type='broadcast',
            service_location=service_location,
            vehicle_type=vehicle_type,
            vehicle_brand=vehicle_brand,
            vehicle_model=vehicle_model,
        )
        
        # Create broadcast request with expiration (30 minutes from now)
        expires_at = timezone.now() + timedelta(minutes=30)
        
        # Log image upload attempt
        if concern_picture:
            logger.info(f"Uploading concern picture: {concern_picture.name}, size: {concern_picture.size} bytes")
            logger.info(f"Content type: {concern_picture.content_type}")
            
            # Check which storage backend is being used
            from django.core.files.storage import default_storage
            logger.info(f"Storage backend: {type(default_storage).__name__}")
            logger.info(f"Storage backend class: {default_storage.__class__.__module__}.{default_storage.__class__.__name__}")
        
        try:
            broadcast_request = BroadcastRequest.objects.create(
                request=new_request,
                description=description,
                concern_picture=concern_picture,
                latitude=latitude,
                longitude=longitude,
                search_radius_km=search_radius_km,
                expires_at=expires_at,
                status=BroadcastRequest.Status.SEARCHING
            )
        except Exception as e:
            logger.error(f"Error creating broadcast request: {str(e)}")
            logger.exception("Full exception details:")
            raise
        
        # Verify upload and log result
        if concern_picture:
            if broadcast_request.concern_picture:
                file_url = broadcast_request.concern_picture.url
                file_name = broadcast_request.concern_picture.name
                logger.info(f"Image field saved - Name: {file_name}")
                logger.info(f"Image URL generated: {file_url}")
                
                # Verify file exists in storage using direct S3 check
                from django.core.files.storage import default_storage
                try:
                    # Try to actually access the file in S3
                    file_obj = default_storage.open(file_name, 'rb')
                    file_obj.close()
                    logger.info(f"✓ File verified in S3 storage: {file_name}")
                except Exception as verify_error:
                    logger.error(f"✗ File verification FAILED: {str(verify_error)}")
                    logger.exception("Verification error details:")
            else:
                logger.error("Image upload failed - concern_picture is None after save")
        
        # Add services
        broadcast_request.services.set(services)
        
        # Add service add-ons if provided
        if add_on_ids:
            for add_on_id in add_on_ids:
                try:
                    add_on = ServiceAddOn.objects.get(id=add_on_id)
                    BroadcastRequestAddOn.objects.create(
                        broadcast_request=broadcast_request,
                        service_add_on=add_on
                    )
                except ServiceAddOn.DoesNotExist:
                    pass  # Skip invalid add-on IDs

        channel_layer = get_channel_layer()
        if channel_layer is not None:
            async_to_sync(channel_layer.group_send)(
                f"user_{account.id}",
                {
                    "type": "booking_update",
                    "action": "broadcast_created",
                    "message": "New broadcast request created",
                },
            )
        
        return Response({
            'message': 'Broadcast request created successfully',
            'request_id': new_request.id,
            'broadcast_id': broadcast_request.id,
            'status': broadcast_request.status,
            'expires_at': broadcast_request.expires_at.isoformat()
        }, status=status.HTTP_201_CREATED)
    
    except Account.DoesNotExist:
        return Response({
            'error': 'Account not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_broadcast_offers(request, broadcast_id):
    """Return broadcast details and every mechanic offer for client selection."""
    account_id = request.session.get('account_id')

    if not account_id:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        account = Account.objects.get(id=account_id)
        if not hasattr(account, 'client'):
            return Response({'error': 'Only clients can view broadcast offers'}, status=status.HTTP_403_FORBIDDEN)

        broadcast_request = _resolve_broadcast_request(broadcast_id, account)

        offers = BroadcastOffer.objects.filter(
            broadcast_request=broadcast_request,
        ).select_related('mechanic__account').order_by('created_at', 'id')

        return Response({
            'broadcast': BroadcastRequestSerializer(broadcast_request, context={'request': request}).data,
            'offers': BroadcastOfferSerializer(offers, many=True, context={'request': request}).data,
            'count': offers.count(),
        }, status=status.HTTP_200_OK)

    except BroadcastRequest.DoesNotExist:
        return Response({'error': 'Broadcast request not found'}, status=status.HTTP_404_NOT_FOUND)
    except Account.DoesNotExist:
        return Response({'error': 'Account not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
@transaction.atomic
def select_mechanic(request, broadcast_id):
    """Atomically finalize a broadcast by selecting one mechanic offer."""
    account_id = request.session.get('account_id')

    if not account_id:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    offer_id_raw = request.data.get('offer_id')
    try:
        offer_id = int(offer_id_raw)
    except (TypeError, ValueError):
        return Response({'error': 'Valid offer_id is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        account = Account.objects.get(id=account_id)
        if not hasattr(account, 'client'):
            return Response({'error': 'Only clients can select mechanics'}, status=status.HTTP_403_FORBIDDEN)

        broadcast_request = _resolve_broadcast_request(broadcast_id, account)
        broadcast_request = BroadcastRequest.objects.select_for_update().select_related('request', 'request__client').prefetch_related('services', 'add_ons__service_add_on').get(id=broadcast_request.id)

        if not broadcast_request.can_accept_offers():
            return Response({
                'error': 'This broadcast is no longer available',
                'reason': 'expired' if broadcast_request.is_expired() else 'already_accepted',
            }, status=status.HTTP_400_BAD_REQUEST)

        winning_offer = BroadcastOffer.objects.select_for_update().select_related('mechanic__account').get(
            id=offer_id,
            broadcast_request=broadcast_request,
        )

        if winning_offer.status != BroadcastOffer.Status.PENDING:
            return Response({'error': 'This offer can no longer be selected'}, status=status.HTTP_400_BAD_REQUEST)

        distance_km = float(winning_offer.distance_km) if winning_offer.distance_km is not None else None
        traffic_level = winning_offer.traffic_level or 'low'
        total_amount = float(winning_offer.estimated_price) if winning_offer.estimated_price is not None else None
        convenience_fee = float(winning_offer.convenience_fee) if winning_offer.convenience_fee is not None else None
        eta_minutes = int(winning_offer.estimated_eta_minutes) if winning_offer.estimated_eta_minutes is not None else None

        if total_amount is None or convenience_fee is None:
            pricing = _calculate_total_amount(broadcast_request, distance_km, traffic_level)
            total_amount = pricing['total_amount']
            convenience_fee = float(pricing['convenience_fee'])

        required_tokens = get_required_tokens(total_amount)
        mechanic = winning_offer.mechanic

        wallet_balance = mechanic.account.wallet.balance
        if wallet_balance < required_tokens:
            return Response({
                'error': 'Selected mechanic no longer has enough tokens to complete this booking',
                'required_tokens': required_tokens,
                'current_tokens': int(wallet_balance),
            }, status=status.HTTP_403_FORBIDDEN)

        other_offers = list(
            BroadcastOffer.objects.select_for_update().select_related('mechanic__account').filter(
                broadcast_request=broadcast_request,
                status=BroadcastOffer.Status.PENDING,
            ).exclude(id=winning_offer.id)
        )

        now = timezone.now()
        winning_offer.status = BroadcastOffer.Status.ACCEPTED
        winning_offer.responded_at = now
        winning_offer.save(update_fields=['status', 'responded_at'])

        if other_offers:
            BroadcastOffer.objects.filter(id__in=[offer.id for offer in other_offers]).update(
                status=BroadcastOffer.Status.REJECTED,
                responded_at=now,
            )

        broadcast_request.status = BroadcastRequest.Status.ACCEPTED
        broadcast_request.accepted_at = now
        broadcast_request.save(update_fields=['status', 'accepted_at'])

        base_request = broadcast_request.request
        base_request.provider = mechanic.account
        base_request.save(update_fields=['provider'])

        booking = Booking.objects.create(
            request=base_request,
            status=Booking.Status.ACCEPTED,
            amount_fee=total_amount,
            distance_km=distance_km,
            convenience_fee=convenience_fee,
            eta_minutes=eta_minutes,
            traffic_surcharge=_calculate_total_amount(broadcast_request, distance_km, traffic_level)['traffic_surcharge'],
        )

        # Deduct from unified wallet
        wallet = mechanic.account.wallet
        wallet.balance -= required_tokens
        wallet.save(update_fields=['balance'])

        # Log the deduction
        TokenTransaction.objects.create(
            account=mechanic.account,
            transaction_type=TokenTransaction.Type.OFFER_ACCEPTED,
            tokens=-required_tokens,
            description=f'Tokens deducted for accepting broadcast offer {winning_offer.id}',
            metadata={
                'broadcast_request_id': broadcast_request.id,
                'booking_id': booking.id,
                'offer_id': winning_offer.id,
            }
        )
        TokenTransaction.objects.create(
            account=mechanic.account,
            tokens=-required_tokens,
            reason='booking_tax',
            related_booking_id=booking.id,
        )

        # Notify the winner and client that the broadcast has been finalized.
        _send_user_event(mechanic.account_id, {
            'type': 'booking_update',
            'action': 'booking_finalized',
            'broadcast_id': broadcast_request.id,
            'offer_id': winning_offer.id,
            'booking_id': booking.id,
            'status': booking.status,
            'message': 'Client accepted your request.',
        })
        _send_user_event(mechanic.account_id, {
            'type': 'notification_update',
            'action': 'booking_finalized',
            'broadcast_id': broadcast_request.id,
            'offer_id': winning_offer.id,
            'booking_id': booking.id,
            'status': booking.status,
            'message': 'Client accepted your request.',
        })

        # Guaranteed winner notification row for bell/list, even if helper upsert fails later.
        try:
            upsert_notification(
                receiver_id=mechanic.account_id,
                correlation_key=f'request:{booking.request_id}',
                title='Client accepted your request',
                message='Client accepted your request.',
                payload={
                    'booking_id': booking.id,
                    'request_id': booking.request_id,
                    'broadcast_id': broadcast_request.id,
                    'offer_id': winning_offer.id,
                    'status': booking.status,
                    'action': 'booking_finalized',
                    'target_role': 'mechanic',
                },
                mark_unread=True,
            )
        except Exception:
            logger.exception('Failed to upsert direct mechanic winner notification')

        _send_user_event(base_request.client.account_id, {
            'type': 'booking_update',
            'action': 'broadcast_finalized',
            'broadcast_id': broadcast_request.id,
            'offer_id': winning_offer.id,
            'booking_id': booking.id,
            'status': booking.status,
            'message': 'You selected a mechanic for your broadcast request',
        })

        for offer in other_offers:
            _send_user_event(offer.mechanic.account_id, {
                'type': 'booking_update',
                'action': 'offer_rejected',
                'broadcast_id': broadcast_request.id,
                'offer_id': offer.id,
                'booking_id': booking.id,
                'status': BroadcastOffer.Status.REJECTED,
                'message': 'Client accepted a different mechanic',
            })

        channel_layer = get_channel_layer()
        if channel_layer is not None:
            async_to_sync(channel_layer.group_send)('broadcasts', {
                'type': 'booking_update',
                'action': 'broadcast_removed',
                'broadcast_id': broadcast_request.id,
                'booking_id': booking.id,
                'message': 'Broadcast accepted',
            })

        try:
            upsert_booking_party_notification(
                mechanic.account_id,
                booking,
                'Client accepted your request',
                'Client accepted your request.',
                action='booking_finalized',
            )
            upsert_booking_party_notification(
                base_request.client.account_id,
                booking,
                'Booking confirmed',
                'You selected a mechanic for your broadcast request.',
                action='broadcast_finalized',
            )
            for offer in other_offers:
                upsert_booking_party_notification(
                    offer.mechanic.account_id,
                    booking,
                    'Offer not selected',
                    'The client chose a different mechanic.',
                    action='offer_rejected',
                )
        except Exception:
            logger.exception('Failed to upsert notifications for broadcast finalize')

        return Response({
            'message': 'Mechanic selected successfully',
            'broadcast_id': broadcast_request.id,
            'offer_id': winning_offer.id,
            'booking_id': booking.id,
            'status': broadcast_request.status,
            'tokens_deducted': required_tokens,
            'tokens_remaining': int(wallet.balance),
            'winner': BroadcastOfferSerializer(winning_offer, context={'request': request}).data,
            'rejected_offer_ids': [offer.id for offer in other_offers],
        }, status=status.HTTP_200_OK)

    except Account.DoesNotExist:
        return Response({'error': 'Account not found'}, status=status.HTTP_404_NOT_FOUND)
    except BroadcastOffer.DoesNotExist:
        return Response({'error': 'Offer not found for this broadcast'}, status=status.HTTP_404_NOT_FOUND)
    except BroadcastRequest.DoesNotExist:
        return Response({'error': 'Broadcast request not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
