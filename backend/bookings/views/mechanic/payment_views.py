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

from ...models import Booking, PaymentInstallment, PaymentQRToken, PaymentTransaction, Quotation, Receipt, RequestAssignment
from ...backjob_utils import (
    backjob_accepted_payable_total,
    backjob_phase_total_paid,
    backjob_scoped_payments_active,
    booking_has_backjob,
)


logger = logging.getLogger(__name__)
WEBHOOK_MAX_AGE_SECONDS = 30 * 60
PAYMENT_OPEN_STATUSES = {Booking.Status.PENDING_PAYMENT, Booking.Status.ACCEPTED}


def _build_paymongo_redirect_urls():
    base_url = str(getattr(settings, "PAYMONGO_REDIRECT_BASE_URL", "") or "").rstrip("/")
    if not base_url.startswith("https://"):
        raise ValueError("PAYMONGO_REDIRECT_BASE_URL must be an https URL")
    return (
        f"{base_url}/api/bookings/payments/redirect/success/",
        f"{base_url}/api/bookings/payments/redirect/failed/",
    )


def _is_payment_open(booking):
    if booking_has_backjob(booking) and _to_money(booking.amount_fee) <= Decimal("0.00"):
        return False
    return booking.status in PAYMENT_OPEN_STATUSES


def _is_initial_stage_only(booking):
    return booking.status == Booking.Status.ACCEPTED and not booking_has_backjob(booking)


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


def _get_mechanic_payment_recipient_ids(booking):
    """Return provider + assigned mechanics who should receive payment socket updates."""
    recipient_ids = set()

    provider_id = getattr(booking.request, "provider_id", None)
    if provider_id:
        recipient_ids.add(provider_id)

    try:
        assignment_ids = RequestAssignment.objects.filter(
            request=booking.request
        ).values_list("mechanic_id", flat=True)
        recipient_ids.update([aid for aid in assignment_ids if aid])
    except Exception:
        # Keep provider-only delivery if assignment lookup fails.
        pass

    return list(recipient_ids)


def _can_access_booking_payment_qr(account, booking):
    """Allow provider or assigned mechanics to access booking payment QR."""
    if booking.request.provider_id == account.id:
        return True

    return RequestAssignment.objects.filter(
        request=booking.request,
        mechanic_id=account.id,
    ).exists()


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


def _to_money(value):
    amount = Decimal(value or 0)
    return amount.quantize(Decimal("0.01"))


def _compute_request_service_subtotal(booking):
    request_obj = getattr(booking, "request", None)
    if request_obj is None:
        return Decimal("0.00")

    subtotal = Decimal("0.00")

    # Broadcast request path: sum selected services + add-ons.
    try:
        broadcast = getattr(request_obj, "broadcast_request", None)
        if broadcast is not None:
            for svc in broadcast.services.all():
                subtotal += _to_money(getattr(svc, "minimum_price", 0))
            for addon_rel in broadcast.add_ons.select_related("service_add_on").all():
                subtotal += _to_money(getattr(addon_rel.service_add_on, "price", 0))
            if subtotal > 0:
                return subtotal.quantize(Decimal("0.01"))
    except Exception:
        pass

    # Direct request path: service minimum price + direct add-ons.
    try:
        direct = getattr(request_obj, "directrequest", None)
        if direct is not None:
            subtotal += _to_money(getattr(direct.service, "minimum_price", 0))
            for addon_rel in request_obj.directrequestaddon_set.select_related("service_add_on").all():
                subtotal += _to_money(getattr(addon_rel.service_add_on, "price", 0))
            if subtotal > 0:
                return subtotal.quantize(Decimal("0.01"))
    except Exception:
        pass

    return Decimal("0.00")


def _compute_overall_payable_total(booking):
    current_total = _to_money(booking.amount_fee)
    quotation = getattr(booking, "quotation", None)
    if booking_has_backjob(booking):
        if quotation is None:
            return Decimal("0.00")
        try:
            quotation.is_backjob = True
            quotation.recalculate_totals()
            return backjob_accepted_payable_total(quotation)
        except Exception:
            return Decimal("0.00")

    accepted_total = Decimal("0.00")

    if quotation is not None:
        try:
            accepted_items = quotation.items.filter(status=Quotation.Status.ACCEPTED)
            for item in accepted_items:
                accepted_total += _to_money(item.line_total)
        except Exception:
            accepted_total = Decimal("0.00")

    accepted_total = _to_money(accepted_total)
    if accepted_total <= 0:
        accepted_total = _compute_request_service_subtotal(booking)

    if accepted_total <= 0:
        return current_total

    convenience_component = _to_money(booking.convenience_fee or 0)
    if convenience_component <= 0:
        inferred_component = (current_total - accepted_total).quantize(Decimal("0.01"))
        if inferred_component > 0:
            convenience_component = inferred_component

    payable_total = (accepted_total + max(Decimal("0.00"), convenience_component)).quantize(Decimal("0.01"))
    if payable_total <= 0:
        return current_total
    return payable_total


