"""SMS Service utility for sending OTPs via TextBee API."""
import requests
from django.conf import settings


def send_textbee_otp(phone_number, otp_code):
    """
    Send an OTP code via SMS using the TextBee API.

    Args:
        phone_number: The recipient's phone number (e.g., "+1234567890")
        otp_code: The 6-digit OTP code to send

    Returns:
        dict: The JSON response from the TextBee API

    Raises:
        requests.exceptions.RequestException: If the API request fails
    """
    device_id = getattr(settings, 'TEXTBEE_DEVICE_ID', None)
    api_key = getattr(settings, 'TEXTBEE_API_KEY', None)

    if not device_id or not api_key:
        raise ValueError("TEXTBEE_DEVICE_ID and TEXTBEE_API_KEY must be configured in settings")

    url = f"https://api.textbee.dev/api/v1/gateway/devices/{device_id}/send-sms"

    headers = {
        'x-api-key': api_key,
        'Content-Type': 'application/json'
    }

    payload = {
        "recipients": [phone_number],
        "message": f"Your MechConnect verification code is: {otp_code}. Do not share this code with anyone."
    }

    response = requests.post(url, json=payload, headers=headers, timeout=30)
    response.raise_for_status()

    return response.json()
