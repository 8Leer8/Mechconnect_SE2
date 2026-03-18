import logging
from html import escape

import sib_api_v3_sdk
from sib_api_v3_sdk.rest import ApiException
from django.conf import settings


logger = logging.getLogger(__name__)


def send_html_email(to_email, subject, html_content):
    """Send an HTML email through Brevo API. Returns True on success, False on failure."""
    api_key = getattr(settings, "BREVO_API_KEY", "")
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "")

    if not api_key:
        logger.error("BREVO_API_KEY is missing. Email to %s was not sent.", to_email)
        return False

    if not from_email:
        logger.error("DEFAULT_FROM_EMAIL is missing. Email to %s was not sent.", to_email)
        return False

    try:
        configuration = sib_api_v3_sdk.Configuration()
        configuration.api_key["api-key"] = api_key

        api_instance = sib_api_v3_sdk.TransactionalEmailsApi(
            sib_api_v3_sdk.ApiClient(configuration)
        )

        send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
            to=[{"email": to_email}],
            sender={"email": from_email, "name": "MechConnect"},
            subject=subject,
            html_content=html_content,
        )

        api_instance.send_transac_email(send_smtp_email)
        logger.info("Email sent successfully to %s", to_email)
        return True

    except ApiException as e:
        logger.exception("Brevo API error sending to %s: %s", to_email, e)
        return False
    except Exception as e:
        logger.exception("Failed to send email via Brevo to %s", to_email)
        return False


def build_verification_email_html(first_name, verification_code, expires_in_minutes=15):
    safe_name = escape(first_name or "there")
    safe_code = escape(str(verification_code or "------"))
    return (
        "<div style=\"margin:0;padding:24px;background-color:#ecedee;font-family:Arial,sans-serif;color:#ECEDEE;\">"
        "<div style=\"max-width:620px;margin:0 auto;border:1px solid #2A2C2E;border-radius:14px;overflow:hidden;background-color:#151718;\">"
        "<div style=\"background-color:#1A1C1E;padding:22px 28px;border-bottom:1px solid #2A2C2E;\">"
        "<h1 style=\"margin:0;font-size:22px;line-height:1.3;color:#ECEDEE;font-weight:700;\">MechConnect Email Verification</h1>"
        "</div>"
        "<div style=\"padding:28px;\">"
        f"<p style=\"margin:0 0 14px;font-size:16px;line-height:1.6;color:#ECEDEE;\">Hi {safe_name},</p>"
        "<p style=\"margin:0 0 16px;font-size:15px;line-height:1.7;color:#C8CDD2;\">Use the verification code below to confirm your email in the MechConnect app.</p>"
        "<div style=\"margin:0 0 18px;padding:14px;border:1px solid #2A2C2E;border-radius:12px;background-color:#1A1C1E;\">"
        "<p style=\"margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.4px;color:#8E8E93;text-transform:uppercase;\">Verification Code</p>"
        f"<p style=\"margin:0;font-size:34px;line-height:1.2;letter-spacing:6px;font-weight:800;color:#FF8C00;\">{safe_code}</p>"
        "</div>"
        f"<p style=\"margin:0 0 8px;font-size:14px;line-height:1.6;color:#C8CDD2;\">This code expires in {int(expires_in_minutes)} minutes.</p>"
        "<p style=\"margin:0;font-size:13px;line-height:1.6;color:#8E8E93;\">If you did not create this account, you can safely ignore this email.</p>"
        "</div>"
        "<div style=\"padding:16px 28px;border-top:1px solid #2A2C2E;background-color:#1A1C1E;\">"
        "<p style=\"margin:0;font-size:12px;line-height:1.6;color:#8E8E93;\">MechConnect • This is an automated message, please do not reply.</p>"
        "</div>"
        "</div>"
        "</div>"
    )


