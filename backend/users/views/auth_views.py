from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
import random
from datetime import timedelta

from ..models import Account, AccountRole, EmailVerification
from ..serializers import (
    RegisterSerializer, LoginSerializer, AccountSerializer
)
import jwt
from django.conf import settings
from datetime import datetime, timedelta


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
        
        # Set active role: use last_active_role if available, otherwise default to client
        if account.last_active_role and account.last_active_role in roles:
            # User's last active role is still valid
            request.session['active_role'] = account.last_active_role
        elif 'client' in roles:
            request.session['active_role'] = 'client'
        elif roles:
            request.session['active_role'] = roles[0]
        else:
            request.session['active_role'] = 'client'  # Default to client
        
        # create JWT token to return for API/mobile clients
        try:
            exp = datetime.utcnow() + timedelta(minutes=60)
            payload = {
                'account_id': account.id,
                'exp': exp,
            }
            token = jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')
        except Exception:
            token = None

        resp = {
            'message': 'Login successful',
            'account': AccountSerializer(account).data,
            'active_role': request.session['active_role']
        }
        if token:
            resp.update({'token': token, 'expires_at': exp.isoformat()})

        return Response(resp, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def token_login(request):
    """
    Obtain a simple JWT for API use. Returns { token, expires_at }.
    """
    serializer = LoginSerializer(data=request.data)
    if serializer.is_valid():
        account = serializer.validated_data['account']
        # create token payload
        exp = datetime.utcnow() + timedelta(minutes=60)
        payload = {
            'account_id': account.id,
            'exp': exp,
        }
        token = jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')
        return Response({'token': token, 'expires_at': exp.isoformat(), 'account': AccountSerializer(account).data}, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def logout(request):
    """
    Logout current user and save their last active role
    """
    try:
        # Save the current active role before logging out
        account_id = request.session.get('account_id')
        active_role = request.session.get('active_role')
        
        if account_id and active_role:
            try:
                account = Account.objects.get(id=account_id)
                account.last_active_role = active_role
                account.save(update_fields=['last_active_role'])
            except Account.DoesNotExist:
                pass  # Account not found, continue with logout
        
        request.session.flush()
        return Response({
            'message': 'Logout successful'
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([AllowAny])
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


@api_view(['POST'])
@permission_classes([AllowAny])
def send_verification_code(request):
    """
    Send a 6-digit verification code to the provided email
    """
    email = request.data.get('email')
    
    if not email:
        return Response({
            'error': 'Email is required'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # Check if email already exists in Account
    if Account.objects.filter(email=email).exists():
        return Response({
            'error': 'Email is already registered'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # Generate 6-digit code
    verification_code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
    
    # Set expiration time (15 minutes from now)
    expires_at = timezone.now() + timedelta(minutes=15)
    
    # Expire any existing pending codes for this email
    EmailVerification.objects.filter(
        email=email,
        status=EmailVerification.Status.PENDING
    ).update(status=EmailVerification.Status.EXPIRED)
    
    # Create new verification record
    verification = EmailVerification.objects.create(
        email=email,
        verification_code=verification_code,
        expires_at=expires_at
    )
    
    # Send email
    try:
        subject = 'MechConnect - Email Verification Code'
        message = f'''
Hello,

Your verification code for MechConnect registration is: {verification_code}

This code will expire in 15 minutes.

If you did not request this code, please ignore this email.

Best regards,
MechConnect Team
        '''
        send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [email],
            fail_silently=False,
        )
        
        return Response({
            'message': 'Verification code sent successfully',
            'expires_in_minutes': 15
        }, status=status.HTTP_200_OK)
    except Exception as e:
        # Log the error but still return success to not expose email sending issues
        print(f"Email sending error: {str(e)}")
        return Response({
            'message': 'Verification code generated successfully',
            'expires_in_minutes': 15,
            'note': 'Email service may be unavailable. In development, check console for code.'
        }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_code(request):
    """
    Verify the 6-digit code for email verification
    """
    email = request.data.get('email')
    code = request.data.get('code')
    
    if not email or not code:
        return Response({
            'error': 'Email and code are required'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # Get the most recent pending verification for this email
        verification = EmailVerification.objects.filter(
            email=email,
            status=EmailVerification.Status.PENDING
        ).order_by('-created_at').first()
        
        if not verification:
            return Response({
                'error': 'No pending verification found for this email'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if code has expired
        if timezone.now() > verification.expires_at:
            verification.status = EmailVerification.Status.EXPIRED
            verification.save()
            return Response({
                'error': 'Verification code has expired. Please request a new code.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Verify the code
        if verification.verification_code != code:
            return Response({
                'error': 'Invalid verification code'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Mark as verified
        verification.status = EmailVerification.Status.VERIFIED
        verification.verified_at = timezone.now()
        verification.save()
        
        return Response({
            'message': 'Email verified successfully'
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'error': f'Verification failed: {str(e)}'
        }, status=status.HTTP_400_BAD_REQUEST)