def _sync_booking_payable_total(booking):
    computed_total = _compute_overall_payable_total(booking)
    current_total = _to_money(booking.amount_fee)
    if computed_total != current_total:
        booking.amount_fee = computed_total
        booking.save(update_fields=["amount_fee", "updated_at"])
    return computed_total


def _sync_pending_installments_to_total(booking):
    installments = list(PaymentInstallment.objects.filter(booking=booking).order_by("created_at", "id"))
    if not installments:
        return

    total_amount = _to_money(booking.amount_fee)
    scoped = backjob_scoped_payments_active(booking)
    paid_exists = False
    legacy_paid_total = Decimal("0.00")
    for item in installments:
        if item.status == PaymentInstallment.Status.PAID:
            paid_exists = True
            legacy_paid_total += _to_money(item.amount)

    paid_total = backjob_phase_total_paid(booking) if scoped else legacy_paid_total

    remaining_amount = max(Decimal("0.00"), (total_amount - paid_total)).quantize(Decimal("0.01"))

    pending_installments = [
        item for item in installments if item.status == PaymentInstallment.Status.PENDING
    ]

    if paid_exists and not pending_installments and remaining_amount > Decimal("0.00"):
        PaymentInstallment.objects.create(
            booking=booking,
            installment_type=PaymentInstallment.Type.FINAL,
            amount=remaining_amount,
            status=PaymentInstallment.Status.PENDING,
        )
        return

    if not pending_installments:
        return

    if paid_exists:
        target = next(
            (item for item in pending_installments if item.installment_type == PaymentInstallment.Type.FINAL),
            None,
        )
        if target is None:
            target = next(
                (item for item in pending_installments if item.installment_type == PaymentInstallment.Type.FULL),
                None,
            )
        if target is None:
            target = pending_installments[0]

        if _to_money(target.amount) != remaining_amount:
            target.amount = remaining_amount
            target.save(update_fields=["amount", "updated_at"])
        return

    full_pending = [
        item for item in pending_installments if item.installment_type == PaymentInstallment.Type.FULL
    ]
    if full_pending:
        full_item = full_pending[0]
        if _to_money(full_item.amount) != total_amount:
            full_item.amount = total_amount
            full_item.save(update_fields=["amount", "updated_at"])
        return

    initial_pending = next(
        (item for item in pending_installments if item.installment_type == PaymentInstallment.Type.INITIAL),
        None,
    )
    final_pending = next(
        (item for item in pending_installments if item.installment_type == PaymentInstallment.Type.FINAL),
        None,
    )
    if initial_pending and final_pending:
        existing_total = _to_money(initial_pending.amount) + _to_money(final_pending.amount)
        if existing_total > 0:
            initial_ratio = (_to_money(initial_pending.amount) / existing_total)
        else:
            initial_ratio = Decimal("0.30")

        updated_initial = (total_amount * initial_ratio).quantize(Decimal("0.01"))
        if updated_initial >= total_amount:
            updated_initial = max(Decimal("0.00"), (total_amount - Decimal("0.01"))).quantize(Decimal("0.01"))
        updated_final = (total_amount - updated_initial).quantize(Decimal("0.01"))

        if _to_money(initial_pending.amount) != updated_initial:
            initial_pending.amount = updated_initial
            initial_pending.save(update_fields=["amount", "updated_at"])
        if _to_money(final_pending.amount) != updated_final:
            final_pending.amount = updated_final
            final_pending.save(update_fields=["amount", "updated_at"])


def _build_installment_plan(booking, use_initial_payment=False, initial_payment_amount=None):
    total_amount = _to_money(booking.amount_fee)
    if not use_initial_payment:
        return [(PaymentInstallment.Type.FULL, total_amount)]

    initial_amount = _to_money(initial_payment_amount)
    if initial_amount <= 0:
        initial_amount = (total_amount * Decimal("0.30")).quantize(Decimal("0.01"))
    if initial_amount >= total_amount:
        initial_amount = total_amount

    final_amount = (total_amount - initial_amount).quantize(Decimal("0.01"))
    if final_amount <= 0:
        return [(PaymentInstallment.Type.FULL, total_amount)]

    return [
        (PaymentInstallment.Type.INITIAL, initial_amount),
        (PaymentInstallment.Type.FINAL, final_amount),
    ]


