from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.db.models import Q
from datetime import timedelta

import json

from ...models import (
    Request,
    CustomRequest,
    DirectRequest,
    EmergencyRequest,
    EmergencyRequestPhoto,
    ServiceLocation,
    DirectRequestAddOn,
    DirectRequestServiceLine,
)
from users.models import Account, Mechanic, ShopOwner
from services.models import Service, ServiceAddOn, MechanicService, ShopService
from shops.models import Shop                          # added


EMERGENCY_COOLDOWN_MINUTES = 5
MAX_EMERGENCY_PHOTOS = 5
EMERGENCY_LOCATION_PLACEHOLDERS = {'emergency', 'emergency location', 'unknown barangay', 'unknown city'}


def _extract_vehicle_fields(request):
    vehicle_type = str(request.data.get('vehicle_type') or '').strip()
    vehicle_brand = str(request.data.get('vehicle_brand') or '').strip()
    vehicle_model = str(request.data.get('vehicle_model') or '').strip()
    vehicle_description = str(request.data.get('vehicle_description') or '').strip()
    return vehicle_type, vehicle_brand, vehicle_model, vehicle_description


def _parse_optional_schedule(value):
    if not value:
        return None
    parsed = parse_datetime(str(value))
    if parsed is None:
        return None
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def _clean_location_text(value, fallback='Unavailable'):
    text = str(value or '').strip()
    if not text:
        return fallback
    if text.lower() in EMERGENCY_LOCATION_PLACEHOLDERS:
        return fallback
    return text


def _get_emergency_cooldown_seconds(client):
    latest_emergency = Request.objects.filter(
        client=client,
        request_type='emergency'
    ).order_by('-created_at').first()

    if not latest_emergency:
        return 0

    # No cooldown when the latest emergency booking was cancelled by a mechanic.
    try:
        booking = latest_emergency.booking
        cancel_record = booking.cancelbooking
        cancelled_by = getattr(cancel_record, "cancelled_by", None)
        if cancelled_by is not None and hasattr(cancelled_by, "mechanic"):
            return 0
    except Exception:
        pass

    cooldown_window = timedelta(minutes=EMERGENCY_COOLDOWN_MINUTES)
    elapsed = timezone.now() - latest_emergency.created_at
    remaining = cooldown_window - elapsed

    if remaining.total_seconds() <= 0:
        return 0

    return int(remaining.total_seconds())


