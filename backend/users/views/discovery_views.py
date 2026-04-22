from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Prefetch

from ..models import Account, Client, FavoriteMechanic, FavoriteShop, Mechanic
from ..serializers import MechanicSerializer, MechanicProfileSerializer
from bookings.models import MechanicLocation, BroadcastOffer
from services.models import MechanicService, MechanicSpecialty, ServiceAddOn
from services.serializers import ServiceAddOnPublicSerializer
from shops.models import Shop
from services.models import ShopService
from MainBackend.storage_utils import get_media_url
from utils.location_utils import haversine_km, mechanic_location_annotations


def _get_authenticated_account(request):
    user = getattr(request, "user", None)
    if user and isinstance(user, Account):
        return user

    account_id = request.session.get("account_id")
    if not account_id:
        return None

    return Account.objects.filter(id=account_id).first()


def _get_current_client(request):
    account = _get_authenticated_account(request)
    if not account or not hasattr(account, "client"):
        return None
    return account.client


def _format_address(address):
    if not address:
        return None

    parts = [
        address.house_building_number,
        address.street_name,
        address.subdivision_village,
        address.barangay,
        address.city_municipality,
        address.province,
        address.region,
        address.postal_code,
    ]
    label = ', '.join(
        str(part).strip() for part in parts if part and str(part).strip()
    )
    return label or None


