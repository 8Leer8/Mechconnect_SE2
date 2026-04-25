from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from datetime import timedelta
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from ..models import Account, EmailVerification
from ..serializers import (
    AccountSerializer,
    VerifyCurrentPasswordSerializer,
    ChangeEmailSerializer,
)
from ..deactivation_utils import (
    create_account_verification_code,
    deactivate_account,
    get_account_deactivation_blockers,
    get_deactivation_deadline,
    purge_expired_deactivated_account,
    validate_account_verification_code,
)
from shops.models import Shop


def _get_authenticated_account(request):
    user = getattr(request, 'user', None)
    if getattr(user, 'is_authenticated', False):
        return user

    account_id = request.session.get('account_id')
    if not account_id:
        return None

    account = Account.objects.filter(id=account_id).first()
    if not account:
        return None

    deleted, _deadline = purge_expired_deactivated_account(account)
    if deleted or not account.is_active:
        return None

    return account


def _broadcast_provider_status_update(provider_role, provider_id, raw_status):
    """Notify connected client sockets so discovery can refresh provider availability."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    payload = {
        'type': 'notification_update',
        'action': 'provider_status_updated',
        'provider_role': provider_role,
        'provider_id': provider_id,
        'status': raw_status,
    }

    client_account_ids = Account.objects.filter(client__isnull=False).values_list('id', flat=True)
    for account_id in client_account_ids:
        async_to_sync(channel_layer.group_send)(f'user_{account_id}', payload)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_current_user(request):
    """
    Get current logged in user details
    """
    account = _get_authenticated_account(request)
    if not account:
        return Response({
            'error': 'Account not found'
        }, status=status.HTTP_404_NOT_FOUND)

    return Response({
        'account': AccountSerializer(account).data
    }, status=status.HTTP_200_OK)


@api_view(['PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def update_profile(request):
    """
    Update current user's profile information
    """
    try:
        account = _get_authenticated_account(request)
        if not account:
            return Response({
                'error': 'Authentication required'
            }, status=status.HTTP_401_UNAUTHORIZED)
        
        # Update account fields
        allowed_fields = ['firstname', 'lastname', 'middlename', 'date_of_birth', 'gender']
        for field in allowed_fields:
            if field in request.data:
                setattr(account, field, request.data[field])
        
        account.save()
        
        # Update address if provided
        address = getattr(account, 'accountaddress', None)
        if not address and any(field in request.data for field in [
            'house_building_number', 'street_name', 'subdivision_village',
            'barangay', 'city_municipality', 'province', 'region', 'postal_code',
            'lat', 'lng', 'formatted_address', 'label', 'is_main'
        ]):
            from ..models import AccountAddress

            address = AccountAddress.objects.create(
                account=account,
                house_building_number=request.data.get('house_building_number') or None,
                street_name=request.data.get('street_name') or '',
                subdivision_village=request.data.get('subdivision_village') or None,
                barangay=request.data.get('barangay') or '',
                city_municipality=request.data.get('city_municipality') or '',
                province=request.data.get('province') or '',
                region=request.data.get('region') or '',
                postal_code=request.data.get('postal_code') or None,
                lat=request.data.get('lat') or None,
                lng=request.data.get('lng') or None,
                formatted_address=request.data.get('formatted_address') or None,
                label='Main Branch',
                is_main=True,
            )
        address_fields = [
            'lat', 'lng', 'formatted_address', 'label', 'is_main',
            'house_building_number', 'street_name', 'subdivision_village',
            'barangay', 'city_municipality', 'province', 'region', 'postal_code'
        ]
        if address:
            for field in address_fields:
                if field in request.data:
                    setattr(address, field, request.data[field])
            if not getattr(address, 'label', None):
                address.label = 'Main Branch'
            address.is_main = True
            address.save()
        
        # Update role-specific profile
        profile = None
        if hasattr(account, 'client'):
            profile = account.client
        elif hasattr(account, 'mechanic'):
            profile = account.mechanic
        elif hasattr(account, 'shopowner'):
            profile = account.shopowner
        
        if profile and 'contact_number' in request.data:
            profile.contact_number = request.data['contact_number']
            profile.save()
        
        if profile and 'profile_photo' in request.FILES:
            profile.profile_photo = request.FILES['profile_photo']
            profile.save()
        
        return Response({
            'message': 'Profile updated successfully',
            'account': AccountSerializer(account).data
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_profile_details(request):
    """
    Get detailed profile information for profile page
    Includes:
    - User information (name, email, etc.)
    - User type/roles
    - Available roles for switching
    - Profile data for each role
    - Address information
    """
    account = _get_authenticated_account(request)
    if not account:
        return Response({
            'error': 'Authentication required'
        }, status=status.HTTP_401_UNAUTHORIZED)

    try:
        from ..serializers import ProfileDetailSerializer
        serializer = ProfileDetailSerializer(account, context={'request': request})
        
        return Response({
            'profile': serializer.data
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PUT', 'PATCH'])
@permission_classes([AllowAny])
def update_profile_settings(request):
    """
    Update profile settings including personal info, contact, and address
    
    Accepts partial updates for:
    - Personal: firstname, lastname, middlename, date_of_birth, gender
    - Contact: contact_number
    - Address: house_building_number, street_name, subdivision_village,
               barangay, city_municipality, province, region, postal_code
    - Profile photo: profile_photo (file upload)
    """
    account = _get_authenticated_account(request)
    if not account:
        return Response({
            'error': 'Authentication required'
        }, status=status.HTTP_401_UNAUTHORIZED)

    try:
        from ..serializers import ProfileSettingsSerializer
        serializer = ProfileSettingsSerializer(data=request.data, partial=True)
        
        if serializer.is_valid():
            # Update account fields
            account_fields = ['firstname', 'lastname', 'middlename', 'date_of_birth', 'gender']
            for field in account_fields:
                if field in serializer.validated_data:
                    setattr(account, field, serializer.validated_data[field])
            account.save()
            
            # Update address
            address = getattr(account, 'accountaddress', None)
            if not address and any(field in serializer.validated_data for field in [
                'house_building_number', 'street_name', 'subdivision_village',
                'barangay', 'city_municipality', 'province', 'region', 'postal_code',
                'lat', 'lng', 'formatted_address', 'label', 'is_main'
            ]):
                from ..models import AccountAddress

                address = AccountAddress.objects.create(
                    account=account,
                    house_building_number=serializer.validated_data.get('house_building_number') or None,
                    street_name=serializer.validated_data.get('street_name') or '',
                    subdivision_village=serializer.validated_data.get('subdivision_village') or None,
                    barangay=serializer.validated_data.get('barangay') or '',
                    city_municipality=serializer.validated_data.get('city_municipality') or '',
                    province=serializer.validated_data.get('province') or '',
                    region=serializer.validated_data.get('region') or '',
                    postal_code=serializer.validated_data.get('postal_code') or None,
                    lat=serializer.validated_data.get('lat'),
                    lng=serializer.validated_data.get('lng'),
                    formatted_address=serializer.validated_data.get('formatted_address') or None,
                    label='Main Branch',
                    is_main=True,
                )
            address_fields = [
                'lat', 'lng', 'formatted_address', 'label', 'is_main',
                'house_building_number', 'street_name', 'subdivision_village',
                'barangay', 'city_municipality', 'province', 'region', 'postal_code'
            ]
            if address:
                for field in address_fields:
                    if field in serializer.validated_data:
                        setattr(address, field, serializer.validated_data[field])
                if not getattr(address, 'label', None):
                    address.label = 'Main Branch'
                address.is_main = True
                address.save()
            
            # Update contact number and profile photo in role-specific profile
            profiles = []
            if hasattr(account, 'client'):
                profiles.append(account.client)
            if hasattr(account, 'mechanic'):
                profiles.append(account.mechanic)
            if hasattr(account, 'shopowner'):
                profiles.append(account.shopowner)
            if hasattr(account, 'admin'):
                profiles.append(account.admin)
            
            for profile in profiles:
                if 'contact_number' in serializer.validated_data:
                    profile.contact_number = serializer.validated_data['contact_number']
                if 'profile_photo' in request.FILES:
                    profile.profile_photo = request.FILES['profile_photo']
                profile.save()

            # Update mechanic-only fields
            if hasattr(account, 'mechanic') and 'bio' in serializer.validated_data:
                account.mechanic.bio = serializer.validated_data['bio'] or None
                account.mechanic.save(update_fields=['bio'])

            # Update shop-owner shop fields
            has_shop_updates = any(
                field in serializer.validated_data
                for field in ['shop_name', 'shop_contact_number', 'shop_email', 'website', 'description']
            ) or 'service_banner' in request.FILES

            if has_shop_updates and hasattr(account, 'shopowner'):
                from shops.models import Shop

                shop = Shop.objects.filter(shop_owner=account.shopowner).first()
                if not shop:
                    return Response({
                        'error': 'Shop profile not found for this account'
                    }, status=status.HTTP_404_NOT_FOUND)

                update_fields = []

                if 'shop_name' in serializer.validated_data:
                    shop_name = (serializer.validated_data['shop_name'] or '').strip()
                    if not shop_name:
                        return Response({
                            'shop_name': ['Shop name cannot be blank']
                        }, status=status.HTTP_400_BAD_REQUEST)
                    shop.shop_name = shop_name
                    update_fields.append('shop_name')

                if 'shop_contact_number' in serializer.validated_data:
                    value = (serializer.validated_data['shop_contact_number'] or '').strip()
                    shop.contact_number = value if value else None
                    update_fields.append('contact_number')

                if 'shop_email' in serializer.validated_data:
                    value = (serializer.validated_data['shop_email'] or '').strip()
                    shop.email = value if value else None
                    update_fields.append('email')

                if 'website' in serializer.validated_data:
                    value = (serializer.validated_data['website'] or '').strip()
                    shop.website = value if value else None
                    update_fields.append('website')

                if 'description' in serializer.validated_data:
                    value = (serializer.validated_data['description'] or '').strip()
                    shop.description = value if value else None
                    update_fields.append('description')

                if 'service_banner' in request.FILES:
                    shop.service_banner = request.FILES['service_banner']
                    update_fields.append('service_banner')

                if update_fields:
                    shop.save(update_fields=update_fields)
            
            from ..serializers import ProfileDetailSerializer
            return Response({
                'message': 'Settings updated successfully',
                'profile': ProfileDetailSerializer(account, context={'request': request}).data
            }, status=status.HTTP_200_OK)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PATCH'])
@permission_classes([AllowAny])
def update_availability_status(request):
    """
    Update provider availability for discovery listings.

    Accepts:
    - role: mechanic | shop_owner (optional, defaults to active session role)
    - status: available | unavailable
    """
    account = _get_authenticated_account(request)
    if not account:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    role = str(request.data.get('role') or request.session.get('active_role') or '').strip().lower()
    desired_status = str(request.data.get('status') or '').strip().lower()

    if desired_status not in {'available', 'unavailable'}:
        return Response(
            {'error': "status must be either 'available' or 'unavailable'"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if role in {'mechanic'}:
        if not hasattr(account, 'mechanic'):
            return Response({'error': 'Mechanic profile not found'}, status=status.HTTP_404_NOT_FOUND)

        mechanic = account.mechanic
        mechanic.status = (
            mechanic.WorkStatus.AVAILABLE
            if desired_status == 'available'
            else mechanic.WorkStatus.WORKING
        )
        mechanic.save(update_fields=['status', 'updated_at'])
        _broadcast_provider_status_update('mechanic', mechanic.id, mechanic.status)

        return Response(
            {
                'message': 'Availability updated successfully',
                'role': 'mechanic',
                'status': desired_status,
                'raw_status': mechanic.status,
            },
            status=status.HTTP_200_OK,
        )

    if role in {'shop_owner', 'shopowner'}:
        if not hasattr(account, 'shopowner'):
            return Response({'error': 'Shop owner profile not found'}, status=status.HTTP_404_NOT_FOUND)

        shop = Shop.objects.filter(shop_owner=account.shopowner).first()
        if not shop:
            return Response({'error': 'Shop not found'}, status=status.HTTP_404_NOT_FOUND)

        shop.status = Shop.Status.OPEN if desired_status == 'available' else Shop.Status.CLOSED
        shop.save(update_fields=['status', 'updated_at'])
        _broadcast_provider_status_update('shop', shop.id, shop.status)

        return Response(
            {
                'message': 'Availability updated successfully',
                'role': 'shop_owner',
                'status': desired_status,
                'raw_status': shop.status,
            },
            status=status.HTTP_200_OK,
        )

    return Response(
        {'error': "role must be 'mechanic' or 'shop_owner'"},
        status=status.HTTP_400_BAD_REQUEST,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def verify_profile_password(request):
    """
    Verify current password before sensitive profile actions.
    """
    account = _get_authenticated_account(request)
    if not account:
        return Response({
            'error': 'Authentication required'
        }, status=status.HTTP_401_UNAUTHORIZED)

    serializer = VerifyCurrentPasswordSerializer(
        data=request.data,
        context={'account': account},
    )
    if serializer.is_valid():
        return Response({
            'message': 'Password verified successfully'
        }, status=status.HTTP_200_OK)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def request_account_deactivation(request):
    """
    Start the account deactivation flow by verifying the current password and sending an OTP.
    """
    account = _get_authenticated_account(request)
    if not account:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    serializer = VerifyCurrentPasswordSerializer(
        data=request.data,
        context={'account': account},
    )
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    blockers = get_account_deactivation_blockers(account)
    if blockers:
        return Response(
            {
                'error': 'Resolve the blocked items before deactivating your account.',
                'blockers': blockers,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    verification_payload = create_account_verification_code(
        account,
        subject='MechConnect - Deactivate Account Verification Code',
    )

    return Response(
        {
            'message': 'Verification code sent to your email.',
            **verification_payload,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def confirm_account_deactivation(request):
    """
    Confirm account deactivation after password and email OTP verification.
    """
    account = _get_authenticated_account(request)
    if not account:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    serializer = VerifyCurrentPasswordSerializer(
        data=request.data,
        context={'account': account},
    )
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    code = request.data.get('code')
    verification, error = validate_account_verification_code(account, code)
    if error:
        return Response({'error': error}, status=status.HTTP_400_BAD_REQUEST)

    deactivate_account(account)
    deactivation_deadline = get_deactivation_deadline(account)

    if request.session.get('account_id'):
        request.session.flush()

    return Response(
        {
            'message': 'Account deactivated successfully.',
            'email_verification_id': verification.id,
            'deactivated_at': account.deactivated_at.isoformat() if account.deactivated_at else None,
            'reactivate_by': deactivation_deadline.isoformat() if deactivation_deadline else None,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_profile_email(request):
    """
    Update the authenticated account email after OTP verification.
    """
    account = _get_authenticated_account(request)
    if not account:
        return Response({
            'error': 'Authentication required'
        }, status=status.HTTP_401_UNAUTHORIZED)

    serializer = ChangeEmailSerializer(
        data=request.data,
        context={'account': account},
    )
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    new_email = serializer.validated_data['new_email']
    update_shop_email = serializer.validated_data.get('update_shop_email', True)

    verification = EmailVerification.objects.filter(
        email__iexact=new_email,
        status=EmailVerification.Status.VERIFIED,
    ).order_by('-verified_at', '-created_at').first()

    if not verification or not verification.verified_at:
        return Response({
            'error': 'Please verify your new email with OTP first'
        }, status=status.HTTP_400_BAD_REQUEST)

    if timezone.now() - verification.verified_at > timedelta(minutes=30):
        return Response({
            'error': 'OTP verification has expired. Please verify your new email again.'
        }, status=status.HTTP_400_BAD_REQUEST)

    old_email = account.email
    account.email = new_email
    account.save(update_fields=['email'])

    shop_email_updated = False
    if update_shop_email and hasattr(account, 'shopowner'):
        from shops.models import Shop

        shop = Shop.objects.filter(shop_owner=account.shopowner).first()
        if shop:
            old_email_norm = (old_email or '').strip().lower()
            shop_email_norm = (shop.email or '').strip().lower()
            if not shop.email or shop_email_norm == old_email_norm:
                shop.email = new_email
                shop.save(update_fields=['email'])
                shop_email_updated = True

    EmailVerification.objects.filter(
        email__iexact=new_email,
        status=EmailVerification.Status.PENDING,
    ).update(status=EmailVerification.Status.EXPIRED)

    return Response({
        'message': 'Email updated successfully',
        'account': AccountSerializer(account).data,
        'shop_email_updated': shop_email_updated,
    }, status=status.HTTP_200_OK)
