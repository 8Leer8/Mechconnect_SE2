import base64
import hashlib
import hmac
import logging
import uuid
from decimal import Decimal

import requests
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.db import DatabaseError, NotSupportedError, transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from pricing.models import PricingConfiguration
from users.models import Account

from ...models import Booking, PaymentQRToken, Receipt


logger = logging.getLogger(__name__)


def _build_paymongo_redirect_urls():
    base_url = str(getattr(settings, "PAYMONGO_REDIRECT_BASE_URL", "") or "").rstrip("/")
    if not base_url.startswith("https://"):
        raise ValueError("PAYMONGO_REDIRECT_BASE_URL must be an https URL")
    return (
        f"{base_url}/api/bookings/payments/redirect/success/",
        f"{base_url}/api/bookings/payments/redirect/failed/",
    )


def _get_authenticated_account(request):
    user = getattr(request, "user", None)
    if user is not None and getattr(user, "id", None) and not getattr(user, "is_anonymous", False):
        return user

    account_id = request.session.get("account_id")
    if not account_id:
        return None

    try:
        return Account.objects.get(id=account_id)
    except Account.DoesNotExist:
        return None


def _send_ws_event(account_ids, payload):
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return

    for account_id in {aid for aid in account_ids if aid}:
        async_to_sync(channel_layer.group_send)(
            f"user_{account_id}",
            {"type": "booking_update", **payload},
        )


def _get_platform_fee(pricing):
    # This codebase doesn't define pricing.base_fee; use convenience_fee_fixed as the platform base fee.
    fee = getattr(pricing, "convenience_fee_fixed", Decimal("0"))
    return Decimal(fee or 0)


def _compute_payment_split(booking):
    pricing = PricingConfiguration.get_config()
    total = Decimal(booking.amount_fee or 0)
    platform_fee = _get_platform_fee(pricing)
    disbursement_fee = Decimal(getattr(pricing, "disbursement_fee", Decimal("0")) or 0)
    mechanic_payout = total - platform_fee - disbursement_fee
    if mechanic_payout < 0:
        mechanic_payout = Decimal("0")
    return total, platform_fee, disbursement_fee, mechanic_payout


def create_paymongo_source(amount, payment_method, booking_id):
    """Creates PayMongo payment source and returns redirect URL."""
    secret_key = settings.PAYMONGO_SECRET_KEY
    encoded_key = base64.b64encode(f"{secret_key}:".encode()).decode()

    amount_centavos = int(Decimal(amount) * 100)

    type_map = {
        "gcash": "gcash",
        "maya": "paymaya",
    }

    success_redirect, failed_redirect = _build_paymongo_redirect_urls()

    payload = {
        "data": {
            "attributes": {
                "amount": amount_centavos,
                "currency": "PHP",
                "type": type_map[payment_method],
                "redirect": {
                    "success": success_redirect,
                    "failed": failed_redirect,
                },
                "metadata": {
                    "booking_id": str(booking_id),
                },
            }
        }
    }

    response = requests.post(
        "https://api.paymongo.com/v1/sources",
        json=payload,
        headers={
            "Authorization": f"Basic {encoded_key}",
            "Content-Type": "application/json",
        },
        timeout=25,
    )
    response.raise_for_status()
    data = response.json()
    return data["data"]["attributes"]["redirect"]["checkout_url"]


