from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth.hashers import make_password
from django.utils import timezone
from datetime import timedelta
import secrets

from .models import Account, PasswordReset, Mechanic, Client, ShopOwner
from .serializers import (
    RegisterSerializer, LoginSerializer, AccountSerializer,
    ChangePasswordSerializer, PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer
)


@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    """
    Register a new user account with role (client, mechanic, shop_owner)
    
    Required fields:
    - firstname, lastname, email, username, password, confirm_password
    - role: client, mechanic, or shop_owner
    - street_name, barangay, city_municipality, province, region
    
    Optional fields:
    - middlename, date_of_birth, gender
    - house_building_number, subdivision_village, postal_code
    - contact_number
    """
    serializer = RegisterSerializer(data=request.data)
    if serializer.is_valid():
        account = serializer.save()
        return Response({
            'message': 'Account created successfully',
            'account': AccountSerializer(account).data
        }, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    """
    Login with username and password
    
    Returns account details and session
    """
    serializer = LoginSerializer(data=request.data)
    if serializer.is_valid():
        account = serializer.validated_data['account']
        
        # Create session
        request.session['account_id'] = account.id
        request.session['username'] = account.username
        
        # Get user roles
        roles = list(account.accountrole_set.values_list('account_role', flat=True))
        request.session['roles'] = roles
        
        return Response({
            'message': 'Login successful',
            'account': AccountSerializer(account).data
        }, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout(request):
    """
    Logout current user
    """
    try:
        request.session.flush()
        return Response({
            'message': 'Logout successful'
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_current_user(request):
    """
    Get current logged in user details
    """
    try:
        account_id = request.session.get('account_id')
        account = Account.objects.get(id=account_id)
        return Response({
            'account': AccountSerializer(account).data
        }, status=status.HTTP_200_OK)
    except Account.DoesNotExist:
        return Response({
            'error': 'Account not found'
        }, status=status.HTTP_404_NOT_FOUND)


@api_view(['PUT', 'PATCH'])
@permission_classes([IsAuthenticated])
def update_profile(request):
    """
    Update current user's profile information
    """
    try:
        account_id = request.session.get('account_id')
        account = Account.objects.get(id=account_id)
        
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
        
    except Account.DoesNotExist:
        return Response({
            'error': 'Account not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    """
    Change password for current user
    
    Required fields:
    - old_password
    - new_password
    - confirm_password
    """
    try:
        account_id = request.session.get('account_id')
        account = Account.objects.get(id=account_id)
        
        serializer = ChangePasswordSerializer(
            data=request.data,
            context={'request': type('obj', (object,), {'user': account})()}
        )
        
        if serializer.is_valid():
            account.password = make_password(serializer.validated_data['new_password'])
            account.save()
            
            return Response({
                'message': 'Password changed successfully'
            }, status=status.HTTP_200_OK)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
    except Account.DoesNotExist:
        return Response({
            'error': 'Account not found'
        }, status=status.HTTP_404_NOT_FOUND)


@api_view(['POST'])
@permission_classes([AllowAny])
def request_password_reset(request):
    """
    Request password reset via email
    
    Required fields:
    - email
    
    Sends reset token (in production, this should be sent via email)
    """
    serializer = PasswordResetRequestSerializer(data=request.data)
    if serializer.is_valid():
        email = serializer.validated_data['email']
        account = Account.objects.get(email=email)
        
        # Generate reset token
        reset_token = secrets.token_urlsafe(32)
        expires_at = timezone.now() + timedelta(hours=1)
        
        # Expire any existing pending resets
        PasswordReset.objects.filter(
            account=account,
            status=PasswordReset.Status.PENDING
        ).update(status=PasswordReset.Status.EXPIRED)
        
        # Create new reset request
        PasswordReset.objects.create(
            account=account,
            reset_token=reset_token,
            expires_at=expires_at
        )
        
        # TODO: Send email with reset token
        # For now, return it in response (REMOVE IN PRODUCTION)
        return Response({
            'message': 'Password reset token generated',
            'reset_token': reset_token,  # Remove this in production
            'note': 'In production, this token should be sent via email'
        }, status=status.HTTP_200_OK)
    
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def confirm_password_reset(request):
    """
    Confirm password reset with token
    
    Required fields:
    - reset_token
    - new_password
    - confirm_password
    """
    serializer = PasswordResetConfirmSerializer(data=request.data)
    if serializer.is_valid():
        reset_token = serializer.validated_data['reset_token']
        new_password = serializer.validated_data['new_password']
        
        # Get reset request
        reset = PasswordReset.objects.get(
            reset_token=reset_token,
            status=PasswordReset.Status.PENDING
        )
        
        # Update password
        account = reset.account
        account.password = make_password(new_password)
        account.save()
        
        # Mark reset as used
        reset.status = PasswordReset.Status.USED
        reset.used_at = timezone.now()
        reset.save()
        
        return Response({
            'message': 'Password reset successful'
        }, status=status.HTTP_200_OK)
    
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def check_session(request):
    """
    Check if session is valid and return user info
    """
    try:
        account_id = request.session.get('account_id')
        if not account_id:
            return Response({
                'authenticated': False
            }, status=status.HTTP_401_UNAUTHORIZED)
        
        account = Account.objects.get(id=account_id)
        return Response({
            'authenticated': True,
            'account': AccountSerializer(account).data
        }, status=status.HTTP_200_OK)
    except Account.DoesNotExist:
        return Response({
            'authenticated': False
        }, status=status.HTTP_401_UNAUTHORIZED)


@api_view(['GET'])
@permission_classes([AllowAny])
def list_mechanics(request):
    """
    Get list of all available mechanics
    Returns mechanic details including profile, ratings, and services
    """
    try:
        mechanics = Mechanic.objects.select_related('account').all()
        mechanics_data = []
        
        for mechanic in mechanics:
            mechanic_info = {
                'id': mechanic.id,
                'account_id': mechanic.account.id,
                'name': f"{mechanic.account.firstname} {mechanic.account.lastname}",
                'profile_photo': mechanic.profile_photo.url if mechanic.profile_photo else None,
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
