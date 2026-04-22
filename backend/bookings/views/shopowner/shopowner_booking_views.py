"""
Shop owner booking views: accept/decline direct requests.
Mirrors the mechanic accept/decline logic but for shop owner accounts.
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

from django.db.models import Prefetch, Q
from django.utils import timezone
from datetime import timedelta

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
)
from ...serializers import RequestSerializer
from ...serializers import QuotationSerializer
from users.models import Account
from services.models import ShopService
from ..client.client_booking_views import _serialize_single_booking, _serialize_bookings
from ...ws_utils import notify_user

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

    request_ids_with_booking = set(Booking.objects.values_list("request_id", flat=True))
    shop_filter = Q(provider=account)
    if shop is not None:
        shop_filter = Q(shop=shop) | Q(provider=account)

    all_requests = (
        Request.objects.filter(shop_filter)
        .exclude(id__in=request_ids_with_booking)
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
        .exclude(id__in=request_ids_with_booking)
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

    request_ids_with_booking = set(Booking.objects.values_list("request_id", flat=True))
    declined = []
    for req in all_requests:
        if req.id in request_ids_with_booking:
            continue
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

    serialized_data = RequestSerializer(emergency_requests, many=True, context={"request": request}).data
    return Response(
        {
            "emergency_requests": serialized_data,
            "count": len(serialized_data),
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

    # Calculate total from ShopService price or fallback to service minimum
    try:
        shop = req.shop or account.shopowner.shop
        shop_service = ShopService.objects.get(shop=shop, service=direct.service)
        base_price = float(shop_service.price)
    except (ShopService.DoesNotExist, Exception):
        base_price = float(getattr(direct.service, "minimum_price", 0))

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
        )
        .order_by("-booked_at")
    )


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
            "pending_payment", "completed", "cancelled", "reworked", "disputed",
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
            reworked_count = qs.filter(status="reworked").count()
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
    for s in [
        "accepted", "on_the_way", "at_location", "diagnosing", "active", "paused", "finished",
        "pending_payment", "completed", "cancelled", "reworked", "disputed",
    ]:
        sub = qs.filter(status=s)
        groups[s] = {"bookings": _serialize_bookings(sub), "count": sub.count()}

    groups["total_count"] = qs.count()
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


@api_view(["GET"])
@permission_classes([AllowAny])
def get_shopowner_booking_quotation(request, booking_id):
    """Return quotation payload for a shopowner-visible booking."""
    account, err = _get_shopowner_account(request)
    if err:
        return err

    try:
        booking = _shopowner_bookings_queryset(account).get(id=booking_id)
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND)

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