@api_view(['GET'])
@permission_classes([AllowAny])
def list_mechanics(request):
    """
    Get list of all available mechanics
    Returns mechanic details including profile, ratings, and services
    """
    try:
        account = _get_authenticated_account(request)
        account_id = account.id if account else None
        lat_raw = request.GET.get('lat')
        lng_raw = request.GET.get('lng')
        filter_value = str(request.GET.get('filter', '')).strip().lower()

        selected_lat = selected_lng = None
        try:
            if lat_raw is not None and lng_raw is not None:
                selected_lat = float(lat_raw)
                selected_lng = float(lng_raw)
        except (TypeError, ValueError):
            selected_lat = selected_lng = None

        mechanics = Mechanic.objects.select_related('account').filter(
            verification_status=Mechanic.VerificationStatus.APPROVED,
            account__is_active=True,
        )
        if account_id:
            mechanics = mechanics.exclude(account_id=account_id)

        mechanics = mechanics.annotate(**mechanic_location_annotations('account_id', 'pk'))

        favorite_mechanic_ids = set()
        current_client = account.client if account and hasattr(account, "client") else None
        if current_client:
            favorite_mechanic_ids = set(
                FavoriteMechanic.objects.filter(
                    client=current_client,
                    mechanic__in=mechanics,
                ).values_list("mechanic_id", flat=True)
            )

        mechanics_data = []
        
        for mechanic in mechanics:
            distance_km = None
            if selected_lat is not None and selected_lng is not None:
                src_lat = mechanic.live_lat if mechanic.live_lat is not None else mechanic.offer_lat
                src_lng = mechanic.live_lng if mechanic.live_lng is not None else mechanic.offer_lng
                if src_lat is not None and src_lng is not None:
                    try:
                        distance_km = round(
                            haversine_km(
                                selected_lat,
                                selected_lng,
                                float(src_lat),
                                float(src_lng),
                            ),
                            2,
                        )
                    except (TypeError, ValueError):
                        distance_km = None

            mechanic_info = {
                'id': mechanic.id,
                'account_id': mechanic.account.id,
                'name': f"{mechanic.account.firstname} {mechanic.account.lastname}",
                'profile_photo': get_media_url(mechanic.profile_photo, request) if mechanic.profile_photo else None,
                'contact_number': mechanic.contact_number,
                'average_rating': float(mechanic.average_rating),
                'status': mechanic.status,
                'is_working_for_shop': mechanic.is_working_for_shop,
                'is_favorited': mechanic.id in favorite_mechanic_ids,
                'address': {
                    'house_building_number': mechanic.account.accountaddress.house_building_number,
                    'street_name': mechanic.account.accountaddress.street_name,
                    'subdivision_village': mechanic.account.accountaddress.subdivision_village,
                    'barangay': mechanic.account.accountaddress.barangay,
                    'city_municipality': mechanic.account.accountaddress.city_municipality,
                    'province': mechanic.account.accountaddress.province,
                    'region': mechanic.account.accountaddress.region,
                    'postal_code': mechanic.account.accountaddress.postal_code,
                } if hasattr(mechanic.account, 'accountaddress') else None,
                'address_label': _format_address(getattr(mechanic.account, 'accountaddress', None)),
                'distance_km': distance_km,
            }
            mechanics_data.append(mechanic_info)

        if filter_value == 'nearest' and any(item['distance_km'] is not None for item in mechanics_data):
            mechanics_data.sort(
                key=lambda item: (
                    item['distance_km'] is None,
                    item['distance_km'] if item['distance_km'] is not None else 0,
                )
            )
        
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
        addon_filters = {
            'mechanic_id': mechanic_id,
            'mechanic__isnull': False,
        }
        addon_field_names = {field.name for field in ServiceAddOn._meta.fields}
        if 'is_active' in addon_field_names:
            addon_filters['is_active'] = True

        addon_queryset = ServiceAddOn.objects.select_related(
            'mechanic', 'shop', 'service'
        ).filter(**addon_filters)

        mechanic = Mechanic.objects.select_related(
            'account', 'shop'
        ).prefetch_related(
            'reviews',
            'reviews__reviewer',
            Prefetch('service_add_ons', queryset=addon_queryset, to_attr='public_addons')
        ).get(id=mechanic_id)
        
        serializer = MechanicProfileSerializer(mechanic, context={'request': request})
        addons = ServiceAddOnPublicSerializer(
            getattr(mechanic, 'public_addons', []),
            many=True,
            context={'request': request},
        ).data

        current_client = _get_current_client(request)
        is_favorited = False
        if current_client:
            is_favorited = FavoriteMechanic.objects.filter(
                client=current_client,
                mechanic=mechanic,
            ).exists()
        
        return Response({
            'mechanic': serializer.data,
            'addons': addons,
            'is_favorited': is_favorited,
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
    emergency_mode = str(request.GET.get('emergency', '')).strip().lower() in {'1', 'true', 'yes'}

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

    # Default discovery stays tight. Emergency searches can expand farther.
    default_max_radius_km = 5.0
    emergency_max_radius_km = 20.0
    expansion_step_km = 5.0
    requested_radius_km = radius_km
    if emergency_mode:
        base_radius_km = min(radius_km, emergency_max_radius_km)
    else:
        base_radius_km = min(radius_km, default_max_radius_km)

    mechanics = Mechanic.objects.select_related('account').filter(
        verification_status=Mechanic.VerificationStatus.APPROVED,
        status=Mechanic.WorkStatus.AVAILABLE,
        account__is_active=True,
    ).select_related(
        'shop',
        'shop__shop_owner',
        'shop__shop_owner__account',
    ).annotate(**mechanic_location_annotations('account_id', 'pk'))

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

    all_mechanics_with_distance = []
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

        distance_km = haversine_km(selected_lat, selected_lng, mech_lat, mech_lng)
        specialties = specialty_map.get(mechanic.id) or service_map.get(mechanic.id) or []
        specialization = ', '.join(specialties[:2]) if specialties else None
        rating_value = float(mechanic.average_rating) if mechanic.average_rating is not None else 0.0

        all_mechanics_with_distance.append({
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

    applied_radius_km = base_radius_km
    nearby_mechanics = [m for m in all_mechanics_with_distance if m['distance_km'] <= applied_radius_km]
    if emergency_mode and not nearby_mechanics:
        while applied_radius_km < emergency_max_radius_km and not nearby_mechanics:
            applied_radius_km = min(applied_radius_km + expansion_step_km, emergency_max_radius_km)
            nearby_mechanics = [m for m in all_mechanics_with_distance if m['distance_km'] <= applied_radius_km]

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

            if float(info['distance_km']) > applied_radius_km:
                continue

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
            'requested_radius_km': round(requested_radius_km, 2),
            'applied_radius_km': round(applied_radius_km, 2),
            'is_radius_expanded': bool(emergency_mode and applied_radius_km > base_radius_km),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def list_favorites(request):
    current_client = _get_current_client(request)
    if not current_client:
        return Response(
            {"error": "Client authentication required"},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    favorite_mechanics = FavoriteMechanic.objects.filter(client=current_client).select_related(
        "mechanic",
        "mechanic__account",
    )
    favorite_shops = FavoriteShop.objects.filter(client=current_client).select_related(
        "shop",
        "shop__shop_owner__account",
    )

    mechanics_data = []
    for favorite in favorite_mechanics:
        mechanic = favorite.mechanic
        mechanics_data.append(
            {
                "id": mechanic.id,
                "account_id": mechanic.account.id,
                "name": f"{mechanic.account.firstname} {mechanic.account.lastname}",
                "profile_photo": get_media_url(mechanic.profile_photo, request) if mechanic.profile_photo else None,
                "contact_number": mechanic.contact_number,
                "average_rating": float(mechanic.average_rating),
                "status": mechanic.status,
                "is_working_for_shop": mechanic.is_working_for_shop,
                "is_favorited": True,
            }
        )

    shops_data = []
    for favorite in favorite_shops:
        shop = favorite.shop
        owner_account = shop.shop_owner.account
        shops_data.append(
            {
                "id": shop.id,
                "shop_name": shop.shop_name,
                "owner_name": f"{owner_account.firstname} {owner_account.lastname}",
                "contact_number": shop.contact_number,
                "email": shop.email,
                "website": shop.website,
                "description": shop.description,
                "service_banner": get_media_url(shop.service_banner, request) if shop.service_banner else None,
                "is_verified": shop.is_verified,
                "status": shop.status,
                "is_favorited": True,
            }
        )

    return Response(
        {
            "mechanics": mechanics_data,
            "shops": shops_data,
            "count": len(mechanics_data) + len(shops_data),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def toggle_favorite(request):
    current_client = _get_current_client(request)
    if not current_client:
        return Response(
            {"error": "Client authentication required"},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    provider_type = str(request.data.get("provider_type", "")).strip().lower()
    provider_id = request.data.get("provider_id")

    try:
        provider_id = int(provider_id)
    except (TypeError, ValueError):
        return Response(
            {"error": "provider_id must be a valid integer"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if provider_type == "mechanic":
        mechanic = Mechanic.objects.filter(id=provider_id).first()
        if not mechanic:
            return Response({"error": "Mechanic not found"}, status=status.HTTP_404_NOT_FOUND)

        favorite, created = FavoriteMechanic.objects.get_or_create(
            client=current_client,
            mechanic=mechanic,
        )
        if created:
            return Response(
                {
                    "provider_type": provider_type,
                    "provider_id": provider_id,
                    "is_favorited": True,
                    "message": "Mechanic added to favorites",
                },
                status=status.HTTP_200_OK,
            )

        favorite.delete()
        return Response(
            {
                "provider_type": provider_type,
                "provider_id": provider_id,
                "is_favorited": False,
                "message": "Mechanic removed from favorites",
            },
            status=status.HTTP_200_OK,
        )

    if provider_type == "shop":
        shop = Shop.objects.filter(id=provider_id).first()
        if not shop:
            return Response({"error": "Shop not found"}, status=status.HTTP_404_NOT_FOUND)

        favorite, created = FavoriteShop.objects.get_or_create(
            client=current_client,
            shop=shop,
        )
        if created:
            return Response(
                {
                    "provider_type": provider_type,
                    "provider_id": provider_id,
                    "is_favorited": True,
                    "message": "Shop added to favorites",
                },
                status=status.HTTP_200_OK,
            )

        favorite.delete()
        return Response(
            {
                "provider_type": provider_type,
                "provider_id": provider_id,
                "is_favorited": False,
                "message": "Shop removed from favorites",
            },
            status=status.HTTP_200_OK,
        )

    return Response(
        {"error": "provider_type must be either 'mechanic' or 'shop'"},
        status=status.HTTP_400_BAD_REQUEST,
    )

