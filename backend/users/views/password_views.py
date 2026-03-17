from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth.hashers import make_password
from django.utils import timezone
from datetime import timedelta
import logging
import secrets
from urllib.parse import urlencode
from django.conf import settings

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
    Request password reset via email
    
    Required fields:
    - email
    
    Sends reset token via email
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
        
        reset_base_url = getattr(
            settings,
            'FRONTEND_PASSWORD_RESET_URL',
            f"{request.scheme}://{request.get_host()}/reset-password",
        )
        reset_url = f"{reset_base_url}?{urlencode({'token': reset_token})}"
        first_name = account.firstname or account.username or 'there'

        email_sent = send_html_email(
            to_email=email,
            subject='MechConnect - Reset Your Password',
            html_content=build_password_reset_email_html(
                first_name=first_name,
                reset_url=reset_url,
                expires_in_hours=1,
            ),
        )

        if not email_sent:
            logger.warning('Password reset token generated but email sending failed for %s', email)

        return Response({
            'message': 'Password reset token generated and email dispatched' if email_sent else 'Password reset token generated',
            'reset_token': reset_token,  # Remove this in production
            'note': 'In production, this token should only be sent via email'
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