def _ensure_installments_for_booking(booking, use_initial_payment=False, initial_payment_amount=None):
    if booking_has_backjob(booking) and _to_money(booking.amount_fee) <= Decimal("0.00"):
        return False

    # Respect an existing installment plan unless caller explicitly asks to seed initial/final.
    existing_qs = PaymentInstallment.objects.filter(booking=booking)
    if existing_qs.exists() and not use_initial_payment and initial_payment_amount is None:
        return False

    plan = _build_installment_plan(
        booking,
        use_initial_payment=use_initial_payment,
        initial_payment_amount=initial_payment_amount,
    )

    # Allow changing the initial/final split only before any payment is made.
    if len(plan) == 2 and {plan[0][0], plan[1][0]} == {PaymentInstallment.Type.INITIAL, PaymentInstallment.Type.FINAL}:
        existing_installments = list(PaymentInstallment.objects.filter(booking=booking))
        has_paid_installment = any(item.status == PaymentInstallment.Status.PAID for item in existing_installments)
        if has_paid_installment:
            return False

        plan_amounts = {installment_type: amount for installment_type, amount in plan}
        for installment_type in (PaymentInstallment.Type.INITIAL, PaymentInstallment.Type.FINAL):
            existing = next((it for it in existing_installments if it.installment_type == installment_type), None)
            if existing:
                if existing.amount != plan_amounts[installment_type]:
                    existing.amount = plan_amounts[installment_type]
                    existing.save(update_fields=["amount", "updated_at"])

    created_any = False
    for installment_type, amount in plan:
        _, created = PaymentInstallment.objects.get_or_create(
            booking=booking,
            installment_type=installment_type,
            defaults={"amount": amount, "status": PaymentInstallment.Status.PENDING},
        )
        created_any = created_any or created

    if len(plan) == 2 and {plan[0][0], plan[1][0]} == {PaymentInstallment.Type.INITIAL, PaymentInstallment.Type.FINAL}:
        # If an earlier attempt created a FULL pending row, remove it so charge targeting
        # does not pick FULL ahead of INITIAL during accepted-stage initial payment.
        PaymentInstallment.objects.filter(
            booking=booking,
            installment_type=PaymentInstallment.Type.FULL,
            status=PaymentInstallment.Status.PENDING,
        ).delete()

    if len(plan) == 1 and plan[0][0] == PaymentInstallment.Type.FULL:
        PaymentInstallment.objects.filter(
            booking=booking,
            installment_type__in=[PaymentInstallment.Type.INITIAL, PaymentInstallment.Type.FINAL],
            status=PaymentInstallment.Status.PENDING,
        ).delete()

    return created_any


def _get_payment_summary(booking):
    if booking_has_backjob(booking) and _to_money(booking.amount_fee) <= Decimal("0.00"):
        # Zero-amount backjob: stay "unpaid" until mechanic explicitly completes (free job).
        if booking.status == Booking.Status.PENDING_PAYMENT:
            return {
                "total_amount": 0.0,
                "total_paid": 0.0,
                "remaining_balance": 0.0,
                "fully_paid": False,
                "payment_status": Booking.PaymentStatus.UNPAID,
            }
        return {
            "total_amount": 0.0,
            "total_paid": 0.0,
            "remaining_balance": 0.0,
            "fully_paid": True,
            "payment_status": Booking.PaymentStatus.FULLY_PAID,
        }

    _sync_booking_payable_total(booking)
    _sync_pending_installments_to_total(booking)
    total_amount = _to_money(booking.amount_fee)
    installments = list(PaymentInstallment.objects.filter(booking=booking).order_by("created_at", "id"))

    if not installments:
        installments = [
            PaymentInstallment.objects.create(
                booking=booking,
                installment_type=PaymentInstallment.Type.FULL,
                amount=total_amount,
                status=PaymentInstallment.Status.PENDING,
            )
        ]

    scoped = backjob_scoped_payments_active(booking)
    total_paid = Decimal("0.00")
    for installment in installments:
        if installment.status == PaymentInstallment.Status.PAID:
            total_paid += _to_money(installment.amount)

    if scoped:
        total_paid = backjob_phase_total_paid(booking)

    total_paid = total_paid.quantize(Decimal("0.01"))
    remaining_balance = max(Decimal("0.00"), (total_amount - total_paid)).quantize(Decimal("0.01"))
    fully_paid = total_paid >= total_amount

    if fully_paid:
        payment_status = Booking.PaymentStatus.FULLY_PAID
    elif total_paid > 0:
        payment_status = Booking.PaymentStatus.PARTIALLY_PAID
    else:
        payment_status = Booking.PaymentStatus.UNPAID

    return {
        "total_amount": total_amount,
        "total_paid": total_paid,
        "remaining_balance": remaining_balance,
        "fully_paid": fully_paid,
        "payment_status": payment_status,
    }