def build_password_reset_email_html(first_name, reset_code, expires_in_minutes=15):
    safe_name = escape(first_name or "there")
    safe_code = escape(str(reset_code or "------"))
    return (
        "<div style=\"margin:0;padding:24px;background-color:#ecedee;font-family:Arial,sans-serif;color:#ECEDEE;\">"
        "<div style=\"max-width:620px;margin:0 auto;border:1px solid #2A2C2E;border-radius:14px;overflow:hidden;background-color:#151718;\">"
        "<div style=\"background-color:#1A1C1E;padding:22px 28px;border-bottom:1px solid #2A2C2E;\">"
        "<h1 style=\"margin:0;font-size:22px;line-height:1.3;color:#ECEDEE;font-weight:700;\">MechConnect Password Reset</h1>"
        "</div>"
        "<div style=\"padding:28px;\">"
        f"<p style=\"margin:0 0 14px;font-size:16px;line-height:1.6;color:#ECEDEE;\">Hi {safe_name},</p>"
        "<p style=\"margin:0 0 16px;font-size:15px;line-height:1.7;color:#C8CDD2;\">Use the password reset code below in the MechConnect app to reset your password.</p>"
        "<div style=\"margin:0 0 18px;padding:14px;border:1px solid #2A2C2E;border-radius:12px;background-color:#1A1C1E;\">"
        "<p style=\"margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.4px;color:#8E8E93;text-transform:uppercase;\">Reset Code</p>"
        f"<p style=\"margin:0;font-size:34px;line-height:1.2;letter-spacing:6px;font-weight:800;color:#FF8C00;\">{safe_code}</p>"
        "</div>"
        f"<p style=\"margin:0 0 8px;font-size:14px;line-height:1.6;color:#C8CDD2;\">This code expires in {int(expires_in_minutes)} minutes.</p>"
        "<p style=\"margin:0;font-size:13px;line-height:1.6;color:#8E8E93;\">If you did not request a password reset, you can safely ignore this email.</p>"
        "</div>"
        "<div style=\"padding:16px 28px;border-top:1px solid #2A2C2E;background-color:#1A1C1E;\">"
        "<p style=\"margin:0;font-size:12px;line-height:1.6;color:#8E8E93;\">MechConnect • This is an automated message, please do not reply.</p>"
        "</div>"
        "</div>"
        "</div>"
    )


def build_booking_confirmation_email_html(
    first_name,
    service_name,
    booking_date,
    booking_time,
    mechanic_name,
    payment_method,
    status,
):
    safe_name = escape(first_name or "there")
    safe_service = escape(service_name or "-")
    safe_date = escape(str(booking_date or "-"))
    safe_time = escape(str(booking_time or "-"))
    safe_mechanic = escape(mechanic_name or "-")
    safe_payment = escape(payment_method or "-")
    safe_status = escape(status or "Pending")

    status_normalized = (status or "pending").strip().lower()
    badge_style = (
        "display:inline-block;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;"
    )
    if status_normalized == "confirmed":
        badge_style += "background-color:#DCFCE7;color:#166534;"
    elif status_normalized == "pending":
        badge_style += "background-color:#FEF3C7;color:#92400E;"
    else:
        badge_style += "background-color:#E5E7EB;color:#374151;"

    return (
        "<div style=\"margin:0;padding:24px;background-color:#FFFFFF;font-family:Arial,sans-serif;color:#1F2937;\">"
        "<div style=\"max-width:620px;margin:0 auto;border:1px solid #E5E7EB;border-radius:14px;overflow:hidden;background-color:#FFFFFF;\">"
        "<div style=\"background-color:#1A73E8;padding:22px 28px;\">"
        "<h1 style=\"margin:0;font-size:22px;line-height:1.3;color:#FFFFFF;font-weight:700;\">Booking Confirmation</h1>"
        "</div>"
        "<div style=\"padding:28px;\">"
        f"<p style=\"margin:0 0 16px;font-size:16px;line-height:1.6;\">Hi {safe_name},</p>"
        "<p style=\"margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;\">Your booking details are listed below.</p>"
        "<div style=\"border:1px solid #E5E7EB;border-radius:12px;padding:16px;margin:0 0 18px;background-color:#FFFFFF;\">"
        f"<p style=\"margin:0 0 8px;font-size:14px;\"><strong>Service:</strong> {safe_service}</p>"
        f"<p style=\"margin:0 0 8px;font-size:14px;\"><strong>Date:</strong> {safe_date}</p>"
        f"<p style=\"margin:0 0 8px;font-size:14px;\"><strong>Time:</strong> {safe_time}</p>"
        f"<p style=\"margin:0 0 8px;font-size:14px;\"><strong>Mechanic:</strong> {safe_mechanic}</p>"
        f"<p style=\"margin:0 0 8px;font-size:14px;\"><strong>Payment Method:</strong> {safe_payment}</p>"
        f"<p style=\"margin:0;font-size:14px;\"><strong>Status:</strong> <span style=\"{badge_style}\">{safe_status}</span></p>"
        "</div>"
        "<p style=\"margin:0;font-size:14px;line-height:1.7;color:#4B5563;\">Please arrive 5 minutes early for your appointment or prepare your vehicle for mechanic arrival.</p>"
        "</div>"
        "<div style=\"padding:16px 28px;border-top:1px solid #E5E7EB;background-color:#F9FAFB;\">"
        "<p style=\"margin:0;font-size:12px;line-height:1.6;color:#6B7280;\">MechConnect • This is an automated message, please do not reply.</p>"
        "</div>"
        "</div>"
        "</div>"
    )