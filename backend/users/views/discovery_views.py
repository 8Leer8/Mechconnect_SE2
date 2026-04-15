from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.db.models import OuterRef, Subquery
from math import radians, sin, cos, sqrt, atan2

from ..models import Mechanic
from ..serializers import MechanicSerializer, MechanicProfileSerializer
from bookings.models import MechanicLocation, BroadcastOffer
from services.models import MechanicService, MechanicSpecialty
from shops.models import Shop
from services.models import ShopService
from MainBackend.storage_utils import get_media_url


def _haversine_km(lat1, lon1, lat2, lon2):
    earth_radius_km = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return earth_radius_km * c


@api_view(['GET'])
@permission_classes([AllowAny])
def list_mechanics(request):
    """
    Get list of all available mechanics
    Returns mechanic details including profile, ratings, and services
    """
    try:
        account_id = request.session.get('account_id')

        mechanics = Mechanic.objects.select_related('account').filter(
            verification_status=Mechanic.VerificationStatus.APPROVED,
            account__is_active=True,
        )
        if account_id:
            mechanics = mechanics.exclude(account_id=account_id)

        mechanics_data = []
        
        for mechanic in mechanics:
            mechanic_info = {
                'id': mechanic.id,
                'account_id': mechanic.account.id,
                'name': f"{mechanic.account.firstname} {mechanic.account.lastname}",
                'profile_photo': get_media_url(mechanic.profile_photo, request) if mechanic.profile_photo else None,
                'contact_number': mechanic.contact_number,
                'average_rating': float(mechanic.average_rating),
                'status': mechanic.status,
                'is_working_for_shop': mechanic.is_working_for_shop,
            }
            mechanics_data.append(mechanic_info)
        
        return Response({
            'mechanics': mechanics_data,
            'count': len(mechanics_data)
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_mechanic_profile(request, mechanic_id):
    """
    Get detailed mechanic profile by mechanic ID
    
    Returns comprehensive profile including:
    - Basic info (name, photo, contact)
    - Ratings and reviews
    - Years active
    - Bio
    - Specialties
    - Services offered with prices
    - Shop affiliation
    """
    try:
        mechanic = Mechanic.objects.select_related(
            'account', 'shop'
        ).prefetch_related(
            'reviews', 'reviews__reviewer'
        ).get(id=mechanic_id)
        
        serializer = MechanicProfileSerializer(mechanic, context={'request': request})
        
        return Response({
            'mechanic': serializer.data
        }, status=status.HTTP_200_OK)
        
    except Mechanic.DoesNotExist:
        return Response({
            'error': 'Mechanic not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([AllowAny])
def list_nearby_mechanics(request):
    """
    Findings from codebase discovery:
    - Mechanic/Shop profile models do not store static latitude/longitude fields.
    - Reusable mechanic coordinates exist in bookings.MechanicLocation (live) and
      bookings.BroadcastOffer.mechanic_latitude/longitude (accepted offer snapshot).
    - We use live location first, then fallback to latest accepted offer coordinates.
    """
    lat_raw = request.GET.get('lat')
    lng_raw = request.GET.get('lng')
    radius_raw = request.GET.get('radius_km', '5')

    if lat_raw is None or lng_raw is None:
        return Response({'error': 'lat and lng are required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        selected_lat = float(lat_raw)
        selected_lng = float(lng_raw)
        radius_km = float(radius_raw)
    except (TypeError, ValueError):
        return Response({'error': 'Invalid coordinate or radius'}, status=status.HTTP_400_BAD_REQUEST)

    if radius_km <= 0:
        radius_km = 5.0
    radius_km = min(radius_km, 5.0)

    live_lat_sq = MechanicLocation.objects.filter(
        booking__request__provider=OuterRef('account')
    ).order_by('-updated_at').values('latitude')[:1]
    live_lng_sq = MechanicLocation.objects.filter(
        booking__request__provider=OuterRef('account')
    ).order_by('-updated_at').values('longitude')[:1]
    offer_lat_sq = BroadcastOffer.objects.filter(
        mechanic=OuterRef('pk'),
        status=BroadcastOffer.Status.ACCEPTED,
        mechanic_latitude__isnull=False,
        mechanic_longitude__isnull=False,
    ).order_by('-responded_at', '-id').values('mechanic_latitude')[:1]
    offer_lng_sq = BroadcastOffer.objects.filter(
        mechanic=OuterRef('pk'),
        status=BroadcastOffer.Status.ACCEPTED,
        mechanic_latitude__isnull=False,
        mechanic_longitude__isnull=False,
    ).order_by('-responded_at', '-id').values('mechanic_longitude')[:1]

    mechanics = Mechanic.objects.select_related('account').filter(
        verification_status=Mechanic.VerificationStatus.APPROVED,
        status=Mechanic.WorkStatus.AVAILABLE,
        account__is_active=True,
    ).select_related(
        'shop',
        'shop__shop_owner',
        'shop__shop_owner__account',
    ).annotate(
        live_lat=Subquery(live_lat_sq),
        live_lng=Subquery(live_lng_sq),
        offer_lat=Subquery(offer_lat_sq),
        offer_lng=Subquery(offer_lng_sq),
    )

    mechanic_ids = [m.id for m in mechanics]
    specialty_map = {mid: [] for mid in mechanic_ids}
    for ms in MechanicSpecialty.objects.filter(
        mechanic_id__in=mechanic_ids,
        status=MechanicSpecialty.Status.APPROVED,
    ).select_related('specialty'):
        if ms.specialty and ms.specialty.name not in specialty_map[ms.mechanic_id]:
            specialty_map[ms.mechanic_id].append(ms.specialty.name)

    service_map = {mid: [] for mid in mechanic_ids}
    for msvc in MechanicService.objects.filter(mechanic_id__in=mechanic_ids).select_related('service'):
        if msvc.service and msvc.service.name not in service_map[msvc.mechanic_id]:
            service_map[msvc.mechanic_id].append(msvc.service.name)

    nearby_mechanics = []
    shop_candidates = {}

    for mechanic in mechanics:
        src_lat = mechanic.live_lat if mechanic.live_lat is not None else mechanic.offer_lat
        src_lng = mechanic.live_lng if mechanic.live_lng is not None else mechanic.offer_lng
        if src_lat is None or src_lng is None:
            continue

        try:
            mech_lat = float(src_lat)
            mech_lng = float(src_lng)
        except (TypeError, ValueError):
            continue

        distance_km = _haversine_km(selected_lat, selected_lng, mech_lat, mech_lng)
        if distance_km > radius_km:
            continue

        specialties = specialty_map.get(mechanic.id) or service_map.get(mechanic.id) or []
        specialization = ', '.join(specialties[:2]) if specialties else None
        rating_value = float(mechanic.average_rating) if mechanic.average_rating is not None else 0.0

        nearby_mechanics.append({
            'id': mechanic.id,
            'provider_type': 'mechanic',
            'name': f"{mechanic.account.firstname} {mechanic.account.lastname}".strip(),
            'distance_km': round(distance_km, 2),
            'rating': round(rating_value, 2) if rating_value > 0 else None,
            'specialization': specialization,
            'profile_photo': get_media_url(mechanic.profile_photo, request) if mechanic.profile_photo else None,
        })

        if mechanic.is_working_for_shop and mechanic.shop_id:
            existing = shop_candidates.get(mechanic.shop_id)
            if existing is None:
                shop_candidates[mechanic.shop_id] = {
                    'shop': mechanic.shop,
                    'distance_km': distance_km,
                    'ratings': [rating_value] if rating_value > 0 else [],
                }
            else:
                existing['distance_km'] = min(existing['distance_km'], distance_km)
                if rating_value > 0:
                    existing['ratings'].append(rating_value)

    nearby_shops = []
    if shop_candidates:
        shop_ids = list(shop_candidates.keys())
        shop_service_map = {sid: [] for sid in shop_ids}
        for ss in ShopService.objects.filter(shop_id__in=shop_ids).select_related('service'):
            if ss.service and ss.service.name not in shop_service_map[ss.shop_id]:
                shop_service_map[ss.shop_id].append(ss.service.name)

        valid_shop_ids = set(
            Shop.objects.filter(
                id__in=shop_ids,
                is_verified=True,
                status=Shop.Status.OPEN,
                shop_owner__verification_status='approved',
                shop_owner__account__is_active=True,
            ).values_list('id', flat=True)
        )

        for shop_id, info in shop_candidates.items():
            if shop_id not in valid_shop_ids:
                continue
            shop = info['shop']
            if shop is None:
                continue

            ratings = info['ratings']
            shop_rating = (sum(ratings) / len(ratings)) if ratings else None
            services = shop_service_map.get(shop_id, [])
            specialization = ', '.join(services[:2]) if services else None

            nearby_shops.append({
                'id': shop.id,
                'provider_type': 'shop',
                'name': shop.shop_name,
                'distance_km': round(float(info['distance_km']), 2),
                'rating': round(float(shop_rating), 2) if shop_rating is not None else None,
                'specialization': specialization,
                'profile_photo': get_media_url(shop.service_banner, request) if shop.service_banner else None,
            })

    providers = sorted(nearby_mechanics + nearby_shops, key=lambda item: item['distance_km'])[:3]

    return Response(
        {
            'providers': providers,
            'mechanics': [p for p in providers if p['provider_type'] == 'mechanic'],
            'shops': [p for p in providers if p['provider_type'] == 'shop'],
            'count': len(providers),
        },
        status=status.HTTP_200_OK,
    )

