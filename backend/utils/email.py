import logging
from html import escape

import resend
from django.conf import settings


logger = logging.getLogger(__name__)


def _resend_send(from_email, to_email, subject, html_content):
    resend.Emails.send(
        {
            "from": from_email,
            "to": [to_email],
            "subject": subject,
            "html": html_content,
        }
    )


def send_html_email(to_email, subject, html_content):
    """Send an HTML email through Resend. Returns True on success, False on failure."""
    resend_api_key = getattr(settings, "RESEND_API_KEY", "")
    primary_from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "")

    if not resend_api_key:
        logger.error("RESEND_API_KEY is missing. Email to %s was not sent.", to_email)
        return False

    if not primary_from_email:
        logger.error("DEFAULT_FROM_EMAIL is missing. Email to %s was not sent.", to_email)
        return False

    try:
        resend.api_key = resend_api_key
        _resend_send(primary_from_email, to_email, subject, html_content)
        logger.info("Email sent successfully to %s", to_email)
        return True
    except Exception as exc:
        error_text = str(exc).lower()
        domain_not_verified = "domain is not verified" in error_text
        testing_restriction = "only send testing emails" in error_text

        if domain_not_verified:
            logger.error(
                "Sender domain for %s is not verified in Resend.",
                primary_from_email,
            )
            return False

        if testing_restriction:
            logger.error(
                "Resend sandbox restriction hit. Verify your sending domain and use a sender on that domain. Current sender: %s",
                primary_from_email,
            )
            return False

        logger.exception("Failed to send email via Resend to %s", to_email)
        return False


def build_verification_email_html(first_name, verification_url, expires_in_hours=24):
    safe_name = escape(first_name or "there")
    safe_url = escape(verification_url or "#", quote=True)
    return (
        "<div style=\"margin:0;padding:24px;background-color:#FFFFFF;font-family:Arial,sans-serif;color:#1F2937;\">"
        "<div style=\"max-width:620px;margin:0 auto;border:1px solid #E5E7EB;border-radius:14px;overflow:hidden;background-color:#FFFFFF;\">"
        "<div style=\"background-color:#1A73E8;padding:22px 28px;\">"
        "<h1 style=\"margin:0;font-size:22px;line-height:1.3;color:#FFFFFF;font-weight:700;\">Welcome to MechConnect</h1>"
        "</div>"
        "<div style=\"padding:28px;\">"
        f"<p style=\"margin:0 0 14px;font-size:16px;line-height:1.6;\">Hi {safe_name},</p>"
        "<p style=\"margin:0 0 22px;font-size:15px;line-height:1.7;color:#374151;\">Thanks for joining MechConnect. Please verify your email to activate your account and secure your access.</p>"
        "<div style=\"margin:0 0 22px;\">"
        f"<a href=\"{safe_url}\" style=\"display:inline-block;background-color:#1A73E8;color:#FFFFFF;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px;font-weight:700;\">Verify My Email</a>"
        "</div>"
        f"<p style=\"margin:0 0 10px;font-size:14px;line-height:1.6;color:#4B5563;\">This verification link expires in {int(expires_in_hours)} hours.</p>"
        "<p style=\"margin:0;font-size:13px;line-height:1.6;color:#6B7280;\">If you did not create this account, you can safely ignore this email.</p>"
        "</div>"
        "<div style=\"padding:16px 28px;border-top:1px solid #E5E7EB;background-color:#F9FAFB;\">"
        "<p style=\"margin:0;font-size:12px;line-height:1.6;color:#6B7280;\">MechConnect • This is an automated message, please do not reply.</p>"
        "</div>"
        "</div>"
        "</div>"
    )


def build_password_reset_email_html(first_name, reset_url, expires_in_hours=1):
    safe_name = escape(first_name or "there")
    safe_url = escape(reset_url or "#", quote=True)
    return (
        "<div style=\"margin:0;padding:24px;background-color:#FFFFFF;font-family:Arial,sans-serif;color:#1F2937;\">"
        "<div style=\"max-width:620px;margin:0 auto;border:1px solid #E5E7EB;border-radius:14px;overflow:hidden;background-color:#FFFFFF;\">"
        "<div style=\"background-color:#1A73E8;padding:22px 28px;\">"
        "<h1 style=\"margin:0;font-size:22px;line-height:1.3;color:#FFFFFF;font-weight:700;\">Password Reset Request</h1>"
        "</div>"
        "<div style=\"padding:28px;\">"
        f"<p style=\"margin:0 0 14px;font-size:16px;line-height:1.6;\">Hi {safe_name},</p>"
        "<p style=\"margin:0 0 18px;font-size:15px;line-height:1.7;color:#374151;\">We received a request to reset your MechConnect password. For your account security, confirm this request only if you initiated it.</p>"
        "<div style=\"margin:0 0 20px;\">"
        f"<a href=\"{safe_url}\" style=\"display:inline-block;background-color:#1A73E8;color:#FFFFFF;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:15px;font-weight:700;\">Reset My Password</a>"
        "</div>"
        "<p style=\"margin:0 0 10px;font-size:14px;line-height:1.6;color:#B91C1C;\"><strong>Didn't request this?</strong> Please ignore this email and consider updating your security settings.</p>"
        f"<p style=\"margin:0;font-size:14px;line-height:1.6;color:#4B5563;\">For your protection, this reset link expires in {int(expires_in_hours)} hour(s).</p>"
        "</div>"
        "<div style=\"padding:16px 28px;border-top:1px solid #E5E7EB;background-color:#F9FAFB;\">"
        "<p style=\"margin:0;font-size:12px;line-height:1.6;color:#6B7280;\">MechConnect • This is an automated message, please do not reply.</p>"
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