@api_view(['GET'])
@permission_classes([AllowAny])
def get_emergency_cooldown(request):
    account_id = request.session.get('account_id')

    if not account_id:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        account = Account.objects.get(id=account_id)

        if not hasattr(account, 'client'):
            return Response({'error': 'Only clients can check emergency cooldown'}, status=status.HTTP_403_FORBIDDEN)

        remaining_seconds = _get_emergency_cooldown_seconds(account.client)
        return Response({
            'can_request': remaining_seconds <= 0,
            'remaining_seconds': remaining_seconds,
            'cooldown_minutes': EMERGENCY_COOLDOWN_MINUTES,
        }, status=status.HTTP_200_OK)
    except Account.DoesNotExist:
        return Response({'error': 'Account not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def create_custom_request(request):
    """
    Create a new custom request
    Required fields: description, service_location
    Optional: provider_id, shop_id, concern_picture
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
                'error': 'Only clients can create requests'
            }, status=status.HTTP_403_FORBIDDEN)
        
        client = account.client
        
        # Extract data
        provider_id = request.data.get('provider_id')
        shop_id = request.data.get('shop_id')              # added
        description = request.data.get('description')
        service_location_data = request.data.get('service_location')
        concern_picture = request.FILES.get('concern_picture')
        scheduled_time = _parse_optional_schedule(request.data.get('scheduled_time'))
        vehicle_type, vehicle_brand, vehicle_model, _vehicle_description = _extract_vehicle_fields(request)
        
        # Parse service_location JSON string when sent via FormData
        # (same lng sa broadcast_request_views)
        if isinstance(service_location_data, str):
            try:
                service_location_data = json.loads(service_location_data)
            except json.JSONDecodeError:
                return Response({
                    'error': 'Invalid service location format'
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
        
        # Get provider if specified
        provider = None
        if provider_id:
            try:
                provider = Account.objects.get(id=provider_id)
            except Account.DoesNotExist:
                return Response({
                    'error': 'Provider not found'
                }, status=status.HTTP_404_NOT_FOUND)
        
        # Get shop if specified                            # added
        shop = None
        if shop_id:
            try:
                shop = Shop.objects.get(id=shop_id)
                # Auto-assign shop owner as provider if no provider_id given
                if not provider:
                    provider = shop.shop_owner.account
            except Shop.DoesNotExist:
                return Response({
                    'error': 'Shop not found'
                }, status=status.HTTP_404_NOT_FOUND)
        
        # Create service location
        service_location = ServiceLocation.objects.create(
            street_name=service_location_data.get('street_name'),
            subdivision_village=service_location_data.get('subdivision_village'),
            barangay=service_location_data.get('barangay'),
            city_municipality=service_location_data.get('city_municipality'),
            landmark=service_location_data.get('landmark')
        )
        
        # Create request
        new_request = Request.objects.create(
            client=client,
            provider=provider,
            shop=shop,                                     # 👈 added
            request_type='custom',
            service_location=service_location,
            vehicle_type=vehicle_type,
            vehicle_brand=vehicle_brand,
            vehicle_model=vehicle_model,
            scheduled_time=scheduled_time,
        )
        
        # Create custom request
        custom_request = CustomRequest.objects.create(
            request=new_request,
            description=description,
            concern_picture=concern_picture
        )
        
        return Response({
            'message': 'Custom request created successfully',
            'request_id': new_request.id,
            'status': custom_request.request_status
        }, status=status.HTTP_201_CREATED)
    
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
def create_mechanic_direct_request(request):
    """
    Create a direct request to a mechanic.

    Single service (legacy): provider_id, service_id, service_location, optional add_on_ids.
    Multiple services: provider_id, service_location, and service_lines:
        [ {"service_id": 1, "add_on_ids": [10]}, {"service_id": 2, "add_on_ids": []} ]
    """
    account_id = request.session.get('account_id')

    if not account_id:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        account = Account.objects.get(id=account_id)

        if not hasattr(account, 'client'):
            return Response({'error': 'Only clients can create requests'}, status=status.HTTP_403_FORBIDDEN)

        client = account.client

        provider_id = request.data.get('provider_id')
        service_location_data = request.data.get('service_location')
        service_id = request.data.get('service_id')
        add_on_ids = request.data.get('add_on_ids', [])
        service_lines_raw = request.data.get('service_lines')
        scheduled_time = _parse_optional_schedule(request.data.get('scheduled_time'))
        vehicle_type, vehicle_brand, vehicle_model, _vehicle_description = _extract_vehicle_fields(request)

        if isinstance(service_location_data, str):
            try:
                service_location_data = json.loads(service_location_data)
            except json.JSONDecodeError:
                return Response({'error': 'Invalid service location format'}, status=status.HTTP_400_BAD_REQUEST)

        if not provider_id:
            return Response({'error': 'Provider is required'}, status=status.HTTP_400_BAD_REQUEST)

        if not service_location_data:
            return Response({'error': 'Service location is required'}, status=status.HTTP_400_BAD_REQUEST)

        if not vehicle_type or not vehicle_brand or not vehicle_model:
            return Response({'error': 'Vehicle type, brand, and model are required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            provider = Account.objects.get(id=provider_id)
        except Account.DoesNotExist:
            return Response({'error': 'Provider not found'}, status=status.HTTP_404_NOT_FOUND)

        if not hasattr(provider, 'mechanic'):
            return Response({'error': 'Selected provider is not a mechanic'}, status=status.HTTP_400_BAD_REQUEST)

        if provider.mechanic.status != Mechanic.WorkStatus.AVAILABLE:
            return Response(
                {'error': 'Mechanic not available for booking'},
                status=status.HTTP_409_CONFLICT,
            )

        def _coerce_int_list(raw):
            if isinstance(raw, str):
                try:
                    raw = json.loads(raw)
                except json.JSONDecodeError:
                    return []
            if not isinstance(raw, list):
                return []
            out = []
            for x in raw:
                try:
                    out.append(int(x))
                except (TypeError, ValueError):
                    continue
            return out

        lines_spec = []
        if service_lines_raw is not None:
            if isinstance(service_lines_raw, str):
                try:
                    service_lines_raw = json.loads(service_lines_raw)
                except json.JSONDecodeError:
                    return Response({'error': 'Invalid service_lines format'}, status=status.HTTP_400_BAD_REQUEST)
            if not isinstance(service_lines_raw, list) or len(service_lines_raw) == 0:
                return Response({'error': 'service_lines must be a non-empty list'}, status=status.HTTP_400_BAD_REQUEST)
            seen_svc = set()
            for row in service_lines_raw:
                if not isinstance(row, dict):
                    return Response({'error': 'Each service_lines entry must be an object'}, status=status.HTTP_400_BAD_REQUEST)
                sid = row.get('service_id')
                if sid is None:
                    return Response({'error': 'Each service_lines entry needs service_id'}, status=status.HTTP_400_BAD_REQUEST)
                try:
                    sid = int(sid)
                except (TypeError, ValueError):
                    return Response({'error': 'Invalid service_id in service_lines'}, status=status.HTTP_400_BAD_REQUEST)
                if sid in seen_svc:
                    return Response({'error': 'Duplicate service in service_lines'}, status=status.HTTP_400_BAD_REQUEST)
                seen_svc.add(sid)
                lines_spec.append({'service_id': sid, 'add_on_ids': _coerce_int_list(row.get('add_on_ids', []))})
        else:
            if not service_id:
                return Response({'error': 'Service is required'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                sid = int(service_id)
            except (TypeError, ValueError):
                return Response({'error': 'Invalid service_id'}, status=status.HTTP_400_BAD_REQUEST)
            lines_spec.append({'service_id': sid, 'add_on_ids': _coerce_int_list(add_on_ids)})

        resolved_lines = []
        for spec in lines_spec:
            try:
                service = Service.objects.get(id=spec['service_id'])
            except Service.DoesNotExist:
                return Response({'error': 'Service not found'}, status=status.HTTP_404_NOT_FOUND)
            try:
                mechanic_service = MechanicService.objects.get(
                    mechanic=provider.mechanic,
                    service=service,
                )
            except MechanicService.DoesNotExist:
                return Response(
                    {'error': 'Selected mechanic does not offer one of the chosen services'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            row_addons = []
            for add_on_id in spec['add_on_ids']:
                try:
                    add_on = ServiceAddOn.objects.get(
                        id=add_on_id,
                        service=service,
                        mechanic=provider.mechanic,
                    )
                except ServiceAddOn.DoesNotExist:
                    return Response(
                        {'error': 'One or more selected add-ons are not available for this mechanic'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                row_addons.append(add_on)
            resolved_lines.append((service, mechanic_service, row_addons))

        first_service = resolved_lines[0][0]

        service_location = ServiceLocation.objects.create(
            street_name=service_location_data.get('street_name', ''),
            subdivision_village=service_location_data.get('subdivision_village'),
            barangay=service_location_data.get('barangay', ''),
            city_municipality=service_location_data.get('city_municipality', ''),
            landmark=service_location_data.get('landmark'),
            latitude=service_location_data.get('latitude'),
            longitude=service_location_data.get('longitude'),
        )

        new_request = Request.objects.create(
            client=client,
            provider=provider,
            request_type='direct',
            service_location=service_location,
            vehicle_type=vehicle_type,
            vehicle_brand=vehicle_brand,
            vehicle_model=vehicle_model,
            scheduled_time=scheduled_time,
        )

        direct_request = DirectRequest.objects.create(
            request=new_request,
            service=first_service,
        )

        for i, (service, _ms, _addons) in enumerate(resolved_lines):
            DirectRequestServiceLine.objects.create(
                request=new_request,
                service=service,
                sort_order=i,
            )

        total_amount = 0.0
        for _service, mechanic_service, row_addons in resolved_lines:
            total_amount += float(mechanic_service.price)
            for add_on in row_addons:
                DirectRequestAddOn.objects.create(
                    request=new_request,
                    service_add_on=add_on,
                )
                total_amount += float(add_on.price)

        return Response({
            'message': 'Direct request created successfully',
            'request_id': new_request.id,
            'request_number': f"{new_request.id:02d}",
            'status': direct_request.request_status,
            'total_amount': total_amount,
        }, status=status.HTTP_201_CREATED)

    except Account.DoesNotExist:
        return Response({'error': 'Account not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_mechanics(request):
    """
    Get list of available mechanics with their services.
    """
    try:
        mechanics = Mechanic.objects.select_related('account').filter(
            status=Mechanic.WorkStatus.AVAILABLE,
            verification_status=Mechanic.VerificationStatus.APPROVED,
            account__is_active=True,
        )

        mechanics_data = []
        for mechanic in mechanics:
            account = mechanic.account
            mechanic_services = MechanicService.objects.filter(mechanic=mechanic).select_related('service')
            services = [
                {
                    'id': ms.service.id,
                    'name': ms.service.name,
                    'price': float(ms.price),
                }
                for ms in mechanic_services
            ]

            mechanics_data.append({
                'id': account.id,
                'name': f"{account.firstname} {account.lastname}",
                'full_name': f"{account.lastname}, {account.firstname} {account.middlename or ''}".strip(),
                'services': services,
            })

        return Response({'mechanics': mechanics_data}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_mechanic_services(request, mechanic_id):
    """
    Get services offered by a specific mechanic with their mechanic-owned add-ons.
    """
    try:
        mechanic = Mechanic.objects.get(account__id=mechanic_id)
        mechanic_services = MechanicService.objects.filter(mechanic=mechanic).select_related('service')

        services_data = []
        for ms in mechanic_services:
            service = ms.service
            add_ons = ServiceAddOn.objects.filter(service=service, mechanic=mechanic).order_by('name')
            add_ons_data = [
                {
                    'id': addon.id,
                    'name': addon.name,
                    'description': addon.description,
                    'price': float(addon.price),
                }
                for addon in add_ons
            ]

            services_data.append({
                'id': service.id,
                'name': service.name,
                'description': service.description,
                'price': float(ms.price),
                'add_ons': add_ons_data,
            })

        return Response({'services': services_data}, status=status.HTTP_200_OK)
    except Mechanic.DoesNotExist:
        return Response({'error': 'Mechanic not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_service_addons(request, service_id):
    """
    Get add-ons for a specific service.
    Optional query params:
        - provider_id: when set to a mechanic account id, returns mechanic-owned add-ons only.
            When set to a shop owner account id, returns add-ons owned by that shop only.
      Without provider_id, only legacy global add-ons are returned.
    """
    try:
        service = Service.objects.get(id=service_id)
        provider_id = request.query_params.get('provider_id')
        add_ons = ServiceAddOn.objects.filter(service=service)

        if provider_id:
            try:
                provider_id = int(provider_id)
            except (TypeError, ValueError):
                return Response({'error': 'provider_id must be an integer'}, status=status.HTTP_400_BAD_REQUEST)

            try:
                mechanic = Mechanic.objects.get(account__id=provider_id)
                add_ons = add_ons.filter(mechanic=mechanic)
            except Mechanic.DoesNotExist:
                try:
                    shop_owner = ShopOwner.objects.select_related('shop').get(account__id=provider_id)
                    add_ons = add_ons.filter(shop=shop_owner.shop)
                except ShopOwner.DoesNotExist:
                    return Response({'error': 'Provider not found'}, status=status.HTTP_404_NOT_FOUND)
        else:
            add_ons = add_ons.filter(shop__isnull=True, mechanic__isnull=True)

        category_name = service.category.name if service.category else None

        add_ons_data = [
            {
                'id': addon.id,
                'service_id': service.id,
                'category': category_name,
                'name': addon.name,
                'description': addon.description,
                'price': float(addon.price),
            }
            for addon in add_ons
        ]

        return Response({'add_ons': add_ons_data}, status=status.HTTP_200_OK)
    except Service.DoesNotExist:
        return Response({'error': 'Service not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_shops(request):
    """
    Get list of available shops with their services.
    """
    try:
        shops = Shop.objects.select_related('shop_owner', 'shop_owner__account').filter(status='open')

        shops_data = []
        for shop in shops:
            shop_services = ShopService.objects.filter(shop=shop).select_related('service')
            services = [
                {
                    'id': ss.service.id,
                    'name': ss.service.name,
                    'price': float(ss.price),
                }
                for ss in shop_services
            ]

            shops_data.append({
                'id': shop.shop_owner.account.id,
                'shop_id': shop.id,
                'name': shop.shop_name,
                'full_name': shop.shop_name,
                'services': services,
                'contact_number': shop.contact_number or '',
                'is_verified': bool(shop.is_verified),
            })

        return Response({'shops': shops_data}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_shop_services(request, shop_id):
    """
    Get services offered by a specific shop with their add-ons.
    shop_id is the shop owner's account id.
    """
    try:
        shop_owner = ShopOwner.objects.get(account__id=shop_id)
        shop = shop_owner.shop
        shop_services = ShopService.objects.filter(shop=shop).select_related('service')

        services_data = []
        for ss in shop_services:
            service = ss.service
            add_ons = ServiceAddOn.objects.filter(service=service, shop=shop)
            add_ons_data = [
                {
                    'id': addon.id,
                    'name': addon.name,
                    'description': addon.description,
                    'price': float(addon.price),
                }
                for addon in add_ons
            ]

            services_data.append({
                'id': service.id,
                'name': service.name,
                'description': service.description,
                'price': float(ss.price),
                'add_ons': add_ons_data,
            })

        return Response({'services': services_data}, status=status.HTTP_200_OK)
    except ShopOwner.DoesNotExist:
        return Response({'error': 'Shop not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny])
def create_shop_direct_request(request):
    """
    Create a direct request to a shop.
    Required fields: shop_id, service_id, service_location
    Optional fields: add_on_ids (array), scheduled_time
    """
    account_id = request.session.get('account_id')

    if not account_id:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        account = Account.objects.get(id=account_id)

        if not hasattr(account, 'client'):
            return Response({'error': 'Only clients can create requests'}, status=status.HTTP_403_FORBIDDEN)

        client = account.client

        shop_id = request.data.get('shop_id')
        provider_id = request.data.get('provider_id')
        service_id = request.data.get('service_id')
        service_location_data = request.data.get('service_location')
        add_on_ids = request.data.get('add_on_ids', [])
        scheduled_time = _parse_optional_schedule(request.data.get('scheduled_time'))
        vehicle_type, vehicle_brand, vehicle_model, _vehicle_description = _extract_vehicle_fields(request)

        if isinstance(service_location_data, str):
            try:
                service_location_data = json.loads(service_location_data)
            except json.JSONDecodeError:
                return Response({'error': 'Invalid service location format'}, status=status.HTTP_400_BAD_REQUEST)

        if not shop_id:
            return Response({'error': 'Shop is required'}, status=status.HTTP_400_BAD_REQUEST)

        if not service_id:
            return Response({'error': 'Service is required'}, status=status.HTTP_400_BAD_REQUEST)

        if not service_location_data:
            return Response({'error': 'Service location is required'}, status=status.HTTP_400_BAD_REQUEST)

        if not vehicle_type or not vehicle_brand or not vehicle_model:
            return Response({'error': 'Vehicle type, brand, and model are required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            shop = Shop.objects.select_related('shop_owner', 'shop_owner__account').get(id=shop_id)
            service = Service.objects.get(id=service_id)
        except Shop.DoesNotExist:
            return Response({'error': 'Shop not found'}, status=status.HTTP_404_NOT_FOUND)
        except Service.DoesNotExist:
            return Response({'error': 'Service not found'}, status=status.HTTP_404_NOT_FOUND)

        if shop.status != Shop.Status.OPEN:
            return Response(
                {
                    'error': 'Shop is unavailable for direct requests. The shop is hidden from discovery.',
                    'reason': 'shop_unavailable',
                },
                status=status.HTTP_409_CONFLICT,
            )

        provider = shop.shop_owner.account
        if provider_id and str(provider.id) != str(provider_id):
            return Response({'error': 'Provider does not match selected shop'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            shop_service = ShopService.objects.get(shop=shop, service=service)
        except ShopService.DoesNotExist:
            return Response({'error': 'Selected shop does not offer this service'}, status=status.HTTP_400_BAD_REQUEST)

        service_location = ServiceLocation.objects.create(
            street_name=service_location_data.get('street_name', ''),
            subdivision_village=service_location_data.get('subdivision_village'),
            barangay=service_location_data.get('barangay', ''),
            city_municipality=service_location_data.get('city_municipality', ''),
            landmark=service_location_data.get('landmark'),
            latitude=service_location_data.get('latitude'),
            longitude=service_location_data.get('longitude'),
        )

        new_request = Request.objects.create(
            client=client,
            provider=provider,
            shop=shop,
            request_type='direct',
            service_location=service_location,
            vehicle_type=vehicle_type,
            vehicle_brand=vehicle_brand,
            vehicle_model=vehicle_model,
            scheduled_time=scheduled_time,
        )

        direct_request = DirectRequest.objects.create(
            request=new_request,
            service=service,
        )

        total_amount = float(shop_service.price)

        if isinstance(add_on_ids, str):
            try:
                add_on_ids = json.loads(add_on_ids)
            except json.JSONDecodeError:
                add_on_ids = []

        if not isinstance(add_on_ids, list):
            add_on_ids = []

        for add_on_id in add_on_ids:
            try:
                add_on = ServiceAddOn.objects.get(id=add_on_id, service=service, shop=shop)
                DirectRequestAddOn.objects.create(
                    request=new_request,
                    service_add_on=add_on,
                )
                total_amount += float(add_on.price)
            except ServiceAddOn.DoesNotExist:
                continue

        return Response({
            'message': 'Direct request to shop created successfully',
            'request_id': new_request.id,
            'request_number': f"{new_request.id:02d}",
            'status': direct_request.request_status,
            'total_amount': total_amount,
        }, status=status.HTTP_201_CREATED)

    except Account.DoesNotExist:
        return Response({'error': 'Account not found'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([AllowAny])
def create_emergency_request(request):
    """
    Create a new emergency request
    Required fields: service_location (must include latitude, longitude)
    Optional: description, concern_picture, provider_id
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
                'error': 'Only clients can create requests'
            }, status=status.HTTP_403_FORBIDDEN)
        
        client = account.client

        remaining_seconds = _get_emergency_cooldown_seconds(client)
        if remaining_seconds > 0:
            return Response({
                'error': f'Please wait {remaining_seconds} seconds before sending another emergency request.',
                'remaining_seconds': remaining_seconds,
                'cooldown_minutes': EMERGENCY_COOLDOWN_MINUTES,
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)
        
        # Extract data
        provider_id = request.data.get('provider_id')
        description = request.data.get('description', '')  # Optional
        service_location_data = request.data.get('service_location')
        concern_picture = request.FILES.get('concern_picture')
        concern_pictures = request.FILES.getlist('concern_pictures')
        scheduled_time = _parse_optional_schedule(request.data.get('scheduled_time'))
        vehicle_type, vehicle_brand, vehicle_model, vehicle_description = _extract_vehicle_fields(request)

        total_photos = len(concern_pictures) + (1 if concern_picture and not concern_pictures else 0)
        if total_photos > MAX_EMERGENCY_PHOTOS:
            return Response({
                'error': f'You can upload up to {MAX_EMERGENCY_PHOTOS} photos only'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Parse service_location JSON string when sent via FormData
        if isinstance(service_location_data, str):
            try:
                service_location_data = json.loads(service_location_data)
            except json.JSONDecodeError:
                return Response({
                    'error': 'Invalid service_location format'
                }, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate required fields
        if not service_location_data:
            return Response({
                'error': 'Service location is required for emergency requests'
            }, status=status.HTTP_400_BAD_REQUEST)

        if not vehicle_type or not vehicle_brand or not vehicle_model:
            return Response({
                'error': 'Vehicle type, brand, and model are required'
            }, status=status.HTTP_400_BAD_REQUEST)

        if not vehicle_description:
            return Response({
                'error': 'Vehicle description is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get provider if specified
        provider = None
        if provider_id:
            try:
                provider = Account.objects.get(id=provider_id)
            except Account.DoesNotExist:
                return Response({
                    'error': 'Provider not found'
                }, status=status.HTTP_404_NOT_FOUND)
        
        latitude = service_location_data.get('latitude')
        longitude = service_location_data.get('longitude')
        if latitude in (None, '') or longitude in (None, ''):
            return Response({
                'error': 'Emergency location coordinates are required'
            }, status=status.HTTP_400_BAD_REQUEST)

        # Create service location
        service_location = ServiceLocation.objects.create(
            street_name=_clean_location_text(
                service_location_data.get('street_name') or service_location_data.get('address'),
                fallback=f'{latitude}, {longitude}'
            ),
            subdivision_village=service_location_data.get('subdivision_village'),
            barangay=_clean_location_text(service_location_data.get('barangay')),
            city_municipality=_clean_location_text(service_location_data.get('city_municipality')),
            landmark=service_location_data.get('landmark'),
            latitude=latitude,
            longitude=longitude
        )
        
        # Create request
        new_request = Request.objects.create(
            client=client,
            provider=provider,
            request_type='emergency',
            service_location=service_location,
            vehicle_type=vehicle_type,
            vehicle_brand=vehicle_brand,
            vehicle_model=vehicle_model,
            vehicle_description=vehicle_description,
            scheduled_time=scheduled_time,
        )
        
        # Create emergency request
        emergency_request = EmergencyRequest.objects.create(
            request=new_request,
            description=description if description else None,
            concern_picture=concern_picture or (concern_pictures[0] if concern_pictures else None),
        )

        if concern_pictures:
            EmergencyRequestPhoto.objects.bulk_create([
                EmergencyRequestPhoto(emergency_request=emergency_request, photo=image)
                for image in concern_pictures
            ])
        
        return Response({
            'message': 'Emergency request created successfully',
            'request_id': new_request.id
        }, status=status.HTTP_201_CREATED)
    
    except Account.DoesNotExist:
        return Response({
            'error': 'Account not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)