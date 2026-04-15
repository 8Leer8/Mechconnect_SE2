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
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from pricing.models import PricingConfiguration
from users.models import Account

from ...models import Booking, PaymentQRToken, Receipt


logger = logging.getLogger(__name__)


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

    payload = {
        "data": {
            "attributes": {
                "amount": amount_centavos,
                "currency": "PHP",
                "type": type_map[payment_method],
                "redirect": {
                    "success": "mechconnect://payment/success",
                    "failed": "mechconnect://payment/failed",
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
        checkout_url = create_paymongo_source(
            amount=total,
            payment_method=payment_method,
            booking_id=booking.id,
        )
    except Exception:
        logger.exception("PayMongo source creation failed")
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
    signature = request.headers.get("Paymongo-Signature", "")
    payload = request.body.decode("utf-8")

    computed = hmac.new(
        webhook_secret.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()

    signature_value = signature
    if "," in signature:
        parts = [p.strip() for p in signature.split(",")]
        for part in parts:
            if part.startswith("v1="):
                signature_value = part.replace("v1=", "", 1)
                break

    if not hmac.compare_digest(computed, signature_value):
        return Response({"error": "Invalid signature"}, status=400)

    event_type = request.data.get("data", {}).get("attributes", {}).get("type")

    if event_type == "payment.paid":
        metadata = (
            request.data.get("data", {})
            .get("attributes", {})
            .get("data", {})
            .get("attributes", {})
            .get("metadata", {})
        )

        booking_id = metadata.get("booking_id")
        if booking_id:
            try:
                booking = Booking.objects.select_related("receipt").get(id=booking_id)
            except Booking.DoesNotExist:
                return Response({"received": True})

            if booking.status == Booking.Status.PENDING_PAYMENT:
                receipt, _ = Receipt.objects.get_or_create(booking=booking)
                receipt.payment_received = True
                receipt.paid_at = timezone.now()
                receipt.ewallet_source_id = request.data.get("data", {}).get("id")
                receipt.save(update_fields=["payment_received", "paid_at", "ewallet_source_id"])

                booking.status = Booking.Status.COMPLETED
                booking.completed_at = timezone.now()
                booking.save(update_fields=["status", "completed_at"])

                trigger_disbursement(booking)
                notify_payment_completed(booking)

    return Response({"received": True})
