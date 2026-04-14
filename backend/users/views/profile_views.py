from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from datetime import timedelta

from ..models import Account, EmailVerification
from ..serializers import (
    AccountSerializer,
    VerifyCurrentPasswordSerializer,
    ChangeEmailSerializer,
)


def _get_authenticated_account(request):
    user = getattr(request, 'user', None)
    if getattr(user, 'is_authenticated', False):
        return user

    account_id = request.session.get('account_id')
    if not account_id:
        return None

    return Account.objects.filter(id=account_id).first()


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
        if hasattr(account, 'accountaddress'):
            address = account.accountaddress
            address_fields = [
                'house_building_number', 'street_name', 'subdivision_village',
                'barangay', 'city_municipality', 'province', 'region', 'postal_code'
            ]
            for field in address_fields:
                if field in request.data:
                    setattr(address, field, request.data[field])
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
        serializer = ProfileDetailSerializer(account)
        
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
            if hasattr(account, 'accountaddress'):
                address = account.accountaddress
                address_fields = [
                    'house_building_number', 'street_name', 'subdivision_village',
                    'barangay', 'city_municipality', 'province', 'region', 'postal_code'
                ]
                for field in address_fields:
                    if field in serializer.validated_data:
                        setattr(address, field, serializer.validated_data[field])
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
            
            from ..serializers import ProfileDetailSerializer
            return Response({
                'message': 'Settings updated successfully',
                'profile': ProfileDetailSerializer(account).data
            }, status=status.HTTP_200_OK)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


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
