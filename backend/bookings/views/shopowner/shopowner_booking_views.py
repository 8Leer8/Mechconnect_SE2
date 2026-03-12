"""
Shop owner booking views: accept/decline direct requests.
Mirrors the mechanic accept/decline logic but for shop owner accounts.
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

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
)
from users.models import Account
from services.models import ShopService
from ..client.client_booking_views import _serialize_single_booking, _serialize_bookings
from django.db.models import Prefetch


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


@api_view(["POST"])
@permission_classes([AllowAny])
def shopowner_accept_direct_request(request, request_id):
    """
    Shop owner accepts a client's DIRECT request and turns it into a Booking.
    """
    account, err = _get_shopowner_account(request)
    if err:
        return err

    # Get the shop for this shop owner
    shop = account.shopowner.shop

    try:
        req = Request.objects.select_related("client", "shop").get(
            id=request_id, shop=shop, request_type="direct"
        )
    except Request.DoesNotExist:
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
        shop = account.shopowner.shop
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

    # Get the shop for this shop owner
    shop = account.shopowner.shop

    try:
        req = Request.objects.get(
            id=request_id, shop=shop, request_type="direct"
        )
    except Request.DoesNotExist:
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

    # Get the shop for this shop owner
    shop = account.shopowner.shop

    try:
        req = Request.objects.select_related("client", "shop").get(
            id=request_id, shop=shop, request_type="custom"
        )
    except Request.DoesNotExist:
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

    custom.request_status = CustomRequest.Status.QUOTED
    custom.save()

    return Response(
        {"message": "Custom request quoted", "request_id": req.id},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def shopowner_decline_custom_request(request, request_id):
    """Shop owner declines a CUSTOM request."""
    account, err = _get_shopowner_account(request)
    if err:
        return err

    # Get the shop for this shop owner
    shop = account.shopowner.shop

    try:
        req = Request.objects.get(id=request_id, shop=shop, request_type="custom")
    except Request.DoesNotExist:
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
    shop = account.shopowner.shop
    return (
        Booking.objects.filter(request__shop=shop)
        .select_related(
            "request",
            "request__client",
            "request__client__account",
            "request__shop",
            "request__service_location",
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
      ?status=accepted|on_the_way|active|paused|finished|pending_payment|completed|cancelled|reworked|disputed
    If omitted → grouped response with counts.
    """
    account, err = _get_shopowner_account(request)
    if err:
        return err

    qs = _shopowner_bookings_queryset(account)
    status_filter = request.query_params.get("status")

    if status_filter:
        valid = [
            "accepted", "on_the_way", "active", "paused", "finished",
            "pending_payment", "completed", "cancelled", "reworked", "disputed",
        ]
        sf = status_filter.lower()
        if sf not in valid:
            return Response(
                {"error": f"Invalid status. Must be one of: {', '.join(valid)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if sf == "active":
            filtered = qs.filter(status__in=["active", "paused"])
        else:
            filtered = qs.filter(status=sf)
        data = _serialize_bookings(filtered)
        return Response({"status": sf, "bookings": data, "count": len(data)})

    # Grouped response
    groups = {}
    for s in ["accepted", "on_the_way", "active", "paused", "finished",
              "pending_payment", "completed", "cancelled", "reworked", "disputed"]:
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
