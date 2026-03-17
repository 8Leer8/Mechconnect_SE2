from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from django.db.models import Prefetch, Sum, Q
from django.db import transaction
import logging
import traceback
from ...models import (
    Booking,
    Request,
    DirectRequest,
    DirectRequestAddOn,
    ActiveBooking,
    CompleteBooking,
    Receipt,
    CancelBooking,
)
from ...models import Quotation, QuotationItem
from users.models import Account
from services.models import MechanicService
from ..client.client_booking_views import _serialize_bookings, _serialize_single_booking
from ...serializers import QuotationSerializer
from ...ws_utils import notify_booking_parties



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
        booking = _get_accessible_booking(account, booking_id)
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found or you do not have permission to update it"}, status=status.HTTP_404_NOT_FOUND)

    # Allow idempotent start: if already on_the_way, return success; otherwise require ACCEPTED
    if booking.status not in [Booking.Status.ACCEPTED, Booking.Status.ON_THE_WAY]:
        return Response({"error": "Booking must be in 'accepted' or 'on_the_way' status to start travel."}, status=status.HTTP_400_BAD_REQUEST)

    if booking.status == Booking.Status.ON_THE_WAY:
        return Response({"message": "Travel already started.", "booking_id": booking.id, "status": booking.status}, status=status.HTTP_200_OK)

    booking.status = Booking.Status.ON_THE_WAY
    booking.save(update_fields=["status"])

    notify_booking_parties(
        account.id,
        booking.request.client.account_id,
        booking.id,
        booking.status,
        "Mechanic is now on the way",
    )

    return Response({"message": "Travel started.", "booking_id": booking.id, "status": booking.status}, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([AllowAny])
def mechanic_cancel_travel(request, booking_id):
    """
    Mechanic cancels travel and reverts status to ACCEPTED.
    """
    account, err = _get_mechanic_account(request)
    if err:
        return err

    try:
        booking = _get_accessible_booking(account, booking_id)
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found or you do not have permission to update it"}, status=status.HTTP_404_NOT_FOUND)

    if booking.status != Booking.Status.ON_THE_WAY:
        return Response({"error": "Booking must be in 'on_the_way' status to cancel travel."}, status=status.HTTP_400_BAD_REQUEST)

    booking.status = Booking.Status.ACCEPTED
    booking.save(update_fields=["status"])

    notify_booking_parties(
        account.id,
        booking.request.client.account_id,
        booking.id,
        booking.status,
        "Travel was cancelled and booking moved back to accepted",
    )

    return Response({"message": "Travel cancelled, status reverted to accepted.", "booking_id": booking.id, "status": booking.status}, status=status.HTTP_200_OK)


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
        booking = _get_accessible_booking(account, booking_id)
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found or you do not have permission to update it"}, status=status.HTTP_404_NOT_FOUND)

    if booking.status not in [Booking.Status.ACCEPTED, Booking.Status.ON_THE_WAY]:
        return Response({"error": "Booking must be in 'accepted' or 'on_the_way' status to start job."}, status=status.HTTP_400_BAD_REQUEST)

    # Make creation of ActiveBooking and status update atomic
    try:
        with transaction.atomic():
            active_booking, created = ActiveBooking.objects.get_or_create(booking=booking)
            if created or not active_booking.started_at:
                active_booking.started_at = timezone.now()
                active_booking.paused_at = None
                active_booking.save()

            booking.status = Booking.Status.ACTIVE
            booking.save(update_fields=["status"])
    except Exception as e:
        logger = logging.getLogger(__name__)
        tb = traceback.format_exc()
        logger.error("Failed to start job for booking %s: %s", booking_id, tb)
        # Return a concise error message but log full traceback to server logs
        return Response({"error": "Failed to start job", "details": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    notify_booking_parties(
        account.id,
        booking.request.client.account_id,
        booking.id,
        booking.status,
        "Job has started",
    )

    return Response({"message": "Job started.", "booking_id": booking.id, "status": booking.status}, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([AllowAny])
def mechanic_cancel_job(request, booking_id):
    """
    Mechanic cancels the job and reverts status to ON_THE_WAY.
    """
    account, err = _get_mechanic_account(request)
    if err:
        return err

    try:
        booking = _get_accessible_booking(account, booking_id)
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found or you do not have permission to update it"}, status=status.HTTP_404_NOT_FOUND)

    if booking.status != Booking.Status.ACTIVE:
        return Response({"error": "Booking must be in 'active' status to cancel job."}, status=status.HTTP_400_BAD_REQUEST)

    booking.status = Booking.Status.ON_THE_WAY
    booking.save(update_fields=["status"])

    notify_booking_parties(
        account.id,
        booking.request.client.account_id,
        booking.id,
        booking.status,
        "Job was cancelled and booking moved back to on_the_way",
    )

    return Response({"message": "Job cancelled, status reverted to on_the_way.", "booking_id": booking.id, "status": booking.status}, status=status.HTTP_200_OK)


@api_view(["POST"]) 
@permission_classes([AllowAny])
def mechanic_cancel_booking(request, booking_id):
    """
    Mechanic cancels the booking entirely.
    """
    account, err = _get_mechanic_account(request)
    if err:
        return err

    try:
        booking = _get_accessible_booking(account, booking_id)
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found or you do not have permission to update it"}, status=status.HTTP_404_NOT_FOUND)

    if booking.status == Booking.Status.CANCELLED:
        return Response({"error": "Booking already cancelled"}, status=status.HTTP_400_BAD_REQUEST)

    booking.status = Booking.Status.CANCELLED
    booking.save(update_fields=["status"])

    notify_booking_parties(
        account.id,
        booking.request.client.account_id,
        booking.id,
        booking.status,
        "Booking has been cancelled",
    )

    # create CancelBooking record
    CancelBooking.objects.create(booking=booking, cancelled_by=account, reason=request.data.get('reason', 'Cancelled by mechanic'))

    return Response({"message": "Booking cancelled.", "booking_id": booking.id, "status": booking.status}, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([AllowAny])
def mechanic_pause_job(request, booking_id):
    """
    Mechanic pauses the job. Sets Booking.status = PAUSED.
    """
    account, err = _get_mechanic_account(request)
    if err:
        return err


    try:
        booking = _get_accessible_booking(account, booking_id)
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found or you do not have permission to update it"}, status=status.HTTP_404_NOT_FOUND)

    try:
        active_booking = ActiveBooking.objects.get(booking=booking)
    except ActiveBooking.DoesNotExist:
        return Response({"error": "Active booking details not found. Start the job first."}, status=status.HTTP_400_BAD_REQUEST)

    if booking.status != Booking.Status.ACTIVE:
        return Response({"error": "Booking must be in 'active' status to pause the job."}, status=status.HTTP_400_BAD_REQUEST)

    booking.status = Booking.Status.PAUSED
    active_booking.paused_at = timezone.now()
    booking.save(update_fields=["status"])
    active_booking.save(update_fields=["paused_at"])

    notify_booking_parties(
        account.id,
        booking.request.client.account_id,
        booking.id,
        booking.status,
        "Job is paused",
    )
    
    return Response({"message": "Job paused.", "booking_id": booking.id, "status": booking.status}, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([AllowAny])
def mechanic_resume_job(request, booking_id):
    """
    Mechanic resumes the job. Sets Booking.status = ACTIVE.
    """
    account, err = _get_mechanic_account(request)
    if err:
        return err

    try:
        booking = _get_accessible_booking(account, booking_id)
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found or you do not have permission to update it"}, status=status.HTTP_404_NOT_FOUND)

    try:
        active_booking = ActiveBooking.objects.get(booking=booking)
    except ActiveBooking.DoesNotExist:
        return Response({"error": "Active booking details not found. Start the job first."}, status=status.HTTP_400_BAD_REQUEST)

    if booking.status != Booking.Status.PAUSED:
        return Response({"error": "Booking must be in 'paused' status to resume the job."}, status=status.HTTP_400_BAD_REQUEST)

    if active_booking.paused_at:
        pause_duration = timezone.now() - active_booking.paused_at
        active_booking.total_pause_duration += pause_duration
        active_booking.paused_at = None
        active_booking.save(update_fields=["total_pause_duration", "paused_at"])

    booking.status = Booking.Status.ACTIVE
    booking.save(update_fields=["status"])

    notify_booking_parties(
        account.id,
        booking.request.client.account_id,
        booking.id,
        booking.status,
        "Job has resumed",
    )
    
    return Response({"message": "Job resumed.", "booking_id": booking.id, "status": booking.status}, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([AllowAny])
def mechanic_finish_job(request, booking_id):
    """
    Mechanic finishes the job. Sets Booking.status = FINISHED.
    """
    account, err = _get_mechanic_account(request)
    if err:
        return err

    try:
        booking = _get_accessible_booking(account, booking_id)
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found or you do not have permission to update it"}, status=status.HTTP_404_NOT_FOUND)

    if booking.status != Booking.Status.ACTIVE:
        return Response({"error": "Booking must be in 'active' status to finish the job."}, status=status.HTTP_400_BAD_REQUEST)

    # When mechanic finishes the job, mark it as pending payment and create a receipt
    booking.status = Booking.Status.PENDING_PAYMENT
    booking.save(update_fields=["status"])

    # Create a receipt if not exists
    Receipt.objects.get_or_create(booking=booking)

    notify_booking_parties(
        account.id,
        booking.request.client.account_id,
        booking.id,
        booking.status,
        "Job finished and awaiting payment",
    )

    return Response({"message": "Job finished. Pending payment.", "booking_id": booking.id, "status": booking.status}, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([AllowAny])
def mechanic_payment_received(request, booking_id):
    """
    Mechanic confirms payment has been received. Sets Booking.status = PENDING_PAYMENT.
    """
    account, err = _get_mechanic_account(request)
    if err:
        return err

    try:
        booking = _get_accessible_booking(account, booking_id)
        receipt = Receipt.objects.get(booking=booking)
    except (Booking.DoesNotExist, Receipt.DoesNotExist):
        return Response({"error": "Booking or receipt not found"}, status=status.HTTP_404_NOT_FOUND)

    # Accept payment when booking is in pending_payment
    if booking.status != Booking.Status.PENDING_PAYMENT:
        return Response({"error": "Booking must be in 'pending_payment' status."}, status=status.HTTP_400_BAD_REQUEST)

    receipt.payment_received = True
    receipt.save(update_fields=["payment_received"])

    notify_booking_parties(
        account.id,
        booking.request.client.account_id,
        booking.id,
        booking.status,
        "Payment marked as received",
    )

    return Response({"message": "Payment received. Ready to mark as complete.", "booking_id": booking.id, "status": booking.status}, status=status.HTTP_200_OK)



@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def mechanic_booking_quotation(request, booking_id):
    """GET returns existing quotation for booking; POST creates/updates quotation and its items.
    Expected POST payload: {"notes": "...", "is_final": true/false, "items": [{"service": <id>|null, "service_add_on": <id>|null, "description": "", "quantity": 1, "unit_price": 100.0}, ...]}"""
    account, err = _get_mechanic_account(request)
    if err:
        return err

    try:
        booking = _get_accessible_booking(account, booking_id)
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found or you do not have permission to access it"}, status=status.HTTP_404_NOT_FOUND)

    # GET: return existing quotation or a clear empty response
    if request.method == 'GET':
        try:
            quotation = booking.quotation
            ser = QuotationSerializer(quotation, context={'request': request})
            return Response(ser.data, status=status.HTTP_200_OK)
        except Quotation.DoesNotExist:
            return Response(
                {
                    "has_quotation": False,
                    "booking_id": booking.id,
                    "detail": "No quotation exists yet for this booking",
                },
                status=status.HTTP_200_OK,
            )

    # POST: create or update
    if request.method == 'POST':
        data = request.data or {}
        ser = QuotationSerializer(data=data, context={'request': request, 'booking': booking, 'mechanic': account})
        try:
            # If quotation exists, update instead
            try:
                existing = booking.quotation
            except Quotation.DoesNotExist:
                existing = None

            if existing:
                quotation = ser.update(existing, data)
            else:
                quotation = ser.create(data)

            return Response(QuotationSerializer(quotation, context={'request': request}).data, status=status.HTTP_200_OK)
        except Exception as e:
            logging.getLogger(__name__).error("Quotation save failed: %s", traceback.format_exc())
            return Response({"error": "Failed to save quotation", "details": str(e)}, status=status.HTTP_400_BAD_REQUEST)


# Backward-compatible alias for older imports/usages
mechanic_quotation = mechanic_booking_quotation


@api_view(["POST"])
@permission_classes([AllowAny])
def mechanic_revert_stage(request, booking_id):
    """
    Mechanic reverts a booking to the previous logical stage/status.
    Mapping:
      - pending_payment, finished -> active
      - paused -> active
      - active -> on_the_way
      - on_the_way -> accepted
    """
    account, err = _get_mechanic_account(request)
    if err:
        return err

    try:
        booking = _get_accessible_booking(account, booking_id)
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found or you do not have permission to update it"}, status=status.HTTP_404_NOT_FOUND)

    prev_map = {
        Booking.Status.PENDING_PAYMENT: Booking.Status.ACTIVE,
        Booking.Status.FINISHED: Booking.Status.ACTIVE,
        Booking.Status.PAUSED: Booking.Status.ACTIVE,
        Booking.Status.ACTIVE: Booking.Status.ON_THE_WAY,
        Booking.Status.ON_THE_WAY: Booking.Status.ACCEPTED,
    }

    current = booking.status
    if current not in prev_map:
        return Response({"error": "Cannot revert booking from its current status."}, status=status.HTTP_400_BAD_REQUEST)

    new_status = prev_map[current]

    # Ensure ActiveBooking exists and has started_at when reverting to ACTIVE
    if new_status == Booking.Status.ACTIVE:
        try:
            active, _ = ActiveBooking.objects.get_or_create(booking=booking)
            if not active.started_at:
                active.started_at = timezone.now()
                active.paused_at = None
                active.save(update_fields=["started_at", "paused_at"])
        except Exception:
            # ignore failures to set started_at; still proceed with status change
            pass

    booking.status = new_status
    booking.save(update_fields=["status"])

    notify_booking_parties(
        account.id,
        booking.request.client.account_id,
        booking.id,
        booking.status,
        f"Booking reverted to {new_status}",
    )

    return Response({"message": f"Booking reverted to {new_status}.", "booking_id": booking.id, "status": booking.status}, status=status.HTTP_200_OK)


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


def _count_pending_direct_requests(account):
    """Return count of pending direct requests without serializing."""
    if getattr(account.mechanic, "is_working_for_shop", False):
        return 0

    return Request.objects.filter(
        provider=account,
        request_type="direct",
        directrequest__request_status=DirectRequest.Status.PENDING,
        booking__isnull=True,
    ).count()


def _mechanic_booking_access_q(account):
    """Access rule for mechanic bookings.

    - Shop mechanics: only jobs assigned in RequestAssignment.
    - Independent mechanics: jobs where they are the provider.
    """
    if getattr(account.mechanic, "is_working_for_shop", False):
        return Q(request__assignments__mechanic=account)
    return Q(request__provider=account)


def _get_accessible_booking(account, booking_id):
    return Booking.objects.filter(_mechanic_booking_access_q(account)).distinct().get(id=booking_id)


def _serialize_pending_direct_requests(account):
    """
    Build a list of booking-like dicts for pending DIRECT requests
    assigned to this mechanic (provider). These have no Booking yet
    but should appear in the mechanic 'pending' tab.
    """
    if getattr(account.mechanic, "is_working_for_shop", False):
        return []

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
    - status: pending, active, completed, cancelled, reworked, disputed, on_going
      If omitted, returns counts grouped by status (no booking data).
    - page: page number (1-indexed, default 1)
    - page_size: items per page (default 10)
    """
    account, err = _get_mechanic_account(request)
    if err:
        return err

    status_filter = request.query_params.get("status", None)
    page = int(request.query_params.get("page", 1))
    # Default page size for mechanic listing set to 5
    page_size = int(request.query_params.get("page_size", 5))

    # All bookings where this mechanic is the provider
    bookings_queryset = (
        Booking.objects.filter(_mechanic_booking_access_q(account))
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
        .distinct()
        .order_by("-booked_at")
    )

    if status_filter:
        # "all" status: paginate across every booking + pending requests
        if status_filter.lower() == "all":
            pending_count = _count_pending_direct_requests(account)
            bookings_count = bookings_queryset.count()
            total_count = pending_count + bookings_count
            total_pages = (total_count + page_size - 1) // page_size if page_size > 0 else 0
            start_index = (page - 1) * page_size
            end_index = start_index + page_size

            # Pending items come first, then bookings ordered by -booked_at
            paginated = []
            if start_index < pending_count:
                # Need some pending items on this page
                all_pending = _serialize_pending_direct_requests(account)
                pending_slice = all_pending[start_index:min(end_index, pending_count)]
                paginated.extend(pending_slice)

            if end_index > pending_count:
                # Need some booking items on this page
                booking_start = max(0, start_index - pending_count)
                booking_end = end_index - pending_count
                bookings_slice = bookings_queryset[booking_start:booking_end]
                paginated.extend(_serialize_bookings(bookings_slice))

            # Include tab counts so frontend doesn't need a separate request
            accepted_count = bookings_queryset.filter(status="accepted").count()
            on_the_way_count = bookings_queryset.filter(status="on_the_way").count()
            active_count = bookings_queryset.filter(status__in=["active", "paused"]).count()
            completed_count = bookings_queryset.filter(status="completed").count()
            cancelled_count = bookings_queryset.filter(status="cancelled").count()
            reworked_count = bookings_queryset.filter(status="reworked").count()
            disputed_count = bookings_queryset.filter(status="disputed").count()

            return Response(
                {
                    "status": "all",
                    "bookings": paginated,
                    "count": len(paginated),
                    "total_count": total_count,
                    "page": page,
                    "page_size": page_size,
                    "total_pages": total_pages,
                    "has_next": page < total_pages,
                    "has_previous": page > 1,
                    "tab_counts": {
                        "pending": pending_count,
                        "accepted": accepted_count,
                        "on_the_way": on_the_way_count,
                        "active": active_count,
                        "completed": completed_count,
                        "cancelled": cancelled_count,
                        "reworked": reworked_count,
                        "disputed": disputed_count,
                    },
                },
                status=status.HTTP_200_OK,
            )

        # Special handling for mechanic 'pending' tab (paginated)
        if status_filter.lower() == "pending":
            all_pending = _serialize_pending_direct_requests(account)
            total_count = len(all_pending)
            total_pages = (total_count + page_size - 1) // page_size if page_size > 0 else 0
            start_index = (page - 1) * page_size
            end_index = start_index + page_size
            paginated_pending = all_pending[start_index:end_index]
            return Response(
                {
                    "status": "pending",
                    "bookings": paginated_pending,
                    "count": len(paginated_pending),
                    "total_count": total_count,
                    "page": page,
                    "page_size": page_size,
                    "total_pages": total_pages,
                    "has_next": page < total_pages,
                    "has_previous": page > 1,
                },
                status=status.HTTP_200_OK,
            )

        # Combined on_going filter: on_the_way + active + paused
        if status_filter.lower() == "on_going":
            bookings_queryset = bookings_queryset.filter(
                status__in=["on_the_way", "active", "paused"]
            )
            total_count = bookings_queryset.count()
            total_pages = (total_count + page_size - 1) // page_size if page_size > 0 else 0
            start_index = (page - 1) * page_size
            end_index = start_index + page_size
            paginated_bookings = bookings_queryset[start_index:end_index]
            bookings_data = _serialize_bookings(paginated_bookings)
            return Response(
                {
                    "status": "on_going",
                    "bookings": bookings_data,
                    "count": len(bookings_data),
                    "total_count": total_count,
                    "page": page,
                    "page_size": page_size,
                    "total_pages": total_pages,
                    "has_next": page < total_pages,
                    "has_previous": page > 1,
                },
                status=status.HTTP_200_OK,
            )

        # Allow filtering by all statuses we expose in the grouped response
        valid_statuses = [
            "accepted",
            "on_the_way",
            "active",
            "paused",
            "finished",
            "pending_payment",
            "completed",
            "cancelled",
            "reworked",
            "disputed",
        ]
        if status_filter.lower() not in valid_statuses:
            return Response(
                {
                    "error": f"Invalid status. Must be one of: pending, on_going, {', '.join(valid_statuses)}"
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Treat 'active' as including paused bookings so paused items show up
        # in the mechanic's on-going/active filter.
        if status_filter.lower() == 'active':
            bookings_queryset = bookings_queryset.filter(status__in=['active', 'paused'])
        else:
            bookings_queryset = bookings_queryset.filter(status=status_filter.lower())

        total_count = bookings_queryset.count()
        total_pages = (total_count + page_size - 1) // page_size if page_size > 0 else 0
        start_index = (page - 1) * page_size
        end_index = start_index + page_size
        paginated_bookings = bookings_queryset[start_index:end_index]
        bookings_data = _serialize_bookings(paginated_bookings)

        return Response(
            {
                "status": status_filter.lower(),
                "bookings": bookings_data,
                "count": len(bookings_data),
                "total_count": total_count,
                "page": page,
                "page_size": page_size,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_previous": page > 1,
            },
            status=status.HTTP_200_OK,
        )

    # No status filter: return counts + aggregate stats (lightweight for tab badges / home screen)
    accepted_count = bookings_queryset.filter(status="accepted").count()
    on_the_way_count = bookings_queryset.filter(status="on_the_way").count()
    active_count = bookings_queryset.filter(status__in=["active", "paused"]).count()
    finished_count = bookings_queryset.filter(status="finished").count()
    pending_payment_count = bookings_queryset.filter(status="pending_payment").count()
    completed_count = bookings_queryset.filter(status="completed").count()
    cancelled_count = bookings_queryset.filter(status="cancelled").count()
    reworked_count = bookings_queryset.filter(status="reworked").count()
    disputed_count = bookings_queryset.filter(status="disputed").count()
    pending_count = _count_pending_direct_requests(account)

    # Single DB aggregate — much cheaper than fetching all completed records
    total_earnings = bookings_queryset.filter(status="completed").aggregate(
        total=Sum("amount_fee")
    )["total"] or 0

    return Response(
        {
            "pending": {"count": pending_count},
            "accepted": {"count": accepted_count},
            "on_the_way": {"count": on_the_way_count},
            "active": {"count": active_count},
            "finished": {"count": finished_count},
            "pending_payment": {"count": pending_payment_count},
            "completed": {"count": completed_count},
            "cancelled": {"count": cancelled_count},
            "reworked": {"count": reworked_count},
            "disputed": {"count": disputed_count},
            "total_count": bookings_queryset.count() + pending_count,
            "total_earnings": float(total_earnings),
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
            .filter(_mechanic_booking_access_q(account))
            .distinct()
            .get(id=booking_id)
        )
    except Booking.DoesNotExist:
        return Response(
            {
                "error": "Booking not found or you do not have permission to view it"
            },
            status=status.HTTP_404_NOT_FOUND,
        )

    # Ensure ActiveBooking exists for runtime details when booking is in a running/finished state
    if booking.status in [Booking.Status.ACTIVE, Booking.Status.PAUSED, Booking.Status.PENDING_PAYMENT, Booking.Status.FINISHED]:
        try:
            ActiveBooking.objects.get_or_create(booking=booking)
        except Exception:
            pass

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

    if getattr(account.mechanic, "is_working_for_shop", False):
        return Response(
            {"error": "Shop mechanics cannot accept direct requests directly. Jobs must come from shop assignments."},
            status=status.HTTP_403_FORBIDDEN,
        )

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

    notify_booking_parties(
        account.id,
        req.client.account_id,
        booking.id,
        booking.status,
        "Your request has been accepted",
    )

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

    if getattr(account.mechanic, "is_working_for_shop", False):
        return Response(
            {"error": "Shop mechanics cannot decline direct requests directly."},
            status=status.HTTP_403_FORBIDDEN,
        )

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

    notify_booking_parties(
        account.id,
        req.client.account_id,
        req.id,
        "rejected",
        "Your request has been declined",
    )

    return Response(
        {"message": "Request declined", "request_id": req.id},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def mechanic_accept_emergency_request(request, request_id):
    """
    Mechanic accepts an EMERGENCY request. Assigns the mechanic as provider
    and creates a Booking + ActiveBooking for the request.
    """
    account, err = _get_mechanic_account(request)
    if err:
        return err

    try:
        req = Request.objects.get(id=request_id, request_type="emergency")
    except Request.DoesNotExist:
        return Response({"error": "Emergency request not found"}, status=status.HTTP_404_NOT_FOUND)

    # If already assigned to another provider, reject
    if req.provider and req.provider != account:
        return Response({"error": "Request already assigned to another provider"}, status=status.HTTP_400_BAD_REQUEST)

    # If booking already exists, reject
    if hasattr(req, "booking"):
        return Response({"error": "Request already has a booking"}, status=status.HTTP_400_BAD_REQUEST)

    # Assign provider and create booking
    req.provider = account
    req.save(update_fields=["provider"])

    booking = Booking.objects.create(request=req, status=Booking.Status.ACCEPTED, amount_fee=0)
    ActiveBooking.objects.create(booking=booking)

    data = _serialize_single_booking(booking)

    notify_booking_parties(
        account.id,
        req.client.account_id,
        booking.id,
        booking.status,
        "Your emergency request has been accepted",
    )

    return Response({"message": "Emergency request accepted", "booking": data}, status=status.HTTP_201_CREATED)


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
        booking = (
            Booking.objects.select_related("request", "request__provider")
            .filter(_mechanic_booking_access_q(account))
            .distinct()
            .get(id=booking_id)
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

    notify_booking_parties(
        account.id,
        booking.request.client.account_id,
        booking.id,
        booking.status,
        "Your booking has been completed",
    )

    return Response(
        {"message": "Booking completed", "booking": data},
        status=status.HTTP_200_OK,
    )

