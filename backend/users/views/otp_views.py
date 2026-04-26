"""OTP SMS authentication views for MechConnect."""
import random
import logging
from datetime import timedelta

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.utils import timezone
from django.conf import settings

from ..utils.sms_service import send_textbee_otp
from ..models import SMSOTPVerification

logger = logging.getLogger(__name__)


def generate_otp_code():
    """Generate a secure 6-digit numeric OTP code."""
    return str(random.randint(100000, 999999))


@api_view(['POST'])
@permission_classes([AllowAny])
def send_otp(request):
    """
    Send an OTP code via SMS to the provided contact number.

    Request body:
        - contact_number (str): The phone number to send the OTP to

    Returns:
        - 200: OTP sent successfully
        - 400: Missing contact_number
        - 429: Rate limit exceeded
        - 500: SMS service error
    """
    contact_number = request.data.get('contact_number')

    if not contact_number:
        return Response(
            {'error': 'contact_number is required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Rate limiting: Check for unverified requests in the last hour
    one_hour_ago = timezone.now() - timedelta(hours=1)
    recent_unverified_count = SMSOTPVerification.objects.filter(
        contact_number=contact_number,
        is_verified=False,
        created_at__gte=one_hour_ago
    ).count()

    if recent_unverified_count >= 5:
        return Response(
            {'error': 'Too many OTP requests. Please wait and try again later.'},
            status=status.HTTP_429_TOO_MANY_REQUESTS
        )

    # Generate 6-digit OTP
    otp_code = generate_otp_code()

    # Calculate expiry (5 minutes from now)
    expires_at = timezone.now() + timedelta(minutes=5)

    # Create OTP record in database with account if authenticated
    otp_record = None
    try:
        otp_data = {
            'contact_number': contact_number,
            'otp_code': otp_code,
            'expires_at': expires_at,
        }
        # Store account if user is authenticated
        if request.user and request.user.is_authenticated:
            otp_data['account'] = request.user
            logger.info(f"Creating OTP record for account {request.user.id}")
        else:
            logger.info(f"Creating OTP record without account (anonymous)")

        otp_record = SMSOTPVerification.objects.create(**otp_data)

        # Send SMS via TextBee
        result = send_textbee_otp(contact_number, otp_code)
        logger.info(f"OTP sent successfully to {contact_number}")

        return Response({
            'message': 'OTP sent successfully',
            'contact_number': contact_number,
            # Only include otp_code in DEBUG mode for testing
            'otp_code': otp_code if settings.DEBUG else None,
        }, status=status.HTTP_200_OK)

    except ValueError as e:
        logger.error(f"TextBee configuration error: {str(e)}")
        # Delete the OTP record if SMS fails
        if otp_record:
            otp_record.delete()
        return Response(
            {'error': 'SMS service is not properly configured'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    except Exception as e:
        logger.error(f"Failed to send OTP to {contact_number}: {str(e)}")
        # Delete the OTP record on failure
        if otp_record:
            otp_record.delete()
        return Response(
            {'error': 'Failed to send SMS. Please try again later.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_otp(request):
    """
    Verify an OTP code for the provided contact number.

    Request body:
        - contact_number (str): The phone number to verify
        - otp_code (str): The 6-digit OTP code to verify

    Returns:
        - 200: OTP verified successfully
        - 400: OTP expired, invalid, or mismatched
    """
    contact_number = request.data.get('contact_number')
    provided_code = request.data.get('otp_code')

    if not contact_number:
        logger.warning("OTP verify failed: contact_number is missing")
        return Response(
            {'error': 'contact_number is required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if not provided_code:
        logger.warning("OTP verify failed: otp_code is missing")
        return Response(
            {'error': 'otp_code is required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    logger.info(f"Attempting OTP verify for {contact_number} with code {provided_code}")

    # Query database for the latest unverified OTP for this contact number
    # that hasn't expired yet
    try:
        otp_record = SMSOTPVerification.objects.filter(
            contact_number=contact_number,
            is_verified=False,
            expires_at__gt=timezone.now()
        ).latest('created_at')
        logger.info(f"Found OTP record {otp_record.id} for {contact_number}, expected code: {otp_record.otp_code}")
    except SMSOTPVerification.DoesNotExist:
        logger.warning(f"OTP verify failed: No unverified OTP found for {contact_number} that hasn't expired")
        return Response(
            {'error': 'OTP expired or invalid'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Verify the code
    if str(provided_code) != str(otp_record.otp_code):
        logger.warning(f"OTP verify failed: Code mismatch for {contact_number}. Provided: {provided_code}, Expected: {otp_record.otp_code}")
        return Response(
            {'error': 'Invalid OTP code'},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Mark as verified to prevent reuse
    otp_record.is_verified = True
    otp_record.verified_at = timezone.now()
    otp_record.save()

    # Get account from OTP record (stored when OTP was sent) or request user
    account = otp_record.account
    if not account and request.user and request.user.is_authenticated:
        account = request.user

    # Update Client profile with the new contact number
    if account:
        try:
            from ..models import Client
            client = Client.objects.get(account=account)
            client.contact_number = contact_number
            client.save()
            logger.info(f"Updated Client profile contact_number to {contact_number} for account {account.id}")
        except Client.DoesNotExist:
            logger.warning(f"Client profile not found for account {account.id}")
        except Exception as e:
            logger.error(f"Failed to update Client profile: {str(e)}")
    else:
        logger.warning(f"No account found to update contact_number {contact_number}")

    logger.info(f"OTP verified successfully for {contact_number}")

    return Response({
        'message': 'OTP verified successfully',
        'verified': True,
        'contact_number': contact_number
    }, status=status.HTTP_200_OK)
