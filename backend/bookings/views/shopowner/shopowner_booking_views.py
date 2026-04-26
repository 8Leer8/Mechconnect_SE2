"""
Shop owner booking views: accept/decline direct requests.
Mirrors the mechanic accept/decline logic but for shop owner accounts.
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

from django.db.models import Prefetch, Q, Subquery
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal

from ...models import (
    Booking,
    Request,
    DirectRequest,
    DirectRequestAddOn,
    ActiveBooking,
    CustomRequest,
    EmergencyRequest,
    CompleteBooking,
    CancelBooking,
    ReworkBooking,
    DisputeBooking,
    BroadcastRequest,
    Quotation,
    Receipt,
    CashRemittance,
    RequestAssignment,
)
from ...serializers import RequestSerializer
from ...serializers import QuotationSerializer
from ...backjob_utils import booking_has_backjob
from ...direct_request_utils import iter_direct_request_services
from ...services import create_amendment_request
from users.models import Account, TokenTransaction
from services.models import ShopService
from shops.models import Shop
from services.pricing_utils import (
    get_distance_fee,
    get_traffic_surcharge,
    get_convenience_fee,
    apply_min_job_price,
    get_required_tokens,
)
from ..client.client_booking_views import _serialize_single_booking, _serialize_bookings
from ...ws_utils import notify_booking_parties, notify_user, post_quotation_chat_message
from ..mechanic.payment_views import _sync_booking_payable_total

EMERGENCY_REQUEST_TTL_MINUTES = 5


def _get_shopowner_account(request):
    """Return (account, error_response). error_response is None if ok."""
    account_id = request.session.get("account_id")
    if not account_id:
        return None, Response(
            {"error": "Authentication required"},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    try:
        account = Account.objects.get(id=account_id)
    except Account.DoesNotExist:
        return None, Response(
            {"error": "Account not found"},
            status=status.HTTP_404_NOT_FOUND,
        )
    if not hasattr(account, "shopowner"):
        return None, Response(
            {"error": "Only shop owners can access this resource"},
            status=status.HTTP_403_FORBIDDEN,
        )
    return account, None


def _get_owned_shop(account):
    try:
        return account.shopowner.shop
    except Exception:
        return None


def _reject_if_shop_unavailable(shop):
    """Same rule as discovery: only OPEN shops may take new inbound work."""
    if shop is None:
        return Response(
            {"error": "Shop not found for this shop owner"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if shop.status != Shop.Status.OPEN:
        return Response(
            {
                "error": "Your shop is unavailable. Switch to accept bookings.",
                "reason": "shop_unavailable",
                "shop_status": shop.status,
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


def _serialize_cash_remittance(remittance):
    booking = remittance.booking
    client_account = booking.request.client.account
    lead = remittance.lead_mechanic
    receipt = getattr(booking, "receipt", None)

    return {
        "id": remittance.id,
        "booking_id": booking.id,
        "amount": float(remittance.amount or 0),
        "status": remittance.status,
        "payment_method": getattr(receipt, "payment_method", "cash") if receipt else "cash",
        "reminders_count": remittance.reminders_count,
        "last_reminded_at": remittance.last_reminded_at.isoformat() if remittance.last_reminded_at else None,
        "received_at": remittance.received_at.isoformat() if remittance.received_at else None,
        "created_at": remittance.created_at.isoformat(),
        "booking": {
            "id": booking.id,
            "amount_fee": float(booking.amount_fee or 0),
            "completed_at": booking.completed_at.isoformat() if booking.completed_at else None,
        },
        "client": {
            "firstname": client_account.firstname,
            "lastname": client_account.lastname,
            "username": client_account.username,
        },
        "lead_mechanic": {
            "id": lead.id,
            "firstname": lead.firstname,
            "lastname": lead.lastname,
            "username": lead.username,
        },
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def list_cash_remittances(request):
    account, err = _get_shopowner_account(request)
    if err:
        return err

    shop = _get_owned_shop(account)
    if shop is None:
        return Response({"remittances": [], "count": 0}, status=status.HTTP_200_OK)

    status_filter = request.GET.get("status", "pending")
    queryset = CashRemittance.objects.filter(shop=shop).select_related(
        "booking",
        "booking__request",
        "booking__request__client__account",
        "lead_mechanic",
    )
    if status_filter != "all":
        queryset = queryset.filter(status=status_filter)

    remittances = [_serialize_cash_remittance(item) for item in queryset]
    return Response(
        {
            "remittances": remittances,
            "count": len(remittances),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def mark_cash_remittance_received(request, remittance_id):
    account, err = _get_shopowner_account(request)
    if err:
        return err

    shop = _get_owned_shop(account)
    remittance = CashRemittance.objects.filter(id=remittance_id, shop=shop).select_related(
        "booking",
        "booking__request",
        "booking__request__client__account",
        "lead_mechanic",
    ).first()
    if remittance is None:
        return Response({"error": "Cash remittance not found"}, status=status.HTTP_404_NOT_FOUND)

    if remittance.status != CashRemittance.Status.RECEIVED:
        remittance.status = CashRemittance.Status.RECEIVED
        remittance.received_at = timezone.now()
        remittance.save(update_fields=["status", "received_at", "updated_at"])

    notify_user(
        remittance.lead_mechanic_id,
        remittance.booking_id,
        remittance.booking.status,
        f"Shop owner marked your cash remittance of ₱{remittance.amount} as received.",
    )

    return Response(
        {
            "message": "Cash remittance marked as received.",
            "remittance": _serialize_cash_remittance(remittance),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def remind_cash_remittance(request, remittance_id):
    account, err = _get_shopowner_account(request)
    if err:
        return err

    shop = _get_owned_shop(account)
    remittance = CashRemittance.objects.filter(id=remittance_id, shop=shop).select_related(
        "booking",
        "booking__request",
        "booking__request__client__account",
        "lead_mechanic",
    ).first()
    if remittance is None:
        return Response({"error": "Cash remittance not found"}, status=status.HTTP_404_NOT_FOUND)

    if remittance.status == CashRemittance.Status.RECEIVED:
        return Response({"error": "Cash remittance is already received"}, status=status.HTTP_400_BAD_REQUEST)

    remittance.reminders_count += 1
    remittance.last_reminded_at = timezone.now()
    remittance.save(update_fields=["reminders_count", "last_reminded_at", "updated_at"])

    notify_user(
        remittance.lead_mechanic_id,
        remittance.booking_id,
        remittance.booking.status,
        f"Reminder: please remit the shop cash share of ₱{remittance.amount} for booking #{remittance.booking_id}.",
    )

    return Response(
        {
            "message": "Reminder sent to lead mechanic.",
            "remittance": _serialize_cash_remittance(remittance),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def list_shopowner_requests(request):
    """
    List pending requests for the logged-in shop owner (Jobs > Requests).
    Returns custom, direct, and broadcast requests sent to this shop (by shop or provider).
    """
    account, err = _get_shopowner_account(request)
    if err:
        return err

    shop_owner = account.shopowner
    try:
        shop = shop_owner.shop
    except Exception:
        shop = None

    request_ids_with_booking = Booking.objects.values("request_id")
    shop_filter = Q(provider=account)
    if shop is not None:
        shop_filter = Q(shop=shop) | Q(provider=account)

    all_requests = (
        Request.objects.filter(shop_filter)
        .exclude(id__in=Subquery(request_ids_with_booking))
        .exclude(request_type="emergency")
        .select_related(
            "client",
            "client__account",
            "provider",
            "shop",
            "service_location",
        )
        .prefetch_related(
            Prefetch("customrequest", queryset=CustomRequest.objects.all()),
            Prefetch("directrequest", queryset=DirectRequest.objects.all()),
            Prefetch("broadcast_request", queryset=BroadcastRequest.objects.all()),
        )
        .order_by("-created_at")
    )

    broadcast_requests = (
        Request.objects.filter(request_type="broadcast")
        .exclude(id__in=Subquery(request_ids_with_booking))
        .filter(broadcast_request__status="searching")
        .select_related("client", "client__account", "provider", "shop", "service_location")
        .prefetch_related(Prefetch("broadcast_request", queryset=BroadcastRequest.objects.all()))
        .order_by("-created_at")
    )

    filtered_pending_requests = []
    for req in all_requests:
        try:
            if req.request_type == "custom" and hasattr(req, "customrequest"):
                if req.customrequest.request_status == CustomRequest.Status.PENDING:
                    filtered_pending_requests.append(req)
            elif req.request_type == "direct" and hasattr(req, "directrequest"):
                if req.directrequest.request_status == "pending":
                    filtered_pending_requests.append(req)
            elif req.request_type == "broadcast" and hasattr(req, "broadcast_request"):
                if getattr(req.broadcast_request, "status", None) == "searching":
                    filtered_pending_requests.append(req)
        except Exception:
            continue
    for req in broadcast_requests:
        if req.id not in {r.id for r in filtered_pending_requests}:
            filtered_pending_requests.append(req)
    filtered_pending_requests.sort(key=lambda r: r.created_at, reverse=True)

    return Response(
        {"pending_requests": RequestSerializer(filtered_pending_requests, many=True).data},
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def list_shopowner_declined_requests(request):
    """
    List declined (cancelled) requests for the logged-in shop owner.
    Used by Jobs > Cancelled tab to show requests that were declined.
    """
    account, err = _get_shopowner_account(request)
    if err:
        return err

    shop_owner = account.shopowner
    try:
        shop = shop_owner.shop
    except Exception:
        shop = None

    shop_filter = Q(provider=account)
    if shop is not None:
        shop_filter = Q(shop=shop) | Q(provider=account)

    # Requests that have no booking and are declined (rejected)
    all_requests = (
        Request.objects.filter(shop_filter)
        .exclude(id__in=Subquery(Booking.objects.values("request_id")))
        .exclude(request_type="emergency")
        .exclude(request_type="broadcast")
        .select_related(
            "client",
            "client__account",
            "provider",
            "shop",
            "service_location",
        )
        .prefetch_related(
            Prefetch("customrequest", queryset=CustomRequest.objects.all()),
            Prefetch("directrequest", queryset=DirectRequest.objects.all()),
        )
        .order_by("-created_at")
    )

    request_ids_with_booking = Booking.objects.values("request_id")
    declined = []
    for req in all_requests:
        try:
            if req.request_type == "custom" and hasattr(req, "customrequest"):
                if req.customrequest.request_status == CustomRequest.Status.REJECTED:
                    declined.append(req)
            elif req.request_type == "direct" and hasattr(req, "directrequest"):
                if req.directrequest.request_status == DirectRequest.Status.REJECTED:
                    declined.append(req)
        except Exception:
            continue

    try:
        data = RequestSerializer(declined, many=True).data
    except Exception:
        data = []
    return Response(
        {"declined_requests": data},
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def list_shopowner_emergency_requests(request):
    """
    List active emergency requests for shop owners.
    """
    account, err = _get_shopowner_account(request)
    if err:
        return err

    emergency_expiry_cutoff = timezone.now() - timedelta(minutes=EMERGENCY_REQUEST_TTL_MINUTES)

    Request.objects.filter(
        request_type="emergency",
        provider__isnull=True,
        booking__isnull=True,
        created_at__lt=emergency_expiry_cutoff,
    ).delete()

    emergency_requests = (
        Request.objects.filter(
            request_type="emergency",
            provider__isnull=True,
            created_at__gte=emergency_expiry_cutoff,
        )
        .exclude(booking__isnull=False)
        .select_related("client", "client__account", "service_location")
        .prefetch_related(Prefetch("emergencyrequest", queryset=EmergencyRequest.objects.all()))
        .order_by("-created_at")
    )

    shop = _get_owned_shop(account)
    shopowner_can_accept = True
    accept_disabled_reason = None
    if shop and shop.status != Shop.Status.OPEN:
        shopowner_can_accept = False
        accept_disabled_reason = "shop_unavailable"

    serialized_data = RequestSerializer(emergency_requests, many=True, context={"request": request}).data
    return Response(
        {
            "emergency_requests": serialized_data,
            "count": len(serialized_data),
            "shopowner_can_accept": shopowner_can_accept,
            "accept_disabled_reason": accept_disabled_reason,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def shopowner_accept_emergency_request(request, request_id):
    """
    Shop owner accepts an emergency request and creates a booking.
    """
    account, err = _get_shopowner_account(request)
    if err:
        return err

    shop = _get_owned_shop(account)
    closed_err = _reject_if_shop_unavailable(shop)
    if closed_err:
        return closed_err

    try:
        req = Request.objects.get(id=request_id, request_type="emergency")
    except Request.DoesNotExist:
        return Response({"error": "Emergency request not found"}, status=status.HTTP_404_NOT_FOUND)

    if (
        req.provider_id is None
        and not hasattr(req, "booking")
        and req.created_at < timezone.now() - timedelta(minutes=EMERGENCY_REQUEST_TTL_MINUTES)
    ):
        req.delete()
        return Response({"error": "Emergency request expired"}, status=status.HTTP_400_BAD_REQUEST)

    if req.provider and req.provider != account:
        return Response({"error": "Request already assigned to another provider"}, status=status.HTTP_400_BAD_REQUEST)

    if hasattr(req, "booking"):
        return Response({"error": "Request already has a booking"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        shop = account.shopowner.shop
    except Exception:
        shop = None

    req.provider = account
    if getattr(req, "shop_id", None) is None and shop is not None:
        req.shop = shop
        req.save(update_fields=["provider", "shop"])
    else:
        req.save(update_fields=["provider"])

    amount_fee = 0
    body_amount = request.data.get("amount_fee")
    if body_amount is not None:
        try:
            amount_fee = float(body_amount)
        except (TypeError, ValueError):
            amount_fee = 0

    booking = Booking.objects.create(request=req, status=Booking.Status.ACCEPTED, amount_fee=amount_fee)
    ActiveBooking.objects.create(booking=booking)

    data = _serialize_single_booking(booking)

    notify_user(
        req.client_id,
        booking.id,
        booking.status,
        "Your emergency request has been accepted by a shop",
    )

    return Response({"message": "Emergency request accepted", "booking": data}, status=status.HTTP_201_CREATED)


def _normalize_traffic_level(value):
    raw = str(value or "").strip().lower()
    return {
        "light": "low",
        "low": "low",
        "moderate": "medium",
        "medium": "medium",
        "heavy": "high",
        "severe": "high",
        "high": "high",
        "unknown": "low",
    }.get(raw, "low")


def _to_float_or_none(value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int_or_none(value):
    if value is None or value == "":
        return None
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return None


def _calculate_broadcast_total(broadcast_request, distance_km, traffic_level):
    service_total = 0.0
    for service in broadcast_request.services.all():
        service_total += float(service.minimum_price)

    add_ons_total = 0.0
    for addon_relation in broadcast_request.add_ons.all():
        add_ons_total += float(addon_relation.service_add_on.price)

    service_subtotal = service_total + add_ons_total
    distance_fee = 0.0
    traffic_surcharge = 0.0
    if distance_km is not None:
        distance_fee = get_distance_fee(distance_km)
        traffic_surcharge = get_traffic_surcharge(distance_fee, traffic_level)

    convenience_fee = get_convenience_fee(service_subtotal)
    subtotal_amount = service_subtotal + distance_fee + traffic_surcharge + float(convenience_fee)
    total_amount = apply_min_job_price(subtotal_amount)

    return {
        "total_amount": total_amount,
        "convenience_fee": convenience_fee,
        "traffic_surcharge": traffic_surcharge,
        "required_tokens": get_required_tokens(total_amount),
    }


@api_view(["POST"])
@permission_classes([AllowAny])
def shopowner_accept_broadcast_request(request, broadcast_id):
    """Shop owner directly accepts a broadcast and creates an assignable shop booking."""
    account, err = _get_shopowner_account(request)
    if err:
        return err

    try:
        shop = account.shopowner.shop
    except Exception:
        return Response({"error": "Shop not found for this shop owner"}, status=status.HTTP_400_BAD_REQUEST)

    closed_err = _reject_if_shop_unavailable(shop)
    if closed_err:
        return closed_err

    distance_km = _to_float_or_none(request.data.get("distance_km"))
    eta_minutes = _to_int_or_none(request.data.get("estimated_eta_minutes"))
    traffic_level = _normalize_traffic_level(request.data.get("traffic_level"))

    from django.db import transaction

    with transaction.atomic():
        try:
            broadcast_request = (
                BroadcastRequest.objects.select_for_update()
                .select_related("request", "request__client")
                .prefetch_related("services", "add_ons__service_add_on")
                .get(id=broadcast_id)
            )
        except BroadcastRequest.DoesNotExist:
            return Response({"error": "Broadcast request not found"}, status=status.HTTP_404_NOT_FOUND)

        if not broadcast_request.can_accept_offers():
            return Response(
                {
                    "error": "This broadcast is no longer available",
                    "reason": "expired" if broadcast_request.is_expired() else "already_accepted",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        base_request = broadcast_request.request
        if base_request.client and base_request.client.account_id == account.id:
            return Response({"error": "Cannot accept your own broadcast request"}, status=status.HTTP_403_FORBIDDEN)

        if hasattr(base_request, "booking"):
            return Response({"error": "Request already has a booking"}, status=status.HTTP_400_BAD_REQUEST)

        pricing = _calculate_broadcast_total(broadcast_request, distance_km, traffic_level)
        required_tokens = pricing["required_tokens"]

        wallet = account.wallet
        if wallet.balance < required_tokens:
            return Response(
                {
                    "error": "Not enough credits to accept this broadcast",
                    "required_tokens": required_tokens,
                    "current_tokens": int(wallet.balance),
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        now = timezone.now()
        broadcast_request.status = BroadcastRequest.Status.ACCEPTED
        broadcast_request.accepted_at = now
        broadcast_request.save(update_fields=["status", "accepted_at"])

        base_request.provider = account
        base_request.shop = shop
        base_request.save(update_fields=["provider", "shop"])

        booking = Booking.objects.create(
            request=base_request,
            status=Booking.Status.ACCEPTED,
            amount_fee=pricing["total_amount"],
            distance_km=distance_km,
            convenience_fee=pricing["convenience_fee"],
            eta_minutes=eta_minutes,
            traffic_surcharge=pricing["traffic_surcharge"],
        )

        wallet.balance -= required_tokens
        wallet.save(update_fields=["balance"])
        TokenTransaction.objects.create(
            account=account,
            tokens=-required_tokens,
            reason="shop_broadcast_accept",
            related_booking_id=booking.id,
        )

    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        channel_layer = get_channel_layer()
        if channel_layer is not None:
            async_to_sync(channel_layer.group_send)("broadcasts", {
                "type": "booking_update",
                "action": "broadcast_removed",
                "broadcast_id": broadcast_request.id,
                "booking_id": booking.id,
                "message": "Broadcast accepted by shop",
            })
            async_to_sync(channel_layer.group_send)(f"user_{base_request.client.account_id}", {
                "type": "booking_update",
                "action": "broadcast_finalized",
                "broadcast_id": broadcast_request.id,
                "booking_id": booking.id,
                "status": booking.status,
                "message": "A shop accepted your broadcast request",
            })
    except Exception:
        pass

    notify_user(
        base_request.client.account_id,
        booking.id,
        booking.status,
        "A shop accepted your broadcast request",
    )

    return Response(
        {
            "message": "Broadcast accepted and booking created",
            "broadcast_id": broadcast_request.id,
            "booking_id": booking.id,
            "status": booking.status,
            "tokens_deducted": required_tokens,
            "tokens_remaining": int(wallet.balance),
            "booking": _serialize_single_booking(booking),
        },
        status=status.HTTP_201_CREATED,
    )


def _get_shopowner_request(request_id, request_type, account):
    """Get a Request by id and type that belongs to this shop owner (by shop or provider)."""
    try:
        shop = account.shopowner.shop
    except Exception:
        shop = None
    q = Request.objects.filter(id=request_id, request_type=request_type)
    if shop is not None:
        q = q.filter(Q(shop=shop) | Q(provider=account))
    else:
        q = q.filter(provider=account)
    return q.select_related("client", "shop").first()


@api_view(["POST"])
@permission_classes([AllowAny])
def shopowner_accept_direct_request(request, request_id):
    """
    Shop owner accepts a client's DIRECT request and turns it into a Booking.
    """
    account, err = _get_shopowner_account(request)
    if err:
        return err

    shop_for_gate = _get_owned_shop(account)
    closed_err = _reject_if_shop_unavailable(shop_for_gate)
    if closed_err:
        return closed_err

    req = _get_shopowner_request(request_id, "direct", account)
    if req is None:
        return Response(
            {"error": "Request not found for this shop owner"},
            status=status.HTTP_404_NOT_FOUND,
        )

    try:
        direct = DirectRequest.objects.select_related("service").get(request=req)
    except DirectRequest.DoesNotExist:
        return Response(
            {"error": "Direct request details not found"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if direct.request_status != DirectRequest.Status.PENDING:
        return Response(
            {"error": "Request is not pending"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if hasattr(req, "booking"):
        return Response(
            {"error": "Request already has a booking"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Sum base price for every service line (shop price or service minimum)
    shop = req.shop or account.shopowner.shop
    base_price = 0.0
    for svc in iter_direct_request_services(req):
        try:
            shop_service = ShopService.objects.get(shop=shop, service=svc)
            base_price += float(shop_service.price)
        except ShopService.DoesNotExist:
            base_price += float(getattr(svc, "minimum_price", 0))

    add_ons_total = 0.0
    for addon in DirectRequestAddOn.objects.filter(request=req).select_related("service_add_on"):
        add_ons_total += float(addon.service_add_on.price)
    total_amount = base_price + add_ons_total

    # Optional override from body
    body_amount = request.data.get("amount_fee")
    if body_amount is not None:
        try:
            total_amount = float(body_amount)
        except (TypeError, ValueError):
            pass

    direct.request_status = DirectRequest.Status.ACCEPTED
    direct.save(update_fields=["request_status"])

    booking = Booking.objects.create(
        request=req,
        status=Booking.Status.ACCEPTED,
        amount_fee=total_amount,
    )
    ActiveBooking.objects.create(booking=booking)

    data = _serialize_single_booking(booking)

    notify_user(
        req.client_id,
        booking.id,
        booking.status,
        "Your request has been accepted by a shop",
    )

    return Response(
        {"message": "Request accepted and booking created", "booking": data},
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def shopowner_decline_direct_request(request, request_id):
    """
    Shop owner declines a DIRECT request.
    """
    account, err = _get_shopowner_account(request)
    if err:
        return err

    req = _get_shopowner_request(request_id, "direct", account)
    if req is None:
        return Response(
            {"error": "Request not found for this shop owner"},
            status=status.HTTP_404_NOT_FOUND,
        )

    try:
        direct = DirectRequest.objects.get(request=req)
    except DirectRequest.DoesNotExist:
        return Response(
            {"error": "Direct request details not found"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if direct.request_status != DirectRequest.Status.PENDING:
        return Response(
            {"error": "Request is not pending"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    direct.request_status = DirectRequest.Status.REJECTED
    direct.save(update_fields=["request_status"])

    return Response(
        {"message": "Request declined", "request_id": req.id},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def shopowner_accept_custom_request(request, request_id):
    """
    Shop owner accepts a CUSTOM request with a quoted price.
    Body (optional): { "quoted_price": float, "providers_note": string }
    """
    account, err = _get_shopowner_account(request)
    if err:
        return err

    shop_for_gate = _get_owned_shop(account)
    closed_err = _reject_if_shop_unavailable(shop_for_gate)
    if closed_err:
        return closed_err

    req = _get_shopowner_request(request_id, "custom", account)
    if req is None:
        return Response(
            {"error": "Request not found for this shop owner"},
            status=status.HTTP_404_NOT_FOUND,
        )

    try:
        custom = CustomRequest.objects.get(request=req)
    except CustomRequest.DoesNotExist:
        return Response(
            {"error": "Custom request details not found"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if custom.request_status != CustomRequest.Status.PENDING:
        return Response(
            {"error": "Request is not pending"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    quoted_price = request.data.get("quoted_price")
    providers_note = request.data.get("providers_note")

    if quoted_price is not None:
        try:
            custom.quoted_price = float(quoted_price)
        except (TypeError, ValueError):
            return Response({"error": "Invalid quoted_price"}, status=status.HTTP_400_BAD_REQUEST)

    if providers_note is not None:
        custom.providers_note = providers_note

    # Mark custom request as quoted and create an accepted booking for this request
    custom.request_status = CustomRequest.Status.QUOTED
    custom.save()

    # Use quoted price if available, otherwise 0
    amount = float(custom.quoted_price or 0)

    if hasattr(req, "booking"):
        booking = req.booking
        booking.status = Booking.Status.ACCEPTED
        booking.amount_fee = amount
        booking.save(update_fields=["status", "amount_fee", "updated_at"])
    else:
        booking = Booking.objects.create(
            request=req,
            status=Booking.Status.ACCEPTED,
            amount_fee=amount,
        )
        ActiveBooking.objects.get_or_create(booking=booking)

    data = _serialize_single_booking(booking)

    return Response(
        {"message": "Custom request accepted and booking created", "booking": data},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def shopowner_decline_custom_request(request, request_id):
    """Shop owner declines a CUSTOM request."""
    account, err = _get_shopowner_account(request)
    if err:
        return err

    req = _get_shopowner_request(request_id, "custom", account)
    if req is None:
        return Response({"error": "Request not found"}, status=status.HTTP_404_NOT_FOUND)

    try:
        custom = CustomRequest.objects.get(request=req)
    except CustomRequest.DoesNotExist:
        return Response({"error": "Custom request details not found"}, status=status.HTTP_400_BAD_REQUEST)

    if custom.request_status != CustomRequest.Status.PENDING:
        return Response({"error": "Request is not pending"}, status=status.HTTP_400_BAD_REQUEST)

    custom.request_status = CustomRequest.Status.REJECTED
    custom.save(update_fields=["request_status"])

    return Response({"message": "Request declined", "request_id": req.id}, status=status.HTTP_200_OK)


# ── Shop owner booking list / detail ──────────────────────────────

def _shopowner_bookings_queryset(account):
    """Base queryset for all bookings where shop = this shopowner's shop."""
    try:
        shop = account.shopowner.shop
    except Exception:
        shop = None

    # Include:
    # 1) requests directly owned by this shop owner account,
    # 2) requests linked to this shop,
    # 3) broadcast-accepted requests where provider is a mechanic in this shop.
    #
    # This keeps shop-owner Jobs aligned with mechanic-side visibility while
    # still scoped to the shop owner context.
    owner_scope = Q(request__provider=account)
    if shop is not None:
        owner_scope = owner_scope | Q(request__shop=shop) | Q(request__provider__mechanic__shop=shop)

    return (
        Booking.objects.filter(owner_scope)
        .select_related(
            "request",
            "request__client",
            "request__client__account",
            "request__shop",
            "request__service_location",
            "request__provider",
        )
        .prefetch_related(
            Prefetch("activebooking", queryset=ActiveBooking.objects.all()),
            Prefetch("completebooking", queryset=CompleteBooking.objects.all()),
            Prefetch("cancelbooking", queryset=CancelBooking.objects.select_related("cancelled_by")),
            Prefetch("reworkbooking", queryset=ReworkBooking.objects.select_related("requested_by")),
            Prefetch(
                "disputebooking",
                queryset=DisputeBooking.objects.select_related("complainer", "complaint_against", "admin"),
            ),
            Prefetch("request__assignments", queryset=RequestAssignment.objects.select_related("mechanic")),
        )
        .order_by("-booked_at")
    )