def _resolve_installment_for_payment(booking, installment_type=None, for_update=False):
    queryset = PaymentInstallment.objects.filter(booking=booking)
    if for_update:
        queryset = queryset.select_for_update()

    if installment_type:
        normalized = str(installment_type).strip().lower()
        return queryset.filter(installment_type=normalized).first()

    full_pending = queryset.filter(
        installment_type=PaymentInstallment.Type.FULL,
        status=PaymentInstallment.Status.PENDING,
    ).first()
    if full_pending:
        return full_pending

    initial_pending = queryset.filter(
        installment_type=PaymentInstallment.Type.INITIAL,
        status=PaymentInstallment.Status.PENDING,
    ).first()
    if initial_pending:
        return initial_pending

    final_pending = queryset.filter(
        installment_type=PaymentInstallment.Type.FINAL,
        status=PaymentInstallment.Status.PENDING,
    ).first()
    if final_pending:
        return final_pending

    return queryset.order_by("created_at", "id").first()


def _get_next_installment_for_charge(booking):
    return _resolve_installment_for_payment(booking, for_update=False)


def _release_paid_installments(booking):
    unreleased_qs = PaymentInstallment.objects.filter(
        booking=booking,
        status=PaymentInstallment.Status.PAID,
        is_released=False,
    )
    if not unreleased_qs.exists():
        return 0
    return unreleased_qs.update(is_released=True, updated_at=timezone.now())


def _finalize_payment_success(
    booking,
    paid_at=None,
    external_reference=None,
    source_id=None,
    installment_type=None,
    method=None,
):
    paid_at = paid_at or timezone.now()
    method = str(method or "qr").lower().strip() or "qr"
    reference = str(external_reference).strip() if external_reference else None

    if booking_has_backjob(booking) and _to_money(booking.amount_fee) <= Decimal("0.00"):
        summary = _get_payment_summary(booking)
        return {
            "installment": None,
            "summary": summary,
            "fully_paid": True,
            "duplicate": True,
        }

    with transaction.atomic():
        booking = Booking.objects.select_for_update().get(id=booking.id)
        _ensure_installments_for_booking(booking)

        if reference:
            existing_tx = PaymentTransaction.objects.filter(
                reference=reference,
                status=PaymentTransaction.Status.SUCCESS,
            ).first()
            if existing_tx:
                summary = _get_payment_summary(booking)
                return {
                    "installment": existing_tx.installment,
                    "summary": summary,
                    "fully_paid": summary["fully_paid"],
                    "duplicate": True,
                }

        installment = _resolve_installment_for_payment(
            booking,
            installment_type=installment_type,
            for_update=True,
        )
        if installment is None:
            summary = _get_payment_summary(booking)
            return {
                "installment": None,
                "summary": summary,
                "fully_paid": summary["fully_paid"],
                "duplicate": True,
            }

        if installment.status == PaymentInstallment.Status.PAID:
            summary = _get_payment_summary(booking)
            return {
                "installment": installment,
                "summary": summary,
                "fully_paid": summary["fully_paid"],
                "duplicate": True,
            }

        installment.status = PaymentInstallment.Status.PAID
        installment.paid_at = paid_at
        if reference and not installment.external_reference:
            installment.external_reference = reference
        installment.save(update_fields=["status", "paid_at", "external_reference", "updated_at"])

        PaymentTransaction.objects.create(
            booking=booking,
            installment=installment,
            amount=installment.amount,
            method=method,
            reference=reference,
            status=PaymentTransaction.Status.SUCCESS,
        )

        summary = _get_payment_summary(booking)

        receipt, _ = Receipt.objects.get_or_create(booking=booking)
        receipt.payment_received = summary["fully_paid"]
        if summary["total_paid"] > 0 and not receipt.paid_at:
            receipt.paid_at = paid_at
        elif summary["fully_paid"]:
            receipt.paid_at = paid_at

        if source_id:
            receipt.ewallet_source_id = source_id
        if reference:
            receipt.transaction_id = reference

        receipt.save(
            update_fields=[
                "payment_received",
                "paid_at",
                "ewallet_source_id",
                "transaction_id",
            ]
        )

        if booking.payment_status != summary["payment_status"]:
            booking.payment_status = summary["payment_status"]

        if summary["fully_paid"] and booking.status == Booking.Status.PENDING_PAYMENT:
            booking.status = Booking.Status.COMPLETED
            booking.completed_at = paid_at
            booking.save(update_fields=["payment_status", "status", "completed_at", "updated_at"])
        else:
            booking.save(update_fields=["payment_status", "updated_at"])

    disbursed = False
    if summary["fully_paid"] and booking.status == Booking.Status.COMPLETED:
        disbursed = trigger_disbursement(booking)
        if disbursed:
            _release_paid_installments(booking)
            notify_payment_completed(booking)

    return {
        "installment": installment,
        "summary": summary,
        "fully_paid": summary["fully_paid"],
        "duplicate": False,
        "disbursed": bool(disbursed),
    }


def create_paymongo_source(amount, payment_method, booking_id, installment_type=None):
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
                    "installment_type": str(installment_type or ""),
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


