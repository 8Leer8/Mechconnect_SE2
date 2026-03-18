from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth.hashers import make_password
from django.utils import timezone
from datetime import timedelta
import logging
import random

from ..models import Account, PasswordReset
from ..serializers import (
    ChangePasswordSerializer, PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer
)
from utils.email import build_password_reset_email_html, send_html_email


logger = logging.getLogger(__name__)


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
    Request password reset via email code
    
    Required fields:
    - email

    Sends 6-digit reset code via email
    """
    serializer = PasswordResetRequestSerializer(data=request.data)
    if serializer.is_valid():
        email = serializer.validated_data['email']
        account = Account.objects.get(email=email)

        # Generate unique 6-digit reset code
        reset_token = None
        for _ in range(30):
            candidate = ''.join(str(random.randint(0, 9)) for _ in range(6))
            if not PasswordReset.objects.filter(reset_token=candidate).exists():
                reset_token = candidate
                break

        if not reset_token:
            return Response({
                'error': 'Unable to generate reset code. Please try again.'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        expires_at = timezone.now() + timedelta(minutes=15)
        
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
        
        first_name = account.firstname or account.username or 'there'

        email_sent = send_html_email(
            to_email=email,
            subject='MechConnect - Your Password Reset Code',
            html_content=build_password_reset_email_html(
                first_name=first_name,
                reset_code=reset_token,
                expires_in_minutes=15,
            ),
        )

        if not email_sent:
            logger.warning('Password reset code generated but email sending failed for %s', email)

        return Response({
            'message': 'Password reset code sent to your email' if email_sent else 'Password reset code generated',
            'expires_in_minutes': 15,
            'note': None if email_sent else 'Email service may be unavailable. Please try again shortly.'
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
