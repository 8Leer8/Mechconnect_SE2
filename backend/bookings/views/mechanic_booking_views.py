from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from django.db.models import Prefetch
from ..models import (
    Booking,
    Request,
    DirectRequest,
    DirectRequestAddOn,
    ActiveBooking,
    CompleteBooking,
)
from users.models import Account
from services.models import MechanicService
from .client_booking_views import _serialize_bookings, _serialize_single_booking



# (All imports are already at the top of the file. No need to repeat here.)


@api_view(["POST"])
@permission_classes([AllowAny])
def mechanic_start_travel(request, booking_id):
    """
    Mechanic starts travel to client. Sets Booking.status = ON_THE_WAY.
    """
    account, err = _get_mechanic_account(request)
    if err:
        return err

    try:
        booking = Booking.objects.get(id=booking_id, request__provider=account)
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found or you do not have permission to update it"}, status=status.HTTP_404_NOT_FOUND)

    if booking.status != Booking.Status.ACCEPTED:
        return Response({"error": "Booking must be in 'accepted' status to start travel."}, status=status.HTTP_400_BAD_REQUEST)

    booking.status = Booking.Status.ON_THE_WAY
    booking.save(update_fields=["status"])
    return Response({"message": "Travel started.", "booking_id": booking.id, "status": booking.status}, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([AllowAny])
def mechanic_start_job(request, booking_id):
    """
    Mechanic starts the job. Sets Booking.status = ACTIVE.
    """
    account, err = _get_mechanic_account(request)
    if err:
        return err

    try:
        booking = Booking.objects.get(id=booking_id, request__provider=account)
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found or you do not have permission to update it"}, status=status.HTTP_404_NOT_FOUND)

    if booking.status not in [Booking.Status.ACCEPTED, Booking.Status.ON_THE_WAY]:
        return Response({"error": "Booking must be in 'accepted' or 'on_the_way' status to start job."}, status=status.HTTP_400_BAD_REQUEST)

    booking.status = Booking.Status.ACTIVE
    booking.save(update_fields=["status"])
    return Response({"message": "Job started.", "booking_id": booking.id, "status": booking.status}, status=status.HTTP_200_OK)


def _get_mechanic_account(request):
    """
    Helper to get the logged-in mechanic's Account.
    Returns (account, error_response). error_response is None when ok.
    """
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
    if not hasattr(account, "mechanic"):
        return None, Response(
            {"error": "Only mechanics can access this resource"},
            status=status.HTTP_403_FORBIDDEN,
        )
    return account, None


def _serialize_pending_direct_requests(account):
    """
    Build a list of booking-like dicts for pending DIRECT requests
    assigned to this mechanic (provider). These have no Booking yet
    but should appear in the mechanic 'pending' tab.
    """
    pending_reqs = (
        Request.objects.filter(
            provider=account,
            request_type="direct",
            directrequest__request_status=DirectRequest.Status.PENDING,
            booking__isnull=True,
        )
        .select_related(
            "client",
            "client__account",



            "provider",
            "service_location",
            "directrequest",
        )
        # DirectRequestAddOn is related to Request via `request` FK,
        # so the correct reverse name is `directrequestaddon_set`.
        .prefetch_related(
            Prefetch(
                "directrequestaddon_set",
                queryset=DirectRequestAddOn.objects.select_related("service_add_on"),
            )
        )
        .order_by("-created_at")
    )

    results = []
    for req in pending_reqs:
        direct = req.directrequest

        # Base price + add-ons (use mechanic's specific price if available)
        try:
            mechanic_service = MechanicService.objects.get(
                mechanic=account.mechanic,
                service=direct.service,
            )
            base_price = float(mechanic_service.price)
        except MechanicService.DoesNotExist:
            # Fallback to admin-defined minimum_price on Service
            base_price = float(getattr(direct.service, "minimum_price", 0))

        add_ons_total = 0.0
        for addon in req.directrequestaddon_set.all():
            add_ons_total += float(addon.service_add_on.price)
        total_amount = base_price + add_ons_total

        loc = req.service_location
        service_location = None
        if loc:
            service_location = {
                "street_name": loc.street_name,
                "subdivision_village": loc.subdivision_village,
                "barangay": loc.barangay,
                "city_municipality": loc.city_municipality,
                "landmark": loc.landmark,
            }

        # Booking-like structure; use request id as id
        results.append(
            {
                "id": req.id,
                "status": "pending",
                "amount_fee": total_amount,
                "booked_at": req.created_at.isoformat(),
                "updated_at": req.created_at.isoformat(),
                "completed_at": None,
                "request": {
                    "id": req.id,
                    "type": req.request_type,
                    "created_at": req.created_at.isoformat(),
                },
                "provider": {
                    "id": req.provider.id,
                    "name": f"{req.provider.firstname} {req.provider.lastname}",
                    "email": req.provider.email,
                }
                if req.provider
                else None,
                "service_location": service_location,
            }
        )

    return results


@api_view(["GET"])
@permission_classes([AllowAny])
def list_mechanic_bookings(request):
    """
    List bookings for the logged-in mechanic (provider side).

    Query params:
    - status: pending, active, completed, cancelled, reworked, disputed
      If omitted, returns grouped by status (including pending).
    """
    account, err = _get_mechanic_account(request)
    if err:
        return err

    status_filter = request.query_params.get("status", None)

    # All bookings where this mechanic is the provider
    bookings_queryset = (
        Booking.objects.filter(request__provider=account)
        .select_related(
            "request",
            "request__client",
            "request__client__account",
            "request__provider",
            "request__service_location",
        )
        .prefetch_related(
            Prefetch("activebooking", queryset=ActiveBooking.objects.all()),
            Prefetch("completebooking", queryset=CompleteBooking.objects.all()),
        )
        .order_by("-booked_at")
    )

    if status_filter:
        # Special handling for mechanic 'pending' tab
        if status_filter.lower() == "pending":
            pending_items = _serialize_pending_direct_requests(account)
            return Response(
                {
                    "status": "pending",
                    "bookings": pending_items,
                    "count": len(pending_items),
                },
                status=status.HTTP_200_OK,
            )

        valid_statuses = ["accepted", "on_the_way", "active", "completed", "cancelled", "reworked", "disputed"]
        if status_filter.lower() not in valid_statuses:
            return Response(
                {
                    "error": f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        bookings_queryset = bookings_queryset.filter(status=status_filter.lower())
        bookings_data = _serialize_bookings(bookings_queryset)
        return Response(
            {
                "status": status_filter.lower(),
                "bookings": bookings_data,
                "count": len(bookings_data),
            },
            status=status.HTTP_200_OK,
        )

    # Group by status (same shape as client_list_bookings) plus 'pending'
    accepted_bookings = bookings_queryset.filter(status="accepted")
    on_the_way_bookings = bookings_queryset.filter(status="on_the_way")
    active_bookings = bookings_queryset.filter(status="active")
    completed_bookings = bookings_queryset.filter(status="completed")
    cancelled_bookings = bookings_queryset.filter(status="cancelled")
    reworked_bookings = bookings_queryset.filter(status="reworked")
    disputed_bookings = bookings_queryset.filter(status="disputed")

    pending_items = _serialize_pending_direct_requests(account)

    return Response(
        {
            "pending": {
                "bookings": pending_items,
                "count": len(pending_items),
            },
            "accepted": {
                "bookings": _serialize_bookings(accepted_bookings),
                "count": accepted_bookings.count(),
            },
            "on_the_way": {
                "bookings": _serialize_bookings(on_the_way_bookings),
                "count": on_the_way_bookings.count(),
            },
            "active": {
                "bookings": _serialize_bookings(active_bookings),
                "count": active_bookings.count(),
            },
            "completed": {
                "bookings": _serialize_bookings(completed_bookings),
                "count": completed_bookings.count(),
            },
            "cancelled": {
                "bookings": _serialize_bookings(cancelled_bookings),
                "count": cancelled_bookings.count(),
            },
            "reworked": {
                "bookings": _serialize_bookings(reworked_bookings),
                "count": reworked_bookings.count(),
            },
            "disputed": {
                "bookings": _serialize_bookings(disputed_bookings),
                "count": disputed_bookings.count(),
            },
            "total_count": bookings_queryset.count() + len(pending_items),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def get_mechanic_booking_detail(request, booking_id):
    """
    Mechanic-side booking detail (same structure as client detail)
    but scoped to provider instead of client.
    """
    account, err = _get_mechanic_account(request)
    if err:
        return err

    try:
        booking = (
            Booking.objects.select_related(
                "request",
                "request__client",
                "request__client__account",
                "request__provider",
                "request__service_location",
            )
            .prefetch_related(
                Prefetch("activebooking", queryset=ActiveBooking.objects.all()),
                Prefetch("completebooking", queryset=CompleteBooking.objects.all()),
            )
            .get(id=booking_id, request__provider=account)
        )
    except Booking.DoesNotExist:
        return Response(
            {
                "error": "Booking not found or you do not have permission to view it"
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    data = _serialize_single_booking(booking)
    return Response({"booking": data}, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([AllowAny])
def mechanic_accept_direct_request(request, request_id):
    """
    Mechanic accepts a client's DIRECT request and turns it into a Booking.
    - Creates Booking (status=active) and ActiveBooking
    - Sets DirectRequest.request_status = accepted
    """
    account, err = _get_mechanic_account(request)
    if err:
        return err

    try:
        req = Request.objects.select_related("client", "provider").get(
            id=request_id, provider=account, request_type="direct"
        )
    except Request.DoesNotExist:
        return Response(
            {"error": "Request not found for this mechanic"},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Must have a DirectRequest and be pending
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

    # Calculate total amount from service + add-ons (same logic as pending)
    try:
        mechanic_service = MechanicService.objects.get(
            mechanic=account.mechanic,
            service=direct.service,
        )
        base_price = float(mechanic_service.price)
    except MechanicService.DoesNotExist:
        base_price = float(getattr(direct.service, "minimum_price", 0))

    add_ons_total = 0.0
    for addon in DirectRequestAddOn.objects.filter(request=req).select_related(
        "service_add_on"
    ):
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
        {
            "message": "Request accepted and booking created",
            "booking": data,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def mechanic_decline_direct_request(request, request_id):
    """
    Mechanic declines a DIRECT request.
    Sets DirectRequest.request_status = rejected.
    """
    account, err = _get_mechanic_account(request)
    if err:
        return err

    try:
        req = Request.objects.get(
            id=request_id, provider=account, request_type="direct"
        )
    except Request.DoesNotExist:
        return Response(
            {"error": "Request not found for this mechanic"},
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
def mechanic_complete_booking(request, booking_id):
    """
    Mechanic marks a booking as completed.
    - Creates or updates CompleteBooking
    - Sets Booking.status = completed and completed_at
    - Optionally updates Booking.amount_fee from total_amount

    Body (optional):
    - total_amount: final amount to charge
    - notes: completion notes
    """
    account, err = _get_mechanic_account(request)
    if err:
        return err

    try:
        booking = Booking.objects.select_related("request", "request__provider").get(
            id=booking_id, request__provider=account
        )
    except Booking.DoesNotExist:
        return Response(
            {"error": "Booking not found for this mechanic"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if booking.status == Booking.Status.COMPLETED:
        return Response(
            {"error": "Booking is already completed"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    total_amount = request.data.get("total_amount")
    notes = request.data.get("notes", "")

    if total_amount is not None:
        try:
            total_amount = float(total_amount)
        except (TypeError, ValueError):
            return Response(
                {"error": "total_amount must be a number"},
                status=status.HTTP_400_BAD_REQUEST,
            )
    else:
        total_amount = float(booking.amount_fee)

    now = timezone.now()

    complete, created = CompleteBooking.objects.get_or_create(
        booking=booking,
        defaults={"total_amount": total_amount, "notes": notes},
    )
    if not created:
        complete.total_amount = total_amount
        complete.notes = notes
        complete.save(update_fields=["total_amount", "notes"])

    booking.status = Booking.Status.COMPLETED
    booking.amount_fee = total_amount
    booking.completed_at = now
    booking.save(update_fields=["status", "amount_fee", "completed_at", "updated_at"])

    if hasattr(booking, "activebooking"):
        booking.activebooking.is_job_done = True
        booking.activebooking.save(update_fields=["is_job_done"])

    data = _serialize_single_booking(booking)
    return Response(
        {"message": "Booking completed", "booking": data},
        status=status.HTTP_200_OK,
    )