def create_paymongo_maya_intent(amount, booking_id, installment_type=None):
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
                    "installment_type": str(installment_type or ""),
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


def _extract_installment_type_from_paymongo_event(event_payload):
    event_data = event_payload.get("data", {}) or {}
    event_attributes = event_data.get("attributes", {}) or {}
    resource = event_attributes.get("data", {}) or {}
    resource_attributes = resource.get("attributes", {}) or {}

    candidates = [
        resource_attributes.get("metadata", {}) or {},
        (
            ((resource_attributes.get("source", {}) or {}).get("data", {}) or {})
            .get("attributes", {}) or {}
        ).get("metadata", {}) or {},
    ]
    for metadata in candidates:
        raw = metadata.get("installment_type")
        if raw:
            return str(raw).strip().lower()
    return None


def trigger_disbursement(booking):
    """Trigger payout to mechanic/shop owner. Failures are logged but not shown to users."""
    summary = _get_payment_summary(booking)
    if not summary["fully_paid"]:
        logger.info("Skipping disbursement for booking %s: payment not fully released", booking.id)
        return False

    unreleased_exists = PaymentInstallment.objects.filter(
        booking=booking,
        status=PaymentInstallment.Status.PAID,
        is_released=False,
    ).exists()
    if not unreleased_exists:
        logger.info("Skipping disbursement for booking %s: installments already released", booking.id)
        return True

    try:
        receipt = booking.receipt
    except Exception:
        return False

    if not receipt.mechanic_payout:
        return False

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
        return False

    if not payout_number or not payout_method:
        logger.warning("No payout details for booking %s", booking.id)
        return False

    bank_code = str(payout_method).upper()
    valid_paymongo_codes = ["GCASH", "MAYA", "PAYMAYA"]
    if bank_code not in valid_paymongo_codes:
        print(
            f"[DISBURSEMENT] INVALID payout_method "
            f"'{payout_method}' for booking {booking.id}"
        )
        return False

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
            return True
        except requests.exceptions.HTTPError as e:
            print(
                f"[DISBURSEMENT] HTTP ERROR booking {booking.id} "
                f"| status: {e.response.status_code} "
                f"| body: {e.response.text}"
            )
            return False
        except requests.exceptions.Timeout:
            print(
                f"[DISBURSEMENT] TIMEOUT booking {booking.id}"
            )
            return False
        except Exception as e:
            print(
                f"[DISBURSEMENT] UNEXPECTED ERROR booking {booking.id} "
                f"| error: {str(e)}"
            )
            return False
    except Exception:
        logger.exception("Disbursement failed for booking %s", booking.id)
        return False


def notify_mechanic_cash_selected(booking):
    mechanic_ids = _get_mechanic_payment_recipient_ids(booking)
    _send_ws_event(
        mechanic_ids,
        {
            "action": "payment.cash_selected",
            "booking_id": booking.id,
            "status": booking.status,
            "message": "Client selected cash payment",
        },
    )