def create_paymongo_maya_intent(amount, booking_id):
    """Creates PayMongo Payment Intent + Payment Method for Maya (paymaya)."""
    secret_key = settings.PAYMONGO_SECRET_KEY
    encoded_key = base64.b64encode(f"{secret_key}:".encode()).decode()
    headers = {
        "Authorization": f"Basic {encoded_key}",
        "Content-Type": "application/json",
    }

    amount_centavos = int(Decimal(amount) * 100)
    success_redirect, failed_redirect = _build_paymongo_redirect_urls()

    # Step 1: Create Payment Intent
    intent_payload = {
        "data": {
            "attributes": {
                "amount": amount_centavos,
                "currency": "PHP",
                "payment_method_allowed": ["paymaya"],
                "metadata": {
                    "booking_id": str(booking_id),
                },
            }
        }
    }
    intent_response = requests.post(
        "https://api.paymongo.com/v1/payment_intents",
        json=intent_payload,
        headers=headers,
        timeout=25,
    )
    intent_response.raise_for_status()
    intent_data = intent_response.json()
    intent_id = intent_data["data"]["id"]
    intent_client_key = intent_data["data"]["attributes"]["client_key"]

    # Step 2: Create Payment Method
    method_payload = {
        "data": {
            "attributes": {
                "type": "paymaya",
            }
        }
    }
    method_response = requests.post(
        "https://api.paymongo.com/v1/payment_methods",
        json=method_payload,
        headers=headers,
        timeout=25,
    )
    method_response.raise_for_status()
    method_data = method_response.json()
    method_id = method_data["data"]["id"]

    # Step 3: Attach Payment Method to Intent
    attach_payload = {
        "data": {
            "attributes": {
                "payment_method": method_id,
                "client_key": intent_client_key,
                "return_url": success_redirect,
            }
        }
    }
    attach_response = requests.post(
        f"https://api.paymongo.com/v1/payment_intents/{intent_id}/attach",
        json=attach_payload,
        headers=headers,
        timeout=25,
    )
    attach_response.raise_for_status()
    attach_data = attach_response.json()

    # Step 4: Extract redirect URL
    next_action = attach_data["data"]["attributes"].get("next_action") or {}
    redirect_url = (next_action.get("redirect", {}) or {}).get("url")

    if not redirect_url:
        raise ValueError("No redirect URL returned from PayMongo Maya intent")

    return redirect_url


def _build_redirect_bridge_page(target_deep_link, status_label):
    safe_target = str(target_deep_link)
    safe_status = str(status_label)
    return f"""<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MechConnect Payment {safe_status}</title>
  </head>
  <body style="font-family: Arial, sans-serif; margin: 24px;">
    <h2>Payment {safe_status}</h2>
    <p>Returning you to MechConnect...</p>
    <p><a href="{safe_target}">Tap here if app does not open</a></p>
    <script>
      window.location.href = "{safe_target}";
    </script>
  </body>
</html>"""


@api_view(["GET"])
@permission_classes([AllowAny])
def payment_redirect_success(request):
    html = _build_redirect_bridge_page("mechconnect://payment/success", "Successful")
    return HttpResponse(html)


@api_view(["GET"])
@permission_classes([AllowAny])
def payment_redirect_failed(request):
    html = _build_redirect_bridge_page("mechconnect://payment/failed", "Failed")
    return HttpResponse(html)


def create_paymongo_payment_from_source(source_id, amount_centavos, currency="PHP"):
    """Charge a chargeable source (GCash/Maya) via PayMongo Payments API."""
    secret_key = settings.PAYMONGO_SECRET_KEY
    encoded_key = base64.b64encode(f"{secret_key}:".encode()).decode()

    payload = {
        "data": {
            "attributes": {
                "amount": int(amount_centavos),
                "source": {
                    "id": source_id,
                    "type": "source",
                },
                "currency": currency or "PHP",
            }
        }
    }

    response = requests.post(
        "https://api.paymongo.com/v1/payments",
        json=payload,
        headers={
            "Authorization": f"Basic {encoded_key}",
            "Content-Type": "application/json",
        },
        timeout=25,
    )
    response.raise_for_status()
    return response.json()


def _extract_booking_id_from_paymongo_event(event_payload):
    """Best-effort extraction of booking_id across different PayMongo event shapes."""
    event_data = event_payload.get("data", {}) or {}
    event_attributes = event_data.get("attributes", {}) or {}
    resource = event_attributes.get("data", {}) or {}
    resource_attributes = resource.get("attributes", {}) or {}

    candidates = [
        # Common source/payment metadata shape
        resource_attributes.get("metadata", {}) or {},
        # Payment object may include nested source with metadata
        (
            ((resource_attributes.get("source", {}) or {}).get("data", {}) or {})
            .get("attributes", {}) or {}
        ).get("metadata", {}) or {},
    ]

    for metadata in candidates:
        booking_id = metadata.get("booking_id")
        if booking_id is not None:
            return booking_id

    return None