def _shopowner_live_backjob_q():
    live_statuses = [
        Booking.Status.BACKJOB_PENDING,
        Booking.Status.REWORKED,
        Booking.Status.ACCEPTED,
        Booking.Status.ON_THE_WAY,
        Booking.Status.AT_LOCATION,
        Booking.Status.DIAGNOSING,
        Booking.Status.ACTIVE,
        Booking.Status.PAUSED,
        Booking.Status.FINISHED,
        Booking.Status.PENDING_PAYMENT,
    ]
    return ~Q(status=Booking.Status.COMPLETED) & Q(backjobs__status__in=live_statuses)


@api_view(["GET"])
@permission_classes([AllowAny])
def list_shopowner_bookings(request):
    """
    List bookings for the logged-in shop owner.

    Query params:
      ?status=all|on_going|accepted|on_the_way|active|paused|finished|pending_payment|completed|cancelled|reworked|disputed
      ?page=<int>&page_size=<int>
    If omitted → grouped response with counts.
    """
    account, err = _get_shopowner_account(request)
    if err:
        return err

    qs = _shopowner_bookings_queryset(account)
    status_filter = request.query_params.get("status")
    page = int(request.query_params.get("page", 1))
    page_size = int(request.query_params.get("page_size", 10))

    if status_filter:
        valid = [
            "all", "on_going", "accepted", "on_the_way", "at_location", "diagnosing",
            "active", "paused", "finished",
            "pending_payment", "completed", "cancelled", "reworked", "backjob_pending", "disputed",
        ]
        sf = status_filter.lower()
        if sf not in valid:
            return Response(
                {"error": f"Invalid status. Must be one of: {', '.join(valid)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if sf == "all":
            filtered = qs
        elif sf == "on_going":
            filtered = qs.filter(status__in=["on_the_way", "at_location", "diagnosing", "active", "paused"])
        elif sf == "active":
            filtered = qs.filter(status__in=["active", "paused"])
        elif sf == "reworked":
            filtered = qs.filter(Q(status__in=["reworked", "backjob_pending"]) | _shopowner_live_backjob_q()).distinct()
        else:
            filtered = qs.filter(status=sf)

        total_count = filtered.count()
        total_pages = (total_count + page_size - 1) // page_size if page_size > 0 else 0
        start_index = (page - 1) * page_size
        end_index = start_index + page_size
        paginated = filtered[start_index:end_index]
        data = _serialize_bookings(paginated)

        payload = {
            "status": sf,
            "bookings": data,
            "count": len(data),
            "total_count": total_count,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_previous": page > 1,
        }

        # Keep parity with mechanic list so frontend can render badges from one call.
        if sf == "all":
            accepted_count = qs.filter(status="accepted").count()
            on_the_way_count = qs.filter(status="on_the_way").count()
            at_location_count = qs.filter(status="at_location").count()
            diagnosing_count = qs.filter(status="diagnosing").count()
            active_count = qs.filter(status__in=["active", "paused"]).count()
            completed_count = qs.filter(status="completed").count()
            cancelled_count = qs.filter(status="cancelled").count()
            reworked_count = qs.filter(Q(status="reworked") | _shopowner_live_backjob_q()).distinct().count()
            disputed_count = qs.filter(dispute_status=Booking.DisputeState.ACTIVE).count()
            payload["tab_counts"] = {
                "pending": 0,
                "accepted": accepted_count,
                "on_the_way": on_the_way_count,
                "at_location": at_location_count,
                "diagnosing": diagnosing_count,
                "active": active_count,
                "completed": completed_count,
                "cancelled": cancelled_count,
                "reworked": reworked_count,
                "disputed": disputed_count,
            }

        return Response(payload)

    # Grouped response
    groups = {}
    all_bookings = list(qs)
    for s in [
        "accepted", "on_the_way", "at_location", "diagnosing", "active", "paused", "finished",
        "pending_payment", "completed", "cancelled", "reworked", "backjob_pending", "disputed",
    ]:
        sub = [booking for booking in all_bookings if booking.status == s]
        groups[s] = {"bookings": _serialize_bookings(sub), "count": len(sub)}

    groups["total_count"] = len(all_bookings)
    return Response(groups)


@api_view(["GET"])
@permission_classes([AllowAny])
def get_shopowner_booking_detail(request, booking_id):
    """Return full details for a single shopowner booking."""
    account, err = _get_shopowner_account(request)
    if err:
        return err

    try:
        booking = _shopowner_bookings_queryset(account).get(id=booking_id)
    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    return Response({"booking": _serialize_single_booking(booking)})


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def get_shopowner_booking_quotation(request, booking_id):
    """Return or update quotation payload for a shopowner-visible booking."""
    account, err = _get_shopowner_account(request)
    if err:
        return err

    try:
        booking = _shopowner_bookings_queryset(account).get(id=booking_id)
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "POST":
        if booking.status == Booking.Status.COMPLETED:
            return Response(
                {"error": "Completed bookings are read-only. Quotation data is frozen."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            data = dict(request.data or {})
        except Exception:
            data = request.data if isinstance(request.data, dict) else {}

        original_booking_status = booking.status
        try:
            try:
                existing = booking.quotation
            except Quotation.DoesNotExist:
                existing = Quotation.objects.create(
                    booking=booking,
                    mechanic=account,
                    status=Quotation.Status.ACCEPTED,
                    notes=data.get("notes", ""),
                    is_final=bool(data.get("is_final", False)),
                    is_backjob=booking_has_backjob(booking),
                )

            if data.get("action") == "delete":
                existing.delete()
                return Response({"message": "Quotation deleted"}, status=status.HTTP_200_OK)

            if "notes" in data:
                existing.notes = data.get("notes")
            if "is_final" in data:
                existing.is_final = bool(data.get("is_final", existing.is_final))
            existing.mechanic = account
            existing.is_backjob = booking_has_backjob(booking)
            existing.save(update_fields=["mechanic", "notes", "is_final", "is_backjob", "updated_at"])

            amendment = create_amendment_request(
                quotation_id=existing.id,
                mechanic_id=account.id,
                changes=data.get("items") or [],
            )
            existing.refresh_from_db()

            try:
                post_quotation_chat_message(
                    account,
                    booking,
                    existing,
                    action="updated",
                    request=request,
                    amendment=amendment,
                )
            except Exception:
                pass

            try:
                notify_booking_parties(
                    account.id,
                    booking.request.client.account_id,
                    booking.id,
                    booking.status,
                    "Quotation amendment request sent by shop owner",
                )
            except Exception:
                pass

            try:
                booking.refresh_from_db(fields=["status"])
                if booking.status != original_booking_status:
                    booking.status = original_booking_status
                    booking.save(update_fields=["status"])
            except Exception:
                pass

            try:
                if booking_has_backjob(booking):
                    _sync_booking_payable_total(booking)
            except Exception:
                pass

            payload = QuotationSerializer(existing, context={"request": request}).data
            payload["amendment_id"] = amendment.id
            payload["status"] = "pending"
            return Response(payload, status=status.HTTP_200_OK)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": "Failed to save quotation", "details": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    try:
        quotation = booking.quotation
    except Quotation.DoesNotExist:
        return Response(
            {
                "has_quotation": False,
                "booking_id": booking.id,
                "detail": "No quotation exists yet for this booking",
            },
            status=status.HTTP_200_OK,
        )

    ser = QuotationSerializer(quotation, context={"request": request})
    return Response(ser.data, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([AllowAny])
def shopowner_accept_backjob(request, booking_id):
    """Shop owner accepts a client's backjob request for a shop booking."""
    account, err = _get_shopowner_account(request)
    if err:
        return err

    try:
        booking = _shopowner_bookings_queryset(account).get(id=booking_id)
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND)

    try:
        backjob = booking.backjob
    except Exception:
        backjob = None
    if backjob is None:
        return Response({"error": "No backjob found for this booking"}, status=status.HTTP_404_NOT_FOUND)

    if backjob.status not in [
        Booking.Status.BACKJOB_PENDING,
        Booking.Status.REWORKED,
        Booking.Status.ACCEPTED,
        Booking.Status.ON_THE_WAY,
        Booking.Status.AT_LOCATION,
        Booking.Status.DIAGNOSING,
        Booking.Status.ACTIVE,
    ]:
        return Response({"error": "Backjob cannot be accepted in its current status"}, status=status.HTTP_400_BAD_REQUEST)

    if backjob.status in [Booking.Status.BACKJOB_PENDING, Booking.Status.REWORKED]:
        backjob.status = Booking.Status.ACCEPTED
        backjob.save(update_fields=["status", "updated_at"])

    booking.status = Booking.Status.ACCEPTED
    booking.amount_fee = Decimal("0.00")
    booking.convenience_fee = Decimal("0.00")
    booking.traffic_surcharge = Decimal("0.00")
    booking.completed_at = None
    booking.save(update_fields=[
        "status",
        "amount_fee",
        "convenience_fee",
        "traffic_surcharge",
        "completed_at",
        "updated_at",
    ])
    CompleteBooking.objects.filter(booking=booking).delete()
    Receipt.objects.filter(booking=booking).delete()

    try:
        from chat.models import Conversation, Message
        from chat.serializers import MessageSerializer
        from chat.permissions import sync_booking_conversation_participants
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        import json

        conv = Conversation.objects.filter(booking_id=booking.id).first()
        if conv is None:
            conv = Conversation.objects.create(title=f"Booking {booking.id}", booking_id=booking.id)
        sync_booking_conversation_participants(conv, booking)

        payload = {
            "type": "backjob_accepted",
            "mechanic_id": account.id,
            "mechanic_name": getattr(getattr(account, "shopowner", None), "shop", None).shop_name
            if getattr(getattr(account, "shopowner", None), "shop", None)
            else f"{account.firstname} {account.lastname}".strip(),
            "backjob_id": backjob.id,
            "booking_id": booking.id,
            "free": True,
            "message": "Shop owner accepted the backjob and set it as booked.",
        }

        existing_msg = Message.objects.filter(
            Q(content__contains="backjob_accepted") &
            Q(content__contains=f'"backjob_id": {backjob.id}'),
            conversation=conv,
        ).order_by("-id").first()
        msg = existing_msg or Message.objects.create(conversation=conv, sender=None, content=json.dumps(payload))
        ser = MessageSerializer(msg, context={"request": request})

        channel_layer = get_channel_layer()
        if channel_layer:
            payload_ws = {
                "type": "booking_update",
                "action": "new_chat_message",
                "conversation_id": conv.id,
                "message": ser.data,
            }
            for participant in conv.participants.exclude(id=account.id).all():
                async_to_sync(channel_layer.group_send)(f"user_{participant.id}", payload_ws)
    except Exception:
        pass

    notify_user(
        booking.request.client.account_id,
        booking.id,
        booking.status,
        "Your backjob request has been accepted by the shop owner",
    )

    return Response(
        {"message": "Backjob accepted", "backjob_id": backjob.id, "status": backjob.status},
        status=status.HTTP_200_OK,
    )