def notify_mechanic_waiting_payment(booking):
    mechanic_ids = _get_mechanic_payment_recipient_ids(booking)
    _send_ws_event(
        mechanic_ids,
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

    # Recompute from quotation items before we trust stored amount_fee (backjob: service + item new lines).
    _sync_booking_payable_total(booking)

    if booking_has_backjob(booking) and _to_money(booking.amount_fee) <= Decimal("0.00"):
        return Response({"error": "This backjob has no payable amount"}, status=400)

    use_initial_payment = bool(request.data.get("use_initial_payment", False))
    initial_payment_amount = request.data.get("initial_payment_amount")

    if not _is_payment_open(booking):
        return Response({"error": "Booking is not ready for payment"}, status=400)

    if _is_initial_stage_only(booking):
        if not use_initial_payment:
            return Response(
                {"error": "Only initial payment is allowed at this stage"},
                status=400,
            )
        try:
            requested_initial = _to_money(initial_payment_amount)
        except Exception:
            requested_initial = Decimal("0.00")
        if requested_initial <= 0:
            requested_initial = (_to_money(booking.amount_fee) * Decimal("0.30")).quantize(Decimal("0.01"))
            initial_payment_amount = requested_initial
        if requested_initial >= _to_money(booking.amount_fee):
            return Response(
                {"error": "Initial payment must be less than total amount"},
                status=400,
            )

    _ensure_installments_for_booking(
        booking,
        use_initial_payment=use_initial_payment,
        initial_payment_amount=initial_payment_amount,
    )
    _sync_pending_installments_to_total(booking)

    total, platform_fee, _, mechanic_payout = _compute_payment_split(booking)
    summary = _get_payment_summary(booking)
    target_installment = _get_next_installment_for_charge(booking)

    if not target_installment or target_installment.status == PaymentInstallment.Status.PAID:
        return Response({"error": "Booking is already fully paid"}, status=400)

    if _is_initial_stage_only(booking) and target_installment.installment_type != PaymentInstallment.Type.INITIAL:
        return Response(
            {"error": "Only initial payment can be charged before job completion"},
            status=400,
        )

    amount_to_charge = _to_money(target_installment.amount)

    if payment_method == "cash":
        token, _ = PaymentQRToken.objects.update_or_create(
            booking=booking,
            defaults={
                "token": uuid.uuid4(),
                "is_used": False,
                "expires_at": timezone.now() + timezone.timedelta(minutes=15),
            },
        )

        receipt_defaults = {
            "payment_method": "cash",
            "ewallet_type": None,
            "platform_fee": platform_fee,
            "mechanic_payout": mechanic_payout,
        }
        Receipt.objects.update_or_create(
            booking=booking,
            defaults=receipt_defaults,
        )

        notify_mechanic_cash_selected(booking)

        return Response(
            {
                "method": "cash",
                "token_ready": True,
                "token": str(token.token),
                "total_paid": str(summary["total_paid"]),
                "remaining_balance": str(summary["remaining_balance"]),
                "installment_type": target_installment.installment_type,
            }
        )

    try:
        if payment_method == "maya":
            checkout_url = create_paymongo_maya_intent(
                amount=amount_to_charge,
                booking_id=booking.id,
                installment_type=target_installment.installment_type,
            )
        else:
            checkout_url = create_paymongo_source(
                amount=amount_to_charge,
                payment_method=payment_method,
                booking_id=booking.id,
                installment_type=target_installment.installment_type,
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
            "total_paid": str(summary["total_paid"]),
            "remaining_balance": str(summary["remaining_balance"]),
            "installment_type": target_installment.installment_type,
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

    if not _can_access_booking_payment_qr(account, booking):
        return Response({"error": "Unauthorized"}, status=403)

    if not _is_payment_open(booking):
        return Response({"error": "Booking not ready for payment"}, status=400)

    _sync_booking_payable_total(booking)
    _sync_pending_installments_to_total(booking)
    target_installment = _get_next_installment_for_charge(booking)
    amount_due = _to_money(target_installment.amount) if target_installment else _to_money(booking.amount_fee)

    try:
        qr_token = booking.qr_token
    except PaymentQRToken.DoesNotExist:
        return Response({"error": "QR token not ready yet"}, status=404)

    if not qr_token.is_valid():
        return Response({"error": "QR token expired"}, status=400)

    return Response(
        {
            "token": str(qr_token.token),
            "amount": str(amount_due),
            "expires_at": qr_token.expires_at.isoformat(),
            "booking_id": booking.id,
            "installment_type": target_installment.installment_type if target_installment else None,
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

    if not _is_payment_open(qr_token.booking):
        return Response({"error": "Booking is not ready for payment"}, status=400)

    _sync_booking_payable_total(qr_token.booking)
    _sync_pending_installments_to_total(qr_token.booking)
    target_installment = _get_next_installment_for_charge(qr_token.booking)
    amount_due = _to_money(target_installment.amount) if target_installment else _to_money(qr_token.booking.amount_fee)

    mechanic_account = qr_token.booking.request.provider
    first = getattr(mechanic_account, "firstname", "") if mechanic_account else ""
    last = getattr(mechanic_account, "lastname", "") if mechanic_account else ""
    mechanic_name = f"{first} {last}".strip() or "Mechanic"

    return Response(
        {
            "valid": True,
            "token": str(qr_token.token),
            "booking_id": qr_token.booking.id,
            "amount": str(amount_due),
            "installment_type": target_installment.installment_type if target_installment else None,
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
    requested_installment_type = request.data.get("installment_type")
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

            if not _is_payment_open(booking):
                return Response({"error": "Booking not ready for payment"}, status=400)

            if _is_initial_stage_only(booking):
                requested_norm = str(requested_installment_type or PaymentInstallment.Type.INITIAL).strip().lower()
                if requested_norm != PaymentInstallment.Type.INITIAL:
                    return Response({"error": "Only initial payment is allowed at this stage"}, status=400)
                requested_installment_type = PaymentInstallment.Type.INITIAL

            qr_token.is_used = True
            qr_token.save(update_fields=["is_used"])

            now = timezone.now()

            _ensure_installments_for_booking(booking)
            result = _finalize_payment_success(
                booking,
                paid_at=now,
                external_reference=str(qr_token.token),
                installment_type=requested_installment_type,
                method=PaymentTransaction.Method.QR,
            )
    except Exception:
        logger.exception("QR confirm failed for booking token %s", token_value)
        return Response({"error": "Unable to confirm payment"}, status=500)

    summary = result["summary"]
    return Response(
        {
            "success": True,
            "message": "Payment confirmed successfully",
            "payment_status": summary["payment_status"],
            "total_paid": str(summary["total_paid"]),
            "remaining_balance": str(summary["remaining_balance"]),
            "fully_paid": bool(result["fully_paid"]),
        }
    )


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

    try:
        signature_ts = int(timestamp_value)
    except (TypeError, ValueError):
        return Response({"error": "Invalid signature timestamp"}, status=400)

    now_ts = int(timezone.now().timestamp())
    if abs(now_ts - signature_ts) > WEBHOOK_MAX_AGE_SECONDS:
        logger.warning("PayMongo webhook: stale timestamp rejected")
        return Response({"error": "Stale webhook event"}, status=400)

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

    # Check if this is a token purchase event
    metadata = resource_attributes.get("metadata", {}) or {}
    is_token_purchase = metadata.get("purpose") == "token_purchase"

    # For source-based e-wallet flow, source.chargeable must be charged by backend.
    if event_type == "source.chargeable":
        source_id = resource.get("id")
        amount = resource_attributes.get("amount")
        currency = resource_attributes.get("currency", "PHP")

        if source_id and amount:
            # Handle token purchase
            if is_token_purchase:
                from users.views.token_payment_views import _charge_token_purchase_source
                try:
                    purchase_id = metadata.get("purchase_id")
                    if purchase_id:
                        from users.models import TokenPurchase
                        purchase = TokenPurchase.objects.get(id=purchase_id)
                        _charge_token_purchase_source(source_id, purchase, resource_attributes)
                except Exception:
                    logger.exception("Failed to charge token purchase source %s", source_id)
                    return Response({"error": "Unable to charge token purchase source"}, status=500)
            else:
                # Handle booking payment
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
        installment_type = _extract_installment_type_from_paymongo_event(request.data)
        reference = resource.get("id")
        if reference and PaymentTransaction.objects.filter(
            reference=str(reference),
            status=PaymentTransaction.Status.SUCCESS,
        ).exists():
            return Response({"received": True, "duplicate": True})

        if booking_id:
            try:
                booking = Booking.objects.select_related("receipt").get(id=booking_id)
            except Booking.DoesNotExist:
                return Response({"received": True})

            if _is_payment_open(booking):
                # Keep source id when available; fallback to object id to retain external traceability.
                source_obj = (resource_attributes.get("source", {}) or {}).get("data", {}) or {}
                source_id = source_obj.get("id")
                source_attributes = source_obj.get("attributes", {}) or {}
                source_type = str(source_attributes.get("type") or "").lower()
                method = PaymentTransaction.Method.MAYA if source_type in {"paymaya", "maya"} else PaymentTransaction.Method.GCASH
                if _is_initial_stage_only(booking):
                    _ensure_installments_for_booking(booking, use_initial_payment=True)
                    installment_type = installment_type or PaymentInstallment.Type.INITIAL
                    if str(installment_type).lower() != PaymentInstallment.Type.INITIAL:
                        return Response({"received": True, "ignored": True})
                else:
                    _ensure_installments_for_booking(booking)
                _finalize_payment_success(
                    booking,
                    paid_at=timezone.now(),
                    external_reference=reference,
                    source_id=source_id,
                    installment_type=installment_type,
                    method=method,
                )

        # Handle token purchase payment completion
        # For payment.paid, also check source metadata since metadata may be nested
        payment_metadata = metadata
        if not is_token_purchase and event_type == "payment.paid":
            source_obj = (resource_attributes.get("source", {}) or {}).get("data", {}) or {}
            source_attributes = source_obj.get("attributes", {}) or {}
            source_metadata = source_attributes.get("metadata", {}) or {}
            if source_metadata.get("purpose") == "token_purchase":
                is_token_purchase = True
                payment_metadata = source_metadata

        if is_token_purchase:
            from users.views.token_payment_views import _finalize_token_purchase
            try:
                purchase_id = payment_metadata.get("purchase_id")
                if purchase_id:
                    from users.models import TokenPurchase
                    purchase = TokenPurchase.objects.get(id=purchase_id)
                    _finalize_token_purchase(purchase, resource_attributes)
                    logger.info("Token purchase %s finalized via payment.paid webhook", purchase_id)
            except TokenPurchase.DoesNotExist:
                logger.warning("Token purchase %s not found for payment.paid webhook", purchase_id)
            except Exception:
                logger.exception("Failed to finalize token purchase payment")

    if event_type == "payment_intent.succeeded":
        pi_metadata = resource_attributes.get("metadata", {}) or {}
        if pi_metadata.get("purpose") == "token_purchase":
            purchase_id = pi_metadata.get("purchase_id")
            if purchase_id:
                try:
                    from users.models import TokenPurchase
                    from users.views.token_payment_views import _finalize_token_purchase

                    purchase = TokenPurchase.objects.get(id=int(purchase_id))
                    _finalize_token_purchase(purchase, resource_attributes)
                    logger.info(
                        "Token purchase %s finalized via payment_intent.succeeded webhook",
                        purchase_id,
                    )
                except TokenPurchase.DoesNotExist:
                    logger.warning(
                        "Token purchase %s not found for payment_intent.succeeded",
                        purchase_id,
                    )
                except Exception:
                    logger.exception(
                        "Failed to finalize token purchase from payment_intent.succeeded",
                    )
            return Response({"received": True})

        booking_id = _extract_booking_id_from_paymongo_event(request.data)
        installment_type = _extract_installment_type_from_paymongo_event(request.data)
        reference = resource.get("id")
        if reference and PaymentTransaction.objects.filter(
            reference=str(reference),
            status=PaymentTransaction.Status.SUCCESS,
        ).exists():
            return Response({"received": True, "duplicate": True})

        if not booking_id:
            # Try extracting from payment intent metadata directly.
            resource_metadata = resource_attributes.get("metadata", {}) or {}
            booking_id = resource_metadata.get("booking_id")
            if not installment_type:
                installment_type = resource_metadata.get("installment_type")

        if booking_id:
            try:
                booking = Booking.objects.select_related("receipt").get(id=booking_id)
            except Booking.DoesNotExist:
                return Response({"received": True})

            if _is_payment_open(booking):
                if _is_initial_stage_only(booking):
                    _ensure_installments_for_booking(booking, use_initial_payment=True)
                    installment_type = installment_type or PaymentInstallment.Type.INITIAL
                    if str(installment_type).lower() != PaymentInstallment.Type.INITIAL:
                        return Response({"received": True, "ignored": True})
                else:
                    _ensure_installments_for_booking(booking)
                _finalize_payment_success(
                    booking,
                    paid_at=timezone.now(),
                    external_reference=reference,
                    installment_type=installment_type,
                    method=PaymentTransaction.Method.MAYA,
                )

    return Response({"received": True})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def pay_with_credits(request):
    """Process booking payment using user's credits (1:1 ratio with PHP).
    
    Deducts credits from client's wallet and adds them to mechanic's wallet.
    """
    from users.models import Account, TokenTransaction
    from django.db import transaction as db_transaction
    
    account = _get_authenticated_account(request)
    if not account:
        return Response({"error": "Authentication required"}, status=401)
    
    booking_id = request.data.get('booking_id')
    amount = Decimal(str(request.data.get('amount', 0)))
    
    if not booking_id:
        return Response({"error": "Booking ID is required"}, status=400)
    
    if amount <= 0:
        return Response({"error": "Amount must be greater than 0"}, status=400)
    
    # Required credits (1:1 ratio, rounded up)
    required_credits = int(amount)
    
    try:
        with db_transaction.atomic():
            # Lock client's wallet
            client_wallet = account.wallet
            client_wallet.refresh_from_db()
            
            if client_wallet.balance < required_credits:
                return Response({
                    "error": "Insufficient credits",
                    "required": required_credits,
                    "available": int(client_wallet.balance),
                }, status=402)
            
            # Get booking and verify ownership
            booking = Booking.objects.select_related(
                'request__client__account',
                'request__provider',
            ).get(id=booking_id)
            
            if booking.request.client.account_id != account.id:
                return Response({"error": "Unauthorized"}, status=403)
            
            # Deduct from client
            client_wallet.balance -= required_credits
            client_wallet.save(update_fields=['balance'])
            
            # Log client transaction
            TokenTransaction.objects.create(
                account=account,
                tokens=-required_credits,
                reason=f'Payment for booking #{booking_id}',
                related_booking_id=booking_id,
            )
            
            # Add to mechanic/provider wallet
            mechanic_account = booking.request.provider
            if mechanic_account and hasattr(mechanic_account, 'wallet'):
                mechanic_wallet = mechanic_account.wallet
                mechanic_wallet.balance += required_credits
                mechanic_wallet.save(update_fields=['balance'])
                
                # Log mechanic transaction
                TokenTransaction.objects.create(
                    account=mechanic_account,
                    tokens=required_credits,
                    reason=f'Earnings from booking #{booking_id}',
                    related_booking_id=booking_id,
                )
            
            # Mark payment as successful
            _finalize_payment_success(
                booking,
                paid_at=timezone.now(),
                external_reference=f'credits_{booking_id}_{timezone.now().timestamp()}',
                method='credits',
            )
            
            return Response({
                "success": True,
                "credits_deducted": required_credits,
                "remaining_balance": int(client_wallet.balance),
                "message": f"Payment of {required_credits} credits successful",
            })
            
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found"}, status=404)
    except Exception as e:
        logger.exception("Credits payment failed")
        return Response({"error": str(e)}, status=500)