def trigger_disbursement(booking):
    """Trigger payout to mechanic/shop owner. Failures are logged but not shown to users."""
    try:
        receipt = booking.receipt
    except Exception:
        return

    if not receipt.mechanic_payout:
        return

    payout_number = None
    payout_method = None

    try:
        if booking.request.shop:
            shop_owner = booking.request.shop.shop_owner
            payout_number = getattr(shop_owner, "payout_number", None)
            payout_method = getattr(shop_owner, "payout_method", None)
        else:
            mechanic = booking.request.provider.mechanic
            payout_number = getattr(mechanic, "payout_number", None)
            payout_method = getattr(mechanic, "payout_method", None)
    except Exception:
        logger.warning("Missing payout relation for booking %s", booking.id)
        return

    if not payout_number or not payout_method:
        logger.warning("No payout details for booking %s", booking.id)
        return

    bank_code = str(payout_method).upper()
    valid_paymongo_codes = ["GCASH", "MAYA", "PAYMAYA"]
    if bank_code not in valid_paymongo_codes:
        print(
            f"[DISBURSEMENT] INVALID payout_method "
            f"'{payout_method}' for booking {booking.id}"
        )
        return

    if bank_code == "MAYA":
        bank_code = "PAYMAYA"

    try:
        secret_key = settings.PAYMONGO_SECRET_KEY
        encoded_key = base64.b64encode(f"{secret_key}:".encode()).decode()
        mechanic_payout = Decimal(receipt.mechanic_payout)
        amount_centavos = int(mechanic_payout * 100)

        payload = {
            "data": {
                "attributes": {
                    "amount": amount_centavos,
                    "currency": "PHP",
                    "bank_account": {
                        "account_number": payout_number,
                        "bank_code": bank_code,
                    },
                    "statement_descriptor": f"MechConnect Booking #{booking.id}",
                    "metadata": {"booking_id": str(booking.id)},
                }
            }
        }

        try:
            response = requests.post(
                "https://api.paymongo.com/v1/disbursements",
                json=payload,
                headers={
                    "Authorization": f"Basic {encoded_key}",
                    "Content-Type": "application/json",
                },
                timeout=25,
            )
            response.raise_for_status()
            response_data = response.json()

            print(
                f"[DISBURSEMENT] SUCCESS booking {booking.id} "
                f"| amount: {mechanic_payout} "
                f"| ref: {response_data.get('data', {}).get('id', 'N/A')}"
            )
        except requests.exceptions.HTTPError as e:
            print(
                f"[DISBURSEMENT] HTTP ERROR booking {booking.id} "
                f"| status: {e.response.status_code} "
                f"| body: {e.response.text}"
            )
        except requests.exceptions.Timeout:
            print(
                f"[DISBURSEMENT] TIMEOUT booking {booking.id}"
            )
        except Exception as e:
            print(
                f"[DISBURSEMENT] UNEXPECTED ERROR booking {booking.id} "
                f"| error: {str(e)}"
            )
    except Exception:
        logger.exception("Disbursement failed for booking %s", booking.id)


def notify_mechanic_cash_selected(booking):
    provider_id = getattr(booking.request.provider, "id", None)
    _send_ws_event(
        [provider_id],
        {
            "action": "payment.cash_selected",
            "booking_id": booking.id,
            "status": booking.status,
            "message": "Client selected cash payment",
        },
    )


def notify_mechanic_waiting_payment(booking):
    provider_id = getattr(booking.request.provider, "id", None)
    _send_ws_event(
        [provider_id],
        {
            "action": "payment.waiting_ewallet",
            "booking_id": booking.id,
            "status": booking.status,
            "message": "Client is processing e-wallet payment",
        },
    )


