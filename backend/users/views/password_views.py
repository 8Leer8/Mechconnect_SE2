from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth.hashers import make_password
from django.utils import timezone
from datetime import timedelta
import logging
import random

from ..models import Account, PasswordReset, EmailVerification
from ..serializers import (
    ChangePasswordSerializer, PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer
)
from utils.email import (
    build_verification_email_html,
    build_password_reset_email_html,
    send_html_email,
    send_html_email_async,
)


logger = logging.getLogger(__name__)


def _get_authenticated_account(request):
    user = getattr(request, 'user', None)
    if getattr(user, 'is_authenticated', False):
        return user

    account_id = request.session.get('account_id')
    if not account_id:
        return None

    return Account.objects.filter(id=account_id).first()


def _mask_email(email):
    email = (email or '').strip()
    if '@' not in email:
        return email or '***'

    local_part, domain = email.split('@', 1)
    if len(local_part) <= 2:
        masked_local = f"{local_part[:1]}***"
    else:
        masked_local = f"{local_part[:1]}***{local_part[-1:]}"

    return f"{masked_local}@{domain}"


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_password_change_verification_code(request):
    """
    Send OTP verification to the authenticated account email before password change.
    """
    account = _get_authenticated_account(request)
    if not account:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    email = (account.email or '').strip().lower()
    if not email:
        return Response({'error': 'No email found for this account'}, status=status.HTTP_400_BAD_REQUEST)

    verification_code = ''.join(str(random.randint(0, 9)) for _ in range(6))
    expires_at = timezone.now() + timedelta(minutes=15)

    EmailVerification.objects.filter(
        email__iexact=email,
        status=EmailVerification.Status.PENDING,
    ).update(status=EmailVerification.Status.EXPIRED)

    EmailVerification.objects.create(
        email=email,
        verification_code=verification_code,
        expires_at=expires_at,
    )

    first_name = account.firstname or account.username or 'there'

    queued = send_html_email_async(
        to_email=email,
        subject='MechConnect - Your Verification Code',
        html_content=build_verification_email_html(
            first_name=first_name,
            verification_code=verification_code,
            expires_in_minutes=15,
        ),
    )

    if queued:
        return Response(
            {
                'message': 'Verification code sent successfully',
                'expires_in_minutes': 15,
                'email': _mask_email(email),
                'note': 'Email may take up to 60 seconds to appear in inbox.',
            },
            status=status.HTTP_200_OK,
        )

    email_sent = send_html_email(
        to_email=email,
        subject='MechConnect - Your Verification Code',
        html_content=build_verification_email_html(
            first_name=first_name,
            verification_code=verification_code,
            expires_in_minutes=15,
        ),
    )

    if not email_sent:
        logger.warning('Password change OTP generated but email failed for %s', email)
        return Response(
            {
                'message': 'Verification code generated',
                'expires_in_minutes': 15,
                'email': _mask_email(email),
                'note': 'Email service may be unavailable. Please try again shortly.',
            },
            status=status.HTTP_200_OK,
        )

    return Response(
        {
            'message': 'Verification code sent successfully',
            'expires_in_minutes': 15,
            'email': _mask_email(email),
            'note': 'Email may take up to 60 seconds to appear in inbox.',
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def verify_password_change_gmail_code(request):
    """
    Verify 6-digit OTP for password change against authenticated account email.
    """
    account = _get_authenticated_account(request)
    if not account:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    code = (request.data.get('code') or '').strip()
    if not code:
        return Response({'error': 'Code is required'}, status=status.HTTP_400_BAD_REQUEST)

    normalized_code = ''.join(ch for ch in code if ch.isdigit())
    if len(normalized_code) != 6:
        return Response({'error': 'Please enter a valid 6-digit code'}, status=status.HTTP_400_BAD_REQUEST)

    email = (account.email or '').strip().lower()
    pending_qs = EmailVerification.objects.filter(
        email__iexact=email,
        status=EmailVerification.Status.PENDING,
    )

    verification = pending_qs.filter(
        verification_code=normalized_code,
    ).order_by('-created_at').first()

    if not verification:
        latest_pending = pending_qs.order_by('-created_at').first()
        if not latest_pending:
            return Response(
                {'error': 'No pending verification found. Please tap Verify using Gmail first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if timezone.now() > latest_pending.expires_at:
            pending_qs.update(status=EmailVerification.Status.EXPIRED)
            return Response(
                {'error': 'Verification code has expired. Please request a new one.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({'error': 'Invalid verification code'}, status=status.HTTP_400_BAD_REQUEST)

    if timezone.now() > verification.expires_at:
        verification.status = EmailVerification.Status.EXPIRED
        verification.save(update_fields=['status'])
        return Response(
            {'error': 'Verification code has expired. Please request a new one.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    verification.status = EmailVerification.Status.VERIFIED
    verification.verified_at = timezone.now()
    verification.save(update_fields=['status', 'verified_at'])

    # Invalidate any other pending codes for the same email once one is verified.
    pending_qs.exclude(id=verification.id).update(status=EmailVerification.Status.EXPIRED)

    return Response({'message': 'Gmail verification successful'}, status=status.HTTP_200_OK)


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
    account = _get_authenticated_account(request)
    if not account:
        return Response({
            'error': 'Authentication required'
        }, status=status.HTTP_401_UNAUTHORIZED)

    serializer = ChangePasswordSerializer(
        data=request.data,
        context={'account': account}
    )

    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    email = (account.email or '').strip().lower()
    latest_verified = EmailVerification.objects.filter(
        email__iexact=email,
        status=EmailVerification.Status.VERIFIED,
    ).order_by('-verified_at', '-created_at').first()

    if not latest_verified or not latest_verified.verified_at:
        return Response(
            {'error': 'Please verify using Gmail first.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if timezone.now() - latest_verified.verified_at > timedelta(minutes=15):
        return Response(
            {'error': 'Gmail verification expired. Please verify again.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    account.password = make_password(serializer.validated_data['new_password'])
    account.save(update_fields=['password'])

    EmailVerification.objects.filter(
        email__iexact=email,
        status=EmailVerification.Status.PENDING,
    ).update(status=EmailVerification.Status.EXPIRED)

    EmailVerification.objects.filter(
        email__iexact=email,
        status=EmailVerification.Status.VERIFIED,
    ).update(status=EmailVerification.Status.EXPIRED)

    PasswordReset.objects.filter(
        account=account,
        status=PasswordReset.Status.PENDING,
    ).update(status=PasswordReset.Status.EXPIRED)

    if request.session.get('account_id'):
        request.session.flush()

    return Response({
        'message': 'Password changed successfully. Please log in again.',
        'require_relogin': True,
    }, status=status.HTTP_200_OK)


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

        queued = send_html_email_async(
            to_email=email,
            subject='MechConnect - Your Password Reset Code',
            html_content=build_password_reset_email_html(
                first_name=first_name,
                reset_code=reset_token,
                expires_in_minutes=15,
            ),
        )

        if queued:
            return Response({
                'message': 'Password reset code sent to your email',
                'expires_in_minutes': 15,
                'note': 'Email may take up to 60 seconds to appear in inbox.'
            }, status=status.HTTP_200_OK)

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
