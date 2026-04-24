from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.utils import timezone
from django.db import transaction
import math

from ...models import (
    BroadcastRequest, BroadcastOffer
)
from ...serializers import BroadcastRequestSerializer
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from users.models import Account
from services.pricing_utils import (
    get_distance_fee,
    get_traffic_surcharge,
    get_convenience_fee,
    apply_min_job_price,
)


def _haversine_km(lat1, lon1, lat2, lon2):
    radius_km = 6371.0
    lat1_rad = math.radians(float(lat1))
    lon1_rad = math.radians(float(lon1))
    lat2_rad = math.radians(float(lat2))
    lon2_rad = math.radians(float(lon2))

    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius_km * c


@api_view(['GET'])
@permission_classes([AllowAny])
def get_active_broadcasts(request):
    """
    Get all active broadcast requests for mechanics to view on the map.
    Returns only broadcasts with status=SEARCHING and not expired.
    """
    try:
        now = timezone.now()
        
        # Get all broadcasts that are still searching and not expired
        active_broadcasts = BroadcastRequest.objects.filter(
            status=BroadcastRequest.Status.SEARCHING,
            expires_at__gt=now
        ).select_related('request').prefetch_related('services', 'add_ons__service_add_on')

        # If the caller is authenticated, exclude broadcasts created by the same account
        account_id = request.session.get('account_id')
        if account_id:
            active_broadcasts = active_broadcasts.exclude(request__client__account_id=account_id)
        
        mechanic_lat = request.GET.get('mechanic_lat', request.GET.get('mechanic_latitude'))
        mechanic_lng = request.GET.get('mechanic_lng', request.GET.get('mechanic_longitude'))

        if mechanic_lat is not None and mechanic_lng is not None:
            try:
                mechanic_lat = float(mechanic_lat)
                mechanic_lng = float(mechanic_lng)
            except (TypeError, ValueError):
                return Response({
                    'error': 'Invalid mechanic coordinates'
                }, status=status.HTTP_400_BAD_REQUEST)

            filtered = []
            for br in active_broadcasts:
                distance_km = _haversine_km(mechanic_lat, mechanic_lng, br.latitude, br.longitude)
                if distance_km <= float(br.search_radius_km or 5):
                    filtered.append(br)
            active_broadcasts = filtered

        serializer = BroadcastRequestSerializer(active_broadcasts, many=True, context={'request': request})
        
        return Response({
            'broadcasts': serializer.data,
            'count': len(active_broadcasts)
        }, status=status.HTTP_200_OK)
    
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def accept_broadcast_request(request, broadcast_id):
    """
    Request to accept a broadcast request.
    Uses transaction.atomic() and select_for_update() to prevent race conditions.
    This now records a pending BroadcastOffer instead of finalizing the booking.
    Expects: mechanic_latitude, mechanic_longitude, distance_km,
    traffic_level, estimated_eta_minutes
    """
    account_id = request.session.get('account_id')
    
    if not account_id:
        return Response({
            'error': 'Authentication required'
        }, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        account = Account.objects.get(id=account_id)
        
        if not hasattr(account, 'mechanic'):
            return Response({
                'error': 'Only mechanics can accept broadcast requests'
            }, status=status.HTTP_403_FORBIDDEN)
        
        mechanic = account.mechanic
        
        # Extract location and pricing data from request
        mechanic_latitude = request.data.get('mechanic_latitude')
        mechanic_longitude = request.data.get('mechanic_longitude')
        distance_km_raw = request.data.get('distance_km')
        traffic_level_raw = request.data.get('traffic_level')
        estimated_eta_minutes_raw = request.data.get('estimated_eta_minutes')

        def _to_float(value):
            if value is None or value == '':
                return None
            try:
                return float(value)
            except (TypeError, ValueError):
                return None

        def _to_int(value):
            if value is None or value == '':
                return None
            try:
                return int(round(float(value)))
            except (TypeError, ValueError):
                return None

        distance_km = _to_float(distance_km_raw)
        estimated_eta_minutes = _to_int(estimated_eta_minutes_raw)

        raw_level = str(traffic_level_raw or '').strip().lower() or 'low'
        traffic_level = {
            'light': 'low',
            'low': 'low',
            'moderate': 'medium',
            'medium': 'medium',
            'heavy': 'high',
            'severe': 'high',
            'high': 'high',
            'unknown': 'low',
        }.get(raw_level, 'low')

        # Use atomic transaction to prevent race conditions
        with transaction.atomic():
            # Lock the broadcast request row
            try:
                broadcast_request = BroadcastRequest.objects.select_for_update().get(id=broadcast_id)
            except BroadcastRequest.DoesNotExist:
                return Response({
                    'error': 'Broadcast request not found'
                }, status=status.HTTP_404_NOT_FOUND)
            
            # Check if still accepting offers
            if not broadcast_request.can_accept_offers():
                return Response({
                    'error': 'This broadcast is no longer available',
                    'reason': 'expired' if broadcast_request.is_expired() else 'already_accepted'
                }, status=status.HTTP_400_BAD_REQUEST)

            # Prevent a user from accepting their own broadcast (if they switched roles)
            if hasattr(broadcast_request.request, 'client') and broadcast_request.request.client and broadcast_request.request.client.account_id == account.id:
                return Response({
                    'error': 'Cannot accept your own broadcast request'
                }, status=status.HTTP_403_FORBIDDEN)
            
            # Always compute amount server-side to avoid client-side hardcoded pricing drift.
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

            # Convenience is derived from service subtotal (not travel base) for clearer additive pricing.
            convenience_fee = get_convenience_fee(service_subtotal)

            subtotal_amount = service_subtotal + distance_fee + traffic_surcharge + float(convenience_fee)
            total_amount = apply_min_job_price(subtotal_amount)

            # Record or update the mechanic's pending offer.
            # The winner is only chosen later by the client.

            offer, created = BroadcastOffer.objects.get_or_create(
                broadcast_request=broadcast_request,
                mechanic=mechanic,
                defaults={
                    'status': BroadcastOffer.Status.PENDING,
                    'responded_at': timezone.now(),
                    'mechanic_latitude': mechanic_latitude,
                    'mechanic_longitude': mechanic_longitude,
                    'distance_km': distance_km,
                    'estimated_price': total_amount,
                    'convenience_fee': convenience_fee,
                    'traffic_level': traffic_level,
                    'estimated_eta_minutes': estimated_eta_minutes,
                }
            )
            
            if not created:
                # Update existing offer
                offer.status = BroadcastOffer.Status.PENDING
                offer.responded_at = timezone.now()
                offer.mechanic_latitude = mechanic_latitude
                offer.mechanic_longitude = mechanic_longitude
                offer.distance_km = distance_km
                offer.estimated_price = total_amount
                offer.convenience_fee = convenience_fee
                offer.traffic_level = traffic_level
                offer.estimated_eta_minutes = estimated_eta_minutes
                offer.save()

            base_request = broadcast_request.request

            # Notify the broadcast owner that a mechanic has requested to accept.
            try:
                channel_layer = get_channel_layer()
                if channel_layer is not None:
                    async_to_sync(channel_layer.group_send)(f'user_{base_request.client.account_id}', {
                        'type': 'booking_update',
                        'action': 'broadcast_offer_created',
                        'broadcast_id': broadcast_request.id,
                        'offer_id': offer.id,
                        'mechanic': {
                            'id': mechanic.id,
                            'name': f'{account.firstname} {account.lastname}'.strip(),
                            'rating': float(mechanic.average_rating) if getattr(mechanic, 'average_rating', None) is not None else None,
                        },
                        'status': offer.status,
                        'message': 'A mechanic requested to accept your broadcast',
                    })
                    async_to_sync(channel_layer.group_send)(f'user_{account.id}', {
                        'type': 'booking_update',
                        'action': 'broadcast_offer_pending',
                        'broadcast_id': broadcast_request.id,
                        'offer_id': offer.id,
                        'status': offer.status,
                        'message': 'Waiting for client to accept',
                    })
            except Exception:
                pass
            
            return Response({
                'message': 'Broadcast request sent to client successfully',
                'broadcast_id': broadcast_request.id,
                'offer_id': offer.id,
                'offer_status': offer.status,
                'amount_fee': total_amount,
                'distance_km': distance_km,
                'convenience_fee': convenience_fee,
                'traffic_level': traffic_level,
                'estimated_eta_minutes': estimated_eta_minutes,
                'tokens_remaining': mechanic.tokens_balance,
            }, status=status.HTTP_200_OK)
    
    except Account.DoesNotExist:
        return Response({
            'error': 'Account not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def withdraw_broadcast_offer(request, broadcast_id):
    """Withdraw a mechanic's pending broadcast offer so it disappears from client waiting lists."""
    account_id = request.session.get('account_id')

    if not account_id:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        account = Account.objects.get(id=account_id)
        if not hasattr(account, 'mechanic'):
            return Response({'error': 'Only mechanics can withdraw offers'}, status=status.HTTP_403_FORBIDDEN)

        mechanic = account.mechanic

        with transaction.atomic():
            try:
                broadcast_request = BroadcastRequest.objects.select_for_update().select_related('request', 'request__client').get(id=broadcast_id)
            except BroadcastRequest.DoesNotExist:
                return Response({'error': 'Broadcast request not found'}, status=status.HTTP_404_NOT_FOUND)

            offer = BroadcastOffer.objects.select_for_update().filter(
                broadcast_request=broadcast_request,
                mechanic=mechanic,
                status=BroadcastOffer.Status.PENDING,
            ).first()

            if not offer:
                return Response({
                    'error': 'No pending offer found to withdraw',
                }, status=status.HTTP_400_BAD_REQUEST)

            offer.status = BroadcastOffer.Status.REJECTED
            offer.responded_at = timezone.now()
            offer.save(update_fields=['status', 'responded_at'])

            try:
                channel_layer = get_channel_layer()
                if channel_layer is not None:
                    async_to_sync(channel_layer.group_send)(f'user_{broadcast_request.request.client.account_id}', {
                        'type': 'booking_update',
                        'action': 'offer_rejected',
                        'broadcast_id': broadcast_request.id,
                        'offer_id': offer.id,
                        'status': BroadcastOffer.Status.REJECTED,
                        'message': 'Mechanic withdrew their request',
                    })
                    async_to_sync(channel_layer.group_send)(f'user_{account.id}', {
                        'type': 'booking_update',
                        'action': 'broadcast_offer_withdrawn',
                        'broadcast_id': broadcast_request.id,
                        'offer_id': offer.id,
                        'status': BroadcastOffer.Status.REJECTED,
                        'message': 'Your request was withdrawn',
                    })
            except Exception:
                pass

            return Response({
                'message': 'Broadcast offer withdrawn successfully',
                'broadcast_id': broadcast_request.id,
                'offer_id': offer.id,
                'status': offer.status,
            }, status=status.HTTP_200_OK)

    except Account.DoesNotExist:
        return Response({'error': 'Account not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