def notify_payment_completed(booking):
    provider_id = getattr(booking.request.provider, "id", None)
    client_id = getattr(booking.request.client.account, "id", None)
    _send_ws_event(
        [provider_id, client_id],
        {
            "action": "payment.completed",
            "booking_id": booking.id,
            "status": booking.status,
            "message": "Payment completed",
        },
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def initiate_payment(request):
    """Client chooses payment method and initializes payment flow."""
    account = _get_authenticated_account(request)
    if not account:
        return Response({"error": "Authentication required"}, status=401)

    booking_id = request.data.get("booking_id")
    payment_method = str(request.data.get("payment_method") or "").lower().strip()

    if payment_method not in {"cash", "gcash", "maya"}:
        return Response({"error": "Invalid payment method"}, status=400)

    booking = get_object_or_404(Booking, id=booking_id)

    if booking.request.client.account_id != account.id:
        return Response({"error": "Unauthorized"}, status=403)

    if booking.status != Booking.Status.PENDING_PAYMENT:
        return Response({"error": "Booking is not pending payment"}, status=400)

    total, platform_fee, _, mechanic_payout = _compute_payment_split(booking)

    if payment_method == "cash":
        token, _ = PaymentQRToken.objects.update_or_create(
            booking=booking,
            defaults={
                "token": uuid.uuid4(),
                "is_used": False,
                "expires_at": timezone.now() + timezone.timedelta(minutes=15),
            },
        )

        Receipt.objects.update_or_create(
            booking=booking,
            defaults={
                "payment_method": "cash",
                "ewallet_type": None,
                "platform_fee": platform_fee,
                "mechanic_payout": mechanic_payout,
            },
        )

        notify_mechanic_cash_selected(booking)

        return Response(
            {
                "method": "cash",
                "token_ready": True,
                "token": str(token.token),
            }
        )

    try:
        if payment_method == "maya":
            checkout_url = create_paymongo_maya_intent(
                amount=total,
                booking_id=booking.id,
            )
        else:
            checkout_url = create_paymongo_source(
                amount=total,
                payment_method=payment_method,
                booking_id=booking.id,
            )
    except Exception:
        logger.exception("PayMongo source creation failed for method: %s", payment_method)
        return Response({"error": "Unable to initialize e-wallet payment"}, status=502)

    Receipt.objects.update_or_create(
        booking=booking,
        defaults={
            "payment_method": payment_method,
            "ewallet_type": payment_method,
            "platform_fee": platform_fee,
            "mechanic_payout": mechanic_payout,
        },
    )

    notify_mechanic_waiting_payment(booking)

    return Response(
        {
            "method": payment_method,
            "checkout_url": checkout_url,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_qr_token(request, booking_id):
    """Mechanic fetches QR token for a pending-payment booking."""
    account = _get_authenticated_account(request)
    if not account:
        return Response({"error": "Authentication required"}, status=401)

    booking = get_object_or_404(Booking, id=booking_id)

    if booking.request.provider_id != account.id:
        return Response({"error": "Unauthorized"}, status=403)

    if booking.status != Booking.Status.PENDING_PAYMENT:
        return Response({"error": "Booking not pending payment"}, status=400)

    try:
        qr_token = booking.qr_token
    except PaymentQRToken.DoesNotExist:
        return Response({"error": "QR token not ready yet"}, status=404)

    if not qr_token.is_valid():
        return Response({"error": "QR token expired"}, status=400)

    return Response(
        {
            "token": str(qr_token.token),
            "amount": str(booking.amount_fee),
            "expires_at": qr_token.expires_at.isoformat(),
            "booking_id": booking.id,
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def scan_qr(request):
    """Client scans QR and gets preview info (no finalization yet)."""
    account = _get_authenticated_account(request)
    if not account:
        return Response({"error": "Authentication required"}, status=401)

    token_value = request.data.get("token")
    if not token_value:
        return Response({"error": "Token is required"}, status=400)

    try:
        qr_token = PaymentQRToken.objects.select_related(
            "booking__request__client__account",
            "booking__request__provider",
        ).get(token=token_value)
    except PaymentQRToken.DoesNotExist:
        return Response({"error": "Invalid QR code"}, status=400)

    if qr_token.booking.request.client.account_id != account.id:
        return Response({"error": "This QR code is not for your booking"}, status=403)

    if not qr_token.is_valid():
        return Response({"error": "QR code has expired or already been used"}, status=400)

    if qr_token.booking.status != Booking.Status.PENDING_PAYMENT:
        return Response({"error": "Booking is not pending payment"}, status=400)

    mechanic_account = qr_token.booking.request.provider
    first = getattr(mechanic_account, "firstname", "") if mechanic_account else ""
    last = getattr(mechanic_account, "lastname", "") if mechanic_account else ""
    mechanic_name = f"{first} {last}".strip() or "Mechanic"

    return Response(
        {
            "valid": True,
            "token": str(qr_token.token),
            "booking_id": qr_token.booking.id,
            "amount": str(qr_token.booking.amount_fee),
            "mechanic_name": mechanic_name,
            "booking_number": f"#{qr_token.booking.id}",
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def confirm_qr_payment(request):
    """Finalize cash payment after client confirms scanned QR preview."""
    account = _get_authenticated_account(request)
    if not account:
        return Response({"error": "Authentication required"}, status=401)

    token_value = request.data.get("token")
    if not token_value:
        return Response({"error": "Token is required"}, status=400)

    try:
        with transaction.atomic():
            # Lock token row directly. Avoid select_related joins here because provider is nullable,
            # and PostgreSQL rejects FOR UPDATE on nullable-side outer joins.
            try:
                qr_token = PaymentQRToken.objects.select_for_update(
                    nowait=True,
                ).get(token=token_value)
            except PaymentQRToken.DoesNotExist:
                return Response({"error": "Invalid QR code"}, status=400)
            except NotSupportedError:
                try:
                    qr_token = PaymentQRToken.objects.select_for_update().get(token=token_value)
                except PaymentQRToken.DoesNotExist:
                    return Response({"error": "Invalid QR code"}, status=400)
            except DatabaseError:
                return Response(
                    {"error": "Payment is being processed. Please wait."},
                    status=409,
                )

            booking = Booking.objects.select_related(
                "request__client__account",
                "request__provider",
            ).get(id=qr_token.booking_id)

            if booking.request.client.account_id != account.id:
                return Response({"error": "Unauthorized"}, status=403)

            if not qr_token.is_valid():
                return Response({"error": "QR code expired or already used"}, status=400)

            if booking.status != Booking.Status.PENDING_PAYMENT:
                return Response({"error": "Booking not pending payment"}, status=400)

            qr_token.is_used = True
            qr_token.save(update_fields=["is_used"])

            now = timezone.now()

            try:
                receipt = Receipt.objects.get(booking=booking)
                receipt.payment_received = True
                receipt.paid_at = now
                receipt.save()
            except Receipt.DoesNotExist:
                _, platform_fee, _, mechanic_payout = _compute_payment_split(booking)
                Receipt.objects.create(
                    booking=booking,
                    payment_method="cash",
                    payment_received=True,
                    paid_at=now,
                    platform_fee=platform_fee,
                    mechanic_payout=mechanic_payout,
                )

            booking.status = Booking.Status.COMPLETED
            booking.completed_at = now
            booking.save()
    except Exception:
        logger.exception("QR confirm failed for booking token %s", token_value)
        return Response({"error": "Unable to confirm payment"}, status=500)

    trigger_disbursement(booking)
    notify_payment_completed(booking)

    return Response({"success": True, "message": "Payment confirmed successfully"})


@api_view(["POST"])
@permission_classes([AllowAny])
def paymongo_webhook(request):
    """Handle PayMongo webhooks with signature verification."""
    webhook_secret = settings.PAYMONGO_WEBHOOK_SECRET
    if not webhook_secret:
        logger.error("PAYMONGO_WEBHOOK_SECRET is not configured")
        return Response({"error": "Webhook is not configured"}, status=500)

    signature_header = request.headers.get("Paymongo-Signature", "")
    raw_body = request.body

    # Parse "t=1234567890,v1=abcdef...,v1=..."
    timestamp_value = ""
    signature_values = []

    for part in signature_header.split(","):
        part = part.strip()
        if part.startswith("t="):
            timestamp_value = part[2:].strip()
        elif part.startswith("te="):
            value = part[3:].strip()
            if value:
                signature_values.append(value)
        elif part.startswith("li="):
            value = part[3:].strip()
            if value:
                signature_values.append(value)
        elif part.startswith("v1="):
            # fallback: keep for forward compatibility
            value = part[3:].strip()
            if value:
                signature_values.append(value)       

    if not timestamp_value or not signature_values:
        logger.warning(
            "PayMongo webhook: malformed signature header: %s",
            signature_header,
        )
        return Response({"error": "Invalid signature"}, status=400)

    # PayMongo signs exact bytes of: b"<timestamp>." + raw_body
    signed_payload = timestamp_value.encode("utf-8") + b"." + raw_body

    computed = hmac.new(
        webhook_secret.encode("utf-8"),
        signed_payload,
        hashlib.sha256,
    ).hexdigest()

    if not any(hmac.compare_digest(computed, sig) for sig in signature_values):
        logger.warning("PayMongo webhook: signature mismatch")
        return Response({"error": "Invalid signature"}, status=400)

    event_data = request.data.get("data", {}) or {}
    event_attributes = event_data.get("attributes", {}) or {}
    event_type = event_attributes.get("type")
    resource = event_attributes.get("data", {}) or {}
    resource_attributes = resource.get("attributes", {}) or {}

    # For source-based e-wallet flow, source.chargeable must be charged by backend.
    if event_type == "source.chargeable":
        source_id = resource.get("id")
        amount = resource_attributes.get("amount")
        currency = resource_attributes.get("currency", "PHP")

        if source_id and amount:
            try:
                create_paymongo_payment_from_source(
                    source_id=source_id,
                    amount_centavos=amount,
                    currency=currency,
                )
            except requests.exceptions.HTTPError:
                logger.exception("Failed to create PayMongo payment for source %s", source_id)
                return Response({"error": "Unable to charge source"}, status=502)
            except Exception:
                logger.exception("Unexpected error while charging PayMongo source %s", source_id)
                return Response({"error": "Unable to charge source"}, status=500)

    if event_type == "payment.paid":
        booking_id = _extract_booking_id_from_paymongo_event(request.data)
        if booking_id:
            try:
                booking = Booking.objects.select_related("receipt").get(id=booking_id)
            except Booking.DoesNotExist:
                return Response({"received": True})

            if booking.status == Booking.Status.PENDING_PAYMENT:
                receipt, _ = Receipt.objects.get_or_create(booking=booking)
                receipt.payment_received = True
                receipt.paid_at = timezone.now()
                # Keep source id when available; fallback to object id to retain external traceability.
                source_obj = (resource_attributes.get("source", {}) or {}).get("data", {}) or {}
                source_id = source_obj.get("id")
                receipt.ewallet_source_id = source_id or receipt.ewallet_source_id
                receipt.transaction_id = resource.get("id") or receipt.transaction_id
                receipt.save(
                    update_fields=[
                        "payment_received",
                        "paid_at",
                        "ewallet_source_id",
                        "transaction_id",
                    ]
                )

                booking.status = Booking.Status.COMPLETED
                booking.completed_at = timezone.now()
                booking.save(update_fields=["status", "completed_at"])

                trigger_disbursement(booking)
                notify_payment_completed(booking)

    if event_type == "payment_intent.succeeded":
        booking_id = _extract_booking_id_from_paymongo_event(request.data)
        if not booking_id:
            # Try extracting from payment intent metadata directly.
            resource_metadata = resource_attributes.get("metadata", {}) or {}
            booking_id = resource_metadata.get("booking_id")

        if booking_id:
            try:
                booking = Booking.objects.select_related("receipt").get(id=booking_id)
            except Booking.DoesNotExist:
                return Response({"received": True})

            if booking.status == Booking.Status.PENDING_PAYMENT:
                receipt, _ = Receipt.objects.get_or_create(booking=booking)
                receipt.payment_received = True
                receipt.paid_at = timezone.now()
                receipt.transaction_id = resource.get("id") or receipt.transaction_id
                receipt.save(update_fields=["payment_received", "paid_at", "transaction_id"])

                booking.status = Booking.Status.COMPLETED
                booking.completed_at = timezone.now()
                booking.save(update_fields=["status", "completed_at"])

                trigger_disbursement(booking)
                notify_payment_completed(booking)

    return Response({"received": True})
