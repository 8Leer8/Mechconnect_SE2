from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.views import APIView
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
from django.db.models import Prefetch, Sum, Q
from django.db import transaction
from decimal import Decimal
import logging
import traceback
import requests
from ...models import (
    Backjob,
    Booking,
    Request,
    DirectRequest,
    DirectRequestAddOn,
    ActiveBooking,
    DisputeBooking,
    CompleteBooking,
    Receipt,
    CancelBooking,
    MechanicLocation,
    PaymentInstallment,
    RequestAssignment,
    ActiveBookingPhoto,
)
from ...models import Quotation, QuotationItem
from ...direct_request_utils import iter_direct_request_services
from ...backjob_utils import (
    booking_has_backjob,
    backjob_accepted_payable_total,
    backjob_quotation_has_pending_client_lines,
    get_booking_backjob,
)
from users.models import Account
from services.models import MechanicService
from ..client.client_booking_views import _serialize_bookings, _serialize_single_booking
from ...serializers import QuotationSerializer
from ...ws_utils import notify_booking_parties, post_quotation_chat_message
from .payment_views import _sync_booking_payable_total, _get_payment_summary
from ...services import create_amendment_request
from chat.models import Conversation, Message
from chat.serializers import MessageSerializer
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
import json


EMERGENCY_REQUEST_TTL_MINUTES = 5

ORS_API_KEY = getattr(settings, 'EXPO_PUBLIC_ORS_API_KEY', '')
TOMTOM_API_KEY = getattr(settings, 'EXPO_PUBLIC_TOMTOM_API_KEY', '')
BASE_FEE = Decimal('50')
RATE_PER_KM = Decimal('15')


def _to_float(value):
    if value is None or value == '':
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _get_traffic_from_tomtom(latitude: float, longitude: float):
    if not TOMTOM_API_KEY:
        return None

    url = (
        "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
        f"?point={latitude},{longitude}&key={TOMTOM_API_KEY}"
    )
    response = requests.get(url, timeout=12)
    if not response.ok:
        return None

    payload = response.json() or {}
    flow = payload.get('flowSegmentData') or {}
    current_speed = float(flow.get('currentSpeed') or 0)
    free_flow_speed = float(flow.get('freeFlowSpeed') or 0)
    if current_speed <= 0 or free_flow_speed <= 0:
        return None

    ratio = free_flow_speed / current_speed
    if ratio < 1.2:
        return {'traffic_level': 'light', 'surcharge_percent': Decimal('0.00')}
    if ratio < 1.5:
        return {'traffic_level': 'moderate', 'surcharge_percent': Decimal('0.10')}
    if ratio < 2.0:
        return {'traffic_level': 'heavy', 'surcharge_percent': Decimal('0.20')}
    return {'traffic_level': 'severe', 'surcharge_percent': Decimal('0.30')}


def _traffic_level_to_surcharge_percent(level: str):
    level_map = {
        'light': Decimal('0.00'),
        'moderate': Decimal('0.10'),
        'heavy': Decimal('0.20'),
        'severe': Decimal('0.30'),
    }
    return level_map.get((level or '').lower(), Decimal('0.10'))


def _get_realtime_traffic_snapshot(mechanic_lat, mechanic_lng, destination_lat, destination_lng):
    """
    Try multiple nearby points for TomTom flow data to improve success rate.
    Some coordinates can return no segment; midpoint/start/end probes are more reliable.
    """
    candidates = []
    if mechanic_lat is not None and mechanic_lng is not None and destination_lat is not None and destination_lng is not None:
        mid_lat = (mechanic_lat + destination_lat) / 2.0
        mid_lng = (mechanic_lng + destination_lng) / 2.0
        candidates.append((mid_lat, mid_lng))
    if mechanic_lat is not None and mechanic_lng is not None:
        candidates.append((mechanic_lat, mechanic_lng))
    if destination_lat is not None and destination_lng is not None:
        candidates.append((destination_lat, destination_lng))

    for lat, lng in candidates:
        try:
            snapshot = _get_traffic_from_tomtom(lat, lng)
            if snapshot:
                return snapshot
        except Exception:
            continue
    return None


def _get_route_from_ors(start_lng: float, start_lat: float, end_lng: float, end_lat: float):
    if not ORS_API_KEY:
        return None

    url = (
        "https://api.openrouteservice.org/v2/directions/driving-car"
        f"?api_key={ORS_API_KEY}&start={start_lng},{start_lat}&end={end_lng},{end_lat}"
    )
    response = requests.get(url, timeout=15)
    if not response.ok:
        return None

    payload = response.json() or {}
    feature = (payload.get('features') or [{}])[0]
    segment = ((feature.get('properties') or {}).get('segments') or [{}])[0]
    distance_m = float(segment.get('distance') or 0)
    duration_s = float(segment.get('duration') or 0)
    if distance_m <= 0 or duration_s <= 0:
        return None

    return {
        'distance_km': Decimal(str(distance_m / 1000)).quantize(Decimal('0.01')),
        'eta_minutes': max(1, int(round(duration_s / 60))),
    }


def _get_booking_destination_coordinates(booking):
    destination_lat = None
    destination_lng = None

    service_location = getattr(booking.request, 'service_location', None)
    if service_location is not None:
        try:
            if service_location.latitude is not None and service_location.longitude is not None:
                destination_lat = float(service_location.latitude)
                destination_lng = float(service_location.longitude)
        except (TypeError, ValueError):
            destination_lat = None
            destination_lng = None

    if (destination_lat is None or destination_lng is None) and hasattr(booking.request, 'broadcast_request'):
        br = booking.request.broadcast_request
        try:
            destination_lat = float(br.latitude)
            destination_lng = float(br.longitude)
        except (TypeError, ValueError):
            destination_lat = None
            destination_lng = None

    return destination_lat, destination_lng


def _get_accepted_offer_for_booking(booking):
    if not hasattr(booking.request, 'broadcast_request'):
        return None

    from ...models import BroadcastOffer

    return BroadcastOffer.objects.filter(
        broadcast_request=booking.request.broadcast_request,
        status=BroadcastOffer.Status.ACCEPTED,
    ).order_by('-responded_at', '-id').first()


def _clear_active_booking_started_for_revert(booking):
    """Clear job timer fields when leaving ACTIVE (e.g. back to diagnosing)."""
    try:
        ab = ActiveBooking.objects.get(booking=booking)
        ab.started_at = None
        ab.paused_at = None
        ab.total_pause_duration = timedelta(0)
        ab.save(update_fields=["started_at", "paused_at", "total_pause_duration"])
    except ActiveBooking.DoesNotExist:
        pass


def _refresh_on_the_way_metrics(booking, mechanic_lat=None, mechanic_lng=None, set_status=Booking.Status.ON_THE_WAY):
    accepted_offer = _get_accepted_offer_for_booking(booking)
    destination_lat, destination_lng = _get_booking_destination_coordinates(booking)

    # Reuse latest known mechanic coordinates when request payload is missing.
    if (mechanic_lat is None or mechanic_lng is None) and accepted_offer:
        try:
            if mechanic_lat is None and accepted_offer.mechanic_latitude is not None:
                mechanic_lat = float(accepted_offer.mechanic_latitude)
            if mechanic_lng is None and accepted_offer.mechanic_longitude is not None:
                mechanic_lng = float(accepted_offer.mechanic_longitude)
        except (TypeError, ValueError):
            mechanic_lat = mechanic_lat if mechanic_lat is not None else None
            mechanic_lng = mechanic_lng if mechanic_lng is not None else None

    route_data = None
    if (
        mechanic_lat is not None and mechanic_lng is not None and
        destination_lat is not None and destination_lng is not None
    ):
        try:
            route_data = _get_route_from_ors(mechanic_lng, mechanic_lat, destination_lng, destination_lat)
        except Exception:
            route_data = None

    distance_km = route_data['distance_km'] if route_data else None
    effective_distance_km = distance_km if distance_km is not None else booking.distance_km
    eta_minutes = route_data['eta_minutes'] if route_data else None

    traffic_snapshot = _get_realtime_traffic_snapshot(
        mechanic_lat,
        mechanic_lng,
        destination_lat,
        destination_lng,
    )

    traffic_level = (traffic_snapshot or {}).get('traffic_level')
    if not traffic_level:
        traffic_level = 'moderate'

    surcharge_percent = (traffic_snapshot or {}).get('surcharge_percent')
    if surcharge_percent is None:
        surcharge_percent = _traffic_level_to_surcharge_percent(traffic_level)

    convenience_fee = None
    traffic_surcharge = None
    if effective_distance_km is not None:
        distance_fee = (effective_distance_km * RATE_PER_KM).quantize(Decimal('0.01'))
        traffic_surcharge = (distance_fee * surcharge_percent).quantize(Decimal('0.01'))
        convenience_fee = (BASE_FEE + distance_fee + traffic_surcharge).quantize(Decimal('0.01'))

    booking.status = set_status
    booking.distance_km = distance_km if distance_km is not None else booking.distance_km
    booking.eta_minutes = eta_minutes if eta_minutes is not None else booking.eta_minutes
    booking.convenience_fee = convenience_fee if convenience_fee is not None else booking.convenience_fee
    booking.traffic_surcharge = traffic_surcharge if traffic_surcharge is not None else booking.traffic_surcharge
    booking.fee_locked_at = timezone.now()
    booking.save(update_fields=[
        "status",
        "distance_km",
        "eta_minutes",
        "convenience_fee",
        "traffic_surcharge",
        "fee_locked_at",
    ])

    if accepted_offer:
        if mechanic_lat is not None:
            accepted_offer.mechanic_latitude = Decimal(str(mechanic_lat)).quantize(Decimal('0.000001'))
        if mechanic_lng is not None:
            accepted_offer.mechanic_longitude = Decimal(str(mechanic_lng)).quantize(Decimal('0.000001'))
        if distance_km is not None:
            accepted_offer.distance_km = distance_km
        if convenience_fee is not None:
            accepted_offer.convenience_fee = convenience_fee
        accepted_offer.traffic_level = traffic_level
        if eta_minutes is not None:
            accepted_offer.estimated_eta_minutes = eta_minutes
        accepted_offer.responded_at = timezone.now()
        accepted_offer.save()

    return {
        "traffic_level": traffic_level,
        "accepted_offer": accepted_offer,
    }


def _broadcast_mechanic_location(booking, loc):
    """Send the latest mechanic GPS to booking viewers."""
    try:
        channel_layer = get_channel_layer()
        if channel_layer is None:
            return

        recipient_ids = set()
        try:
            if booking.request and booking.request.client and booking.request.client.account_id:
                recipient_ids.add(booking.request.client.account_id)
        except Exception:
            pass
        try:
            if (
                booking.request
                and booking.request.shop
                and booking.request.shop.shop_owner
                and booking.request.shop.shop_owner.account_id
            ):
                recipient_ids.add(booking.request.shop.shop_owner.account_id)
        except Exception:
            pass

        ws_event = {
            "type": "booking_update",
            "action": "mechanic_location_update",
            "booking_id": booking.id,
            "status": booking.status,
            "latitude": float(loc.latitude),
            "longitude": float(loc.longitude),
        }
        for rid in recipient_ids:
            if rid:
                async_to_sync(channel_layer.group_send)(f"user_{rid}", ws_event)
    except Exception:
        pass


def _save_mechanic_location(booking, mechanic_lat, mechanic_lng):
    if mechanic_lat is None or mechanic_lng is None:
        return None

    loc, _ = MechanicLocation.objects.update_or_create(
        booking=booking,
        defaults={
            "latitude": Decimal(str(mechanic_lat)).quantize(Decimal('0.000001')),
            "longitude": Decimal(str(mechanic_lng)).quantize(Decimal('0.000001')),
        },
    )
    _broadcast_mechanic_location(booking, loc)
    return loc



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

    # Allow refresh when already on_the_way: recompute metrics and relock fee values.
    if booking.status not in [Booking.Status.ACCEPTED, Booking.Status.ON_THE_WAY]:
        return Response({"error": "Booking must be in 'accepted' or 'on_the_way' status to start travel."}, status=status.HTTP_400_BAD_REQUEST)

    previous_status = booking.status

    mechanic_lat = _to_float(request.data.get('mechanic_latitude'))
    mechanic_lng = _to_float(request.data.get('mechanic_longitude'))

    refresh_result = _refresh_on_the_way_metrics(booking, mechanic_lat, mechanic_lng)
    traffic_level = refresh_result["traffic_level"]
    _save_mechanic_location(booking, mechanic_lat, mechanic_lng)

    notify_booking_parties(
        account.id,
        booking.request.client.account_id,
        booking.id,
        booking.status,
        "Mechanic is now on the way",
    )

    return Response(
        {
            "message": "Travel refreshed. Real-time fee and ETA locked." if previous_status == Booking.Status.ON_THE_WAY else "Travel started. Real-time fee and ETA locked.",
            "booking_id": booking.id,
            "status": booking.status,
            "distance_km": float(booking.distance_km) if booking.distance_km is not None else None,
            "estimated_eta_minutes": int(booking.eta_minutes) if booking.eta_minutes is not None else None,
            "convenience_fee": float(booking.convenience_fee) if booking.convenience_fee is not None else None,
            "traffic_surcharge": float(booking.traffic_surcharge) if booking.traffic_surcharge is not None else None,
            "traffic_level": traffic_level,
            "fee_locked_at": booking.fee_locked_at.isoformat() if booking.fee_locked_at else None,
        },
        status=status.HTTP_200_OK,
    )


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
def mechanic_arrived(request, booking_id):
    """
    Mechanic arrived at the service location. on_the_way -> at_location.
    """
    account, err = _get_mechanic_account(request)
    if err:
        return err

    try:
        booking = _get_accessible_booking(account, booking_id)
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found or you do not have permission to update it"}, status=status.HTTP_404_NOT_FOUND)

    if booking.status != Booking.Status.ON_THE_WAY:
        return Response({"error": "Booking must be in 'on_the_way' status to mark arrived."}, status=status.HTTP_400_BAD_REQUEST)

    booking.status = Booking.Status.AT_LOCATION
    booking.save(update_fields=["status"])

    notify_booking_parties(
        account.id,
        booking.request.client.account_id,
        booking.id,
        booking.status,
        "Mechanic has arrived at the location",
    )

    return Response(
        {"message": "Marked as at location.", "booking_id": booking.id, "status": booking.status},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def mechanic_start_diagnosing(request, booking_id):
    """
    Mechanic and client met; move to diagnosing. at_location -> diagnosing.
    """
    account, err = _get_mechanic_account(request)
    if err:
        return err

    try:
        booking = _get_accessible_booking(account, booking_id)
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found or you do not have permission to update it"}, status=status.HTTP_404_NOT_FOUND)

    if booking.status != Booking.Status.AT_LOCATION:
        return Response({"error": "Booking must be in 'at_location' status to start diagnosing."}, status=status.HTTP_400_BAD_REQUEST)

    booking.status = Booking.Status.DIAGNOSING
    booking.save(update_fields=["status"])

    notify_booking_parties(
        account.id,
        booking.request.client.account_id,
        booking.id,
        booking.status,
        "Mechanic is diagnosing the vehicle with the client",
    )

    return Response(
        {"message": "Diagnosing started.", "booking_id": booking.id, "status": booking.status},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
@parser_classes([MultiPartParser, FormParser, JSONParser])
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

    if booking.status != Booking.Status.DIAGNOSING:
        return Response({"error": "Booking must be in 'diagnosing' status to start job."}, status=status.HTTP_400_BAD_REQUEST)

    # Make creation of ActiveBooking and status update atomic
    try:
        with transaction.atomic():
            active_booking, created = ActiveBooking.objects.get_or_create(booking=booking)
            uploaded_before_photos = list(request.FILES.getlist("before_pictures"))
            uploaded_single_before = request.FILES.get("before_picture_service")
            if uploaded_single_before is not None:
                uploaded_before_photos.append(uploaded_single_before)

            has_existing_before = bool(active_booking.before_picture_service) or ActiveBookingPhoto.objects.filter(
                active_booking=active_booking,
                photo_type=ActiveBookingPhoto.PhotoType.BEFORE,
            ).exists()

            # First run only: require before photo(s) before starting the job.
            if (not has_existing_before) and not uploaded_before_photos:
                return Response(
                    {
                        "error": "before pictures are required before starting the job.",
                        "code": "before_photo_required",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if uploaded_before_photos:
                if not active_booking.before_picture_service:
                    active_booking.before_picture_service = uploaded_before_photos[0]
                    active_booking.save(update_fields=["before_picture_service"])
                ActiveBookingPhoto.objects.bulk_create(
                    [
                        ActiveBookingPhoto(
                            active_booking=active_booking,
                            photo=photo_file,
                            photo_type=ActiveBookingPhoto.PhotoType.BEFORE,
                        )
                        for photo_file in uploaded_before_photos
                    ]
                )

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
@parser_classes([MultiPartParser, FormParser, JSONParser])
def mechanic_append_before_photos(request, booking_id):
    """
    Append extra before-service photos while the job is active or paused
    (e.g. documenting an additional issue mid-job). Does not change booking status.
    """
    account, err = _get_mechanic_account(request)
    if err:
        return err

    try:
        booking = _get_accessible_booking(account, booking_id)
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found or you do not have permission to update it"}, status=status.HTTP_404_NOT_FOUND)

    if booking.status not in (Booking.Status.ACTIVE, Booking.Status.PAUSED):
        return Response(
            {"error": "You can add more before photos only while the job is active or paused."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    uploaded_before_photos = list(request.FILES.getlist("before_pictures"))
    uploaded_single_before = request.FILES.get("before_picture_service")
    if uploaded_single_before is not None:
        uploaded_before_photos.append(uploaded_single_before)

    if not uploaded_before_photos:
        return Response(
            {"error": "No photos uploaded.", "code": "no_photos"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        with transaction.atomic():
            active_booking = ActiveBooking.objects.select_for_update().get(booking=booking)
            if not active_booking.before_picture_service:
                active_booking.before_picture_service = uploaded_before_photos[0]
                active_booking.save(update_fields=["before_picture_service"])
            ActiveBookingPhoto.objects.bulk_create(
                [
                    ActiveBookingPhoto(
                        active_booking=active_booking,
                        photo=photo_file,
                        photo_type=ActiveBookingPhoto.PhotoType.BEFORE,
                    )
                    for photo_file in uploaded_before_photos
                ]
            )
    except ActiveBooking.DoesNotExist:
        return Response({"error": "Job has not started yet."}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error("append before photos booking %s: %s", booking_id, traceback.format_exc())
        return Response({"error": "Failed to save photos", "details": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    notify_booking_parties(
        account.id,
        booking.request.client.account_id,
        booking.id,
        booking.status,
        "Mechanic added before-service photos",
    )

    return Response(
        {"message": "Before photos added.", "booking_id": booking.id, "status": booking.status},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def mechanic_cancel_job(request, booking_id):
    """
    Mechanic cancels the job and reverts status to diagnosing (still on site with client).
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

    mechanic_lat = _to_float(request.data.get('mechanic_latitude'))
    mechanic_lng = _to_float(request.data.get('mechanic_longitude'))
    refresh_result = _refresh_on_the_way_metrics(
        booking, mechanic_lat, mechanic_lng, set_status=Booking.Status.DIAGNOSING
    )
    _clear_active_booking_started_for_revert(booking)

    notify_booking_parties(
        account.id,
        booking.request.client.account_id,
        booking.id,
        booking.status,
        "Job was cancelled and booking moved back to diagnosing",
    )

    return Response(
        {
            "message": "Job cancelled, status reverted to diagnosing.",
            "booking_id": booking.id,
            "status": booking.status,
            "distance_km": float(booking.distance_km) if booking.distance_km is not None else None,
            "estimated_eta_minutes": int(booking.eta_minutes) if booking.eta_minutes is not None else None,
            "convenience_fee": float(booking.convenience_fee) if booking.convenience_fee is not None else None,
            "traffic_surcharge": float(booking.traffic_surcharge) if booking.traffic_surcharge is not None else None,
            "traffic_level": refresh_result["traffic_level"],
            "fee_locked_at": booking.fee_locked_at.isoformat() if booking.fee_locked_at else None,
        },
        status=status.HTTP_200_OK,
    )


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
@parser_classes([MultiPartParser, FormParser, JSONParser])
def mechanic_finish_job(request, booking_id):
    """
    Mechanic finishes the job and moves booking to pending payment.
    Requires an after-service photo as a prerequisite to protect both parties.
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

    try:
        active_booking = ActiveBooking.objects.get(booking=booking)
    except ActiveBooking.DoesNotExist:
        return Response(
            {"error": "Active booking details not found. Start the job first."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Accept optional multipart image upload in the same request.
    uploaded_after_photos = list(request.FILES.getlist("after_pictures"))
    uploaded_single_after = request.FILES.get("after_picture_service")
    if uploaded_single_after is not None:
        uploaded_after_photos.append(uploaded_single_after)
    if uploaded_after_photos:
        if not active_booking.after_picture_service:
            active_booking.after_picture_service = uploaded_after_photos[0]
            active_booking.save(update_fields=["after_picture_service"])
        ActiveBookingPhoto.objects.bulk_create(
            [
                ActiveBookingPhoto(
                    active_booking=active_booking,
                    photo=photo_file,
                    photo_type=ActiveBookingPhoto.PhotoType.AFTER,
                )
                for photo_file in uploaded_after_photos
            ]
        )

    # Validation gate: do not allow status transition until after-service photo exists.
    has_after_photos = bool(active_booking.after_picture_service) or ActiveBookingPhoto.objects.filter(
        active_booking=active_booking,
        photo_type=ActiveBookingPhoto.PhotoType.AFTER,
    ).exists()
    if not has_after_photos:
        return Response(
            {
                "error": "after_picture_service is required before finishing the job.",
                "code": "after_photo_required",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if booking_has_backjob(booking):
        quotation = getattr(booking, "quotation", None)
        if quotation is not None:
            quotation.is_backjob = True
            quotation.recalculate_totals()
            quotation.save(update_fields=[
                "is_backjob",
                "original_labor_cost",
                "backjob_discount",
                "final_labor_total",
                "total_amount",
                "updated_at",
            ])

        if backjob_quotation_has_pending_client_lines(booking):
            return Response(
                {
                    "error": "Wait for the client to accept or reject the new quotation lines before finishing the job.",
                    "code": "quotation_pending_client_approval",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        backjob_total = (
            backjob_accepted_payable_total(quotation) if quotation is not None else Decimal("0.00")
        )

        booking.status = Booking.Status.PENDING_PAYMENT
        booking.payment_status = Booking.PaymentStatus.UNPAID
        booking.amount_fee = backjob_total
        booking.completed_at = None
        booking.save(update_fields=["status", "payment_status", "amount_fee", "completed_at", "updated_at"])

        Receipt.objects.get_or_create(booking=booking)
        PaymentInstallment.objects.update_or_create(
            booking=booking,
            installment_type=PaymentInstallment.Type.FULL,
            defaults={"amount": booking.amount_fee, "status": PaymentInstallment.Status.PENDING},
        )

        if backjob_total > Decimal("0.00"):
            client_message = "Backjob finished. Waiting for parts payment."
            response_message = "Backjob finished. Pending payment for parts only."
        else:
            client_message = "Backjob finished. No payment due — mechanic will confirm when the job is closed."
            response_message = (
                "Backjob finished. No payment due. Use Complete job as free on the booking screen to close the job."
            )

        notify_booking_parties(
            account.id,
            booking.request.client.account_id,
            booking.id,
            booking.status,
            client_message,
        )

        return Response(
            {
                "message": response_message,
                "booking_id": booking.id,
                "status": booking.status,
                "amount_fee": float(booking.amount_fee),
            },
            status=status.HTTP_200_OK,
        )

    # Finalize payable total before entering pending payment so payment summary and charge targets stay consistent.
    try:
        accepted_total = Decimal("0.00")
        quotation = getattr(booking, "quotation", None)
        if quotation is not None:
            for item in quotation.items.filter(status=Quotation.Status.ACCEPTED):
                accepted_total += Decimal(item.line_total or 0)
            accepted_total = accepted_total.quantize(Decimal("0.01"))

        current_total = Decimal(booking.amount_fee or 0).quantize(Decimal("0.01"))
        convenience_component = Decimal(booking.convenience_fee or 0).quantize(Decimal("0.01"))

        if accepted_total > 0:
            if convenience_component <= 0:
                inferred_convenience = (current_total - accepted_total).quantize(Decimal("0.01"))
                if inferred_convenience > 0:
                    convenience_component = inferred_convenience
            booking.amount_fee = (accepted_total + max(Decimal("0.00"), convenience_component)).quantize(Decimal("0.01"))
    except Exception:
        pass

    # When mechanic finishes the job, mark it as pending payment and create a receipt
    booking.status = Booking.Status.PENDING_PAYMENT
    booking.payment_status = Booking.PaymentStatus.UNPAID
    booking.save(update_fields=["status", "payment_status", "amount_fee", "updated_at"])

    # Create a receipt if not exists
    Receipt.objects.get_or_create(booking=booking)
    has_existing_plan = PaymentInstallment.objects.filter(booking=booking).exists()
    if not has_existing_plan:
        PaymentInstallment.objects.get_or_create(
            booking=booking,
            installment_type=PaymentInstallment.Type.FULL,
            defaults={
                "amount": booking.amount_fee,
                "status": PaymentInstallment.Status.PENDING,
            },
        )
    else:
        installments = list(PaymentInstallment.objects.filter(booking=booking).order_by("created_at", "id"))
        paid_total = Decimal("0.00")
        for row in installments:
            if row.status == PaymentInstallment.Status.PAID:
                paid_total += Decimal(row.amount or 0)

        total_amount = Decimal(booking.amount_fee or 0).quantize(Decimal("0.01"))
        remaining_amount = max(Decimal("0.00"), (total_amount - paid_total)).quantize(Decimal("0.01"))

        pending_final = next(
            (row for row in installments if row.status == PaymentInstallment.Status.PENDING and row.installment_type == PaymentInstallment.Type.FINAL),
            None,
        )
        pending_full = next(
            (row for row in installments if row.status == PaymentInstallment.Status.PENDING and row.installment_type == PaymentInstallment.Type.FULL),
            None,
        )
        target = pending_final or pending_full
        if target and Decimal(target.amount or 0).quantize(Decimal("0.01")) != remaining_amount:
            target.amount = remaining_amount
            target.save(update_fields=["amount", "updated_at"])

    notify_booking_parties(
        account.id,
        booking.request.client.account_id,
        booking.id,
        booking.status,
        "Job finished and awaiting payment",
    )

    try:
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync

        channel_layer = get_channel_layer()
        payload = {
            "type": "booking_update",
            "action": "booking.pending_payment",
            "booking_id": booking.id,
            "status": booking.status,
            "amount": float(booking.amount_fee),
            "message": "Booking is pending payment",
        }
        targets = {account.id, booking.request.client.account_id}
        for target in targets:
            if target and channel_layer:
                async_to_sync(channel_layer.group_send)(f"user_{target}", payload)
    except Exception:
        pass

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

    booking.payment_status = Booking.PaymentStatus.FULLY_PAID
    booking.save(update_fields=["payment_status"])

    notify_booking_parties(
        account.id,
        booking.request.client.account_id,
        booking.id,
        booking.status,
        "Payment marked as received",
    )

    return Response({"message": "Payment received. Ready to mark as complete.", "booking_id": booking.id, "status": booking.status}, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([AllowAny])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def mechanic_upload_dispute_receipt(request, booking_id):
    """Mechanic uploads refund proof, then dispute waits for client verification."""
    account, err = _get_mechanic_account(request)
    if err:
        return err

    try:
        booking = _get_accessible_booking(account, booking_id)
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found or you do not have permission to update it"}, status=status.HTTP_404_NOT_FOUND)

    try:
        dispute = booking.disputebooking
    except DisputeBooking.DoesNotExist:
        return Response({"error": "No dispute found for this booking"}, status=status.HTTP_404_NOT_FOUND)

    if booking.dispute_status != Booking.DisputeState.ACTIVE:
        return Response({"error": "Dispute is not active"}, status=status.HTTP_400_BAD_REQUEST)

    allowed_states = {
        DisputeBooking.Status.ACTIVE,
        DisputeBooking.Status.WAITING_FOR_MECHANIC_PAYMENT,
    }
    if dispute.status not in allowed_states:
        return Response(
            {"error": "Dispute is not waiting for mechanic payment proof"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    refund_receipt_image = request.FILES.get("refund_receipt_image")
    if refund_receipt_image is None:
        return Response({"error": "refund_receipt_image is required"}, status=status.HTTP_400_BAD_REQUEST)

    resolution_notes = str(request.data.get("resolution_notes", "")).strip()

    with transaction.atomic():
        dispute.refund_receipt_image = refund_receipt_image
        dispute.resolution_notes = resolution_notes or dispute.resolution_notes
        dispute.status = DisputeBooking.Status.WAITING_FOR_CLIENT_VERIFICATION
        dispute.save(update_fields=["refund_receipt_image", "resolution_notes", "status"])

    try:
        channel_layer = get_channel_layer()
        if channel_layer is not None:
            payload = {
                "type": "booking_update",
                "action": "booking.dispute_receipt_uploaded",
                "booking_id": booking.id,
                "status": booking.status,
                "dispute_status": booking.dispute_status,
                "message": "Mechanic uploaded refund proof",
            }
            targets = {
                account.id,
                booking.request.client.account_id,
                booking.request.provider_id,
            }
            for target in targets:
                if target:
                    async_to_sync(channel_layer.group_send)(f"user_{target}", payload)
    except Exception:
        pass

    return Response(
        {
            "message": "Refund receipt uploaded. Waiting for client verification.",
            "dispute": {
                "id": dispute.id,
                "status": dispute.status,
                "refund_receipt_image": dispute.refund_receipt_image.url if dispute.refund_receipt_image else None,
            },
            "booking": {
                "id": booking.id,
                "status": booking.status,
                "dispute_status": booking.dispute_status,
            },
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def mechanic_upload_quotation_item_receipt(request, booking_id, item_id):
    """Upload part receipt and propose final price update for sourced items."""
    account, err = _get_mechanic_account(request)
    if err:
        return err

    try:
        booking = _get_accessible_booking(account, booking_id)
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found or you do not have permission to update it"}, status=status.HTTP_404_NOT_FOUND)

    if booking.status == Booking.Status.COMPLETED:
        return Response(
            {"error": "Completed bookings are read-only. Quotation data is frozen."},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        quotation = booking.quotation
    except Quotation.DoesNotExist:
        return Response({"error": "No quotation found for this booking"}, status=status.HTTP_404_NOT_FOUND)

    try:
        qitem = quotation.items.get(id=item_id)
    except QuotationItem.DoesNotExist:
        return Response({"error": "Quotation item not found"}, status=status.HTTP_404_NOT_FOUND)

    if qitem.line_kind != QuotationItem.LineKind.ITEM:
        return Response({"error": "Receipt upload is only allowed for item quotations"}, status=status.HTTP_400_BAD_REQUEST)

    if qitem.source != QuotationItem.ItemSource.TO_BE_PURCHASED:
        return Response({"error": "Receipt upload is only required for 'to be purchased' items"}, status=status.HTTP_400_BAD_REQUEST)

    receipt_image = request.FILES.get("receipt_image")
    if receipt_image is None:
        return Response({"error": "receipt_image is required"}, status=status.HTTP_400_BAD_REQUEST)

    actual_unit_price_raw = request.data.get("actual_unit_price")
    if actual_unit_price_raw in (None, ""):
        actual_unit_price = Decimal(str(qitem.unit_price or 0))
    else:
        try:
            actual_unit_price = Decimal(str(actual_unit_price_raw))
        except Exception:
            return Response({"error": "actual_unit_price must be a valid number"}, status=status.HTTP_400_BAD_REQUEST)

    if actual_unit_price < 0:
        return Response({"error": "actual_unit_price must be non-negative"}, status=status.HTTP_400_BAD_REQUEST)

    old_price = Decimal(str(qitem.unit_price or 0))
    price_changed = actual_unit_price != old_price

    with transaction.atomic():
        qitem.purchase_receipt_image = receipt_image
        qitem.receipt_submitted_at = timezone.now()

        if price_changed:
            qitem.previous_description = qitem.description
            qitem.previous_quantity = qitem.quantity
            qitem.previous_unit_price = old_price
            qitem.unit_price = actual_unit_price
            qitem.status = Quotation.Status.PENDING
            qitem.change_type = "edited"

        qitem.save()

        try:
            has_pending_like = quotation.items.filter(status__in=[Quotation.Status.PENDING, Quotation.Status.REJECTED]).exists()
            quotation.status = Quotation.Status.PENDING if has_pending_like else Quotation.Status.ACCEPTED
        except Exception:
            pass

        try:
            quotation.total_amount = sum(float(i.line_total) for i in quotation.items.exclude(status=Quotation.Status.REJECTED))
        except Exception:
            quotation.total_amount = 0
        quotation.save(update_fields=["status", "total_amount", "updated_at"])

    try:
        post_quotation_chat_message(account, booking, quotation, action="updated", request=request)
    except Exception:
        pass

    try:
        notify_booking_parties(
            account.id,
            booking.request.client.account_id,
            booking.id,
            booking.status,
            "Quotation receipt uploaded. Please review updated item price." if price_changed else "Quotation receipt uploaded.",
        )
    except Exception:
        pass

    return Response(
        {
            "message": "Receipt uploaded and price-difference request sent." if price_changed else "Receipt uploaded.",
            "quotation_id": quotation.id,
            "item": {
                "id": qitem.id,
                "description": qitem.description,
                "unit_price": float(qitem.unit_price),
                "previous_unit_price": float(qitem.previous_unit_price) if qitem.previous_unit_price is not None else None,
                "status": qitem.status,
                "change_type": qitem.change_type,
                "purchase_receipt_image": qitem.purchase_receipt_image.url if qitem.purchase_receipt_image else None,
            },
        },
        status=status.HTTP_200_OK,
    )


class SubmitDisputeDefenseView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request, booking_id):
        """Mechanic submits defense text + evidence photo for admin review."""
        account, err = _get_mechanic_account(request)
        if err:
            return err

        try:
            booking = _get_accessible_booking(account, booking_id)
        except Booking.DoesNotExist:
            return Response(
                {"error": "Booking not found or you do not have permission to update it"},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            dispute = booking.disputebooking
        except DisputeBooking.DoesNotExist:
            return Response({"error": "No dispute found for this booking"}, status=status.HTTP_404_NOT_FOUND)

        if booking.dispute_status != Booking.DisputeState.ACTIVE:
            return Response({"error": "Dispute is not active"}, status=status.HTTP_400_BAD_REQUEST)

        allowed_states = {
            DisputeBooking.Status.ACTIVE,
            DisputeBooking.Status.WAITING_FOR_MECHANIC_PAYMENT,
        }
        if dispute.status not in allowed_states:
            return Response(
                {"error": "Dispute is not eligible for defense submission"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        defense_description = str(request.data.get("defense_description", "")).strip()
        defense_picture = request.FILES.get("defense_picture")

        if not defense_description:
            return Response({"error": "defense_description is required"}, status=status.HTTP_400_BAD_REQUEST)
        if defense_picture is None:
            return Response({"error": "defense_picture is required"}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            dispute.mechanic_defense_description = defense_description
            dispute.mechanic_defense_picture = defense_picture
            dispute.status = DisputeBooking.Status.UNDER_ADMIN_REVIEW
            dispute.resolution_notes = (dispute.resolution_notes or "").strip() or None
            dispute.save(
                update_fields=[
                    "mechanic_defense_description",
                    "mechanic_defense_picture",
                    "status",
                    "resolution_notes",
                ]
            )

        try:
            channel_layer = get_channel_layer()
            if channel_layer is not None:
                payload = {
                    "type": "booking_update",
                    "action": "booking.dispute_defense_submitted",
                    "booking_id": booking.id,
                    "status": booking.status,
                    "dispute_status": booking.dispute_status,
                    "message": "Mechanic submitted dispute defense for admin review",
                }
                targets = {
                    account.id,
                    booking.request.client.account_id,
                    booking.request.provider_id,
                }
                for target in targets:
                    if target:
                        async_to_sync(channel_layer.group_send)(f"user_{target}", payload)
        except Exception:
            pass

        return Response(
            {
                "message": "Defense submitted. Dispute is now under admin review.",
                "dispute": {
                    "id": dispute.id,
                    "status": dispute.status,
                    "mechanic_defense_description": dispute.mechanic_defense_description,
                    "mechanic_defense_picture": dispute.mechanic_defense_picture.url if dispute.mechanic_defense_picture else None,
                },
                "booking": {
                    "id": booking.id,
                    "status": booking.status,
                    "dispute_status": booking.dispute_status,
                },
            },
            status=status.HTTP_200_OK,
        )



@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def mechanic_booking_quotation(request, booking_id):
    """GET returns existing quotation for booking; POST creates/updates quotation and its items.
    Expected POST payload: {"notes": "...", "is_final": true/false, "items": [
      {"line_kind": "service"|"item", "source": "on_hand"|"to_be_purchased"|"mechanic_selling"|null,
       "service": <id>|null, "service_add_on": <id>|null, "description": "", "quantity": 1, "unit_price": 100.0}, ...]}"""
    account, err = _get_mechanic_account(request)
    if err:
        return err

    try:
        booking = _get_accessible_booking(account, booking_id)
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found or you do not have permission to access it"}, status=status.HTTP_404_NOT_FOUND)

    # Assistants can view quotation data but cannot create/update/delete quotation.
    has_assignments = RequestAssignment.objects.filter(request=booking.request).exists()
    assignment = RequestAssignment.objects.filter(
        request=booking.request,
        mechanic=account,
    ).first()
    is_lead_mechanic = bool(
        assignment and assignment.role == RequestAssignment.Role.LEAD
    )
    is_assistant_mechanic = bool(
        assignment and assignment.role == RequestAssignment.Role.ASSISTANT
    )

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
        if booking.status == Booking.Status.COMPLETED:
            return Response(
                {"error": "Completed bookings are read-only. Quotation data is frozen."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if is_assistant_mechanic:
            return Response(
                {
                    "error": "Assistant mechanics are view-only and cannot create or edit quotations for this booking."
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        if has_assignments and not is_lead_mechanic:
            return Response(
                {
                    "error": "Only lead mechanics can create or edit quotations for this booking."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # Shallow copy so serializer .pop('items') does not mutate DRF request.data (can confuse parsers / retries).
        raw = request.data or {}
        try:
            data = dict(raw)
        except Exception:
            data = raw if isinstance(raw, dict) else {}
        original_booking_status = booking.status
        try:
            # If quotation exists, update instead
            try:
                existing = booking.quotation
            except Quotation.DoesNotExist:
                existing = None

            # Support mechanic retraction/deletion via action=delete
            if data.get('action') == 'delete' and existing:
                # post retraction system message (include items before they are removed), then delete
                try:
                    post_quotation_chat_message(account, booking, existing, action='retracted', request=request)
                    try:
                        notify_booking_parties(account.id, booking.request.client.account_id, booking.id, booking.status, 'Quotation retracted')
                    except Exception:
                        pass
                    existing.delete()
                except Exception:
                    pass
                return Response({'message': 'Quotation deleted'}, status=status.HTTP_200_OK)
            if existing is None:
                existing = Quotation.objects.create(
                    booking=booking,
                    mechanic=account,
                    status=Quotation.Status.ACCEPTED,
                    notes=data.get("notes", ""),
                    is_final=bool(data.get("is_final", False)),
                    is_backjob=booking_has_backjob(booking),
                )

            # Create a single amendment bundle from staged UI rows.
            try:
                with transaction.atomic():
                    if "notes" in data:
                        existing.notes = data.get("notes")
                    if "is_final" in data:
                        existing.is_final = bool(data.get("is_final", existing.is_final))
                    existing.is_backjob = booking_has_backjob(booking)
                    existing.save(update_fields=["notes", "is_final", "is_backjob", "updated_at"])
                    amendment = create_amendment_request(
                        quotation_id=existing.id,
                        mechanic_id=account.id,
                        changes=data.get("items") or [],
                    )
                    existing.refresh_from_db()
            except Exception as e:
                logging.getLogger(__name__).exception('Failed to create/update quotation: %s', e)
                return Response(
                    {'error': 'Failed to save quotation', 'details': str(e)},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

            try:
                post_quotation_chat_message(
                    account,
                    booking,
                    existing,
                    action='updated',
                    request=request,
                    amendment=amendment,
                )
            except Exception as e:
                logging.getLogger(__name__).exception(
                    'Quotation saved but failed to post quotation chat message: %s', e
                )

            try:
                notify_booking_parties(
                    account.id,
                    booking.request.client.account_id,
                    booking.id,
                    booking.status,
                    'Quotation amendment request sent',
                )
            except Exception:
                pass

            # Guardrail: quotation create/update must not auto-transition booking status
            try:
                booking.refresh_from_db(fields=['status'])
                if booking.status != original_booking_status:
                    print(f"DEBUG: Booking status changed during quotation save ({original_booking_status} -> {booking.status}); restoring original status.")
                    booking.status = original_booking_status
                    booking.save(update_fields=['status'])
            except Exception:
                pass

            # Keep Booking.amount_fee aligned with backjob new-line totals (service + item lines).
            try:
                if booking_has_backjob(booking):
                    _sync_booking_payable_total(booking)
            except Exception:
                pass

            payload = QuotationSerializer(existing, context={'request': request}).data
            payload["amendment_id"] = amendment.id
            payload["status"] = "pending"
            return Response(payload, status=status.HTTP_200_OK)
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
      - active -> diagnosing
      - diagnosing -> at_location
      - at_location -> on_the_way
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
        Booking.Status.ACTIVE: Booking.Status.DIAGNOSING,
        Booking.Status.DIAGNOSING: Booking.Status.AT_LOCATION,
        Booking.Status.AT_LOCATION: Booking.Status.ON_THE_WAY,
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

    if new_status == Booking.Status.ON_THE_WAY:
        mechanic_lat = _to_float(request.data.get('mechanic_latitude'))
        mechanic_lng = _to_float(request.data.get('mechanic_longitude'))
        _refresh_on_the_way_metrics(booking, mechanic_lat, mechanic_lng)
    else:
        booking.status = new_status
        booking.save(update_fields=["status"])

    if new_status == Booking.Status.DIAGNOSING:
        _clear_active_booking_started_for_revert(booking)

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


def _reject_if_mechanic_locked(account):
    mechanic = account.mechanic
    if not getattr(mechanic, "is_locked", False):
        return None

    now = timezone.now()

    # Keep lock active only while a no-show penalty cooldown is still valid.
    cooldown_until = getattr(mechanic, "cooldown_until", None)
    if cooldown_until and cooldown_until > now:
        return Response(
            {
                "error": "Your account is temporarily locked due to a recent no-show penalty. Please try again later.",
                "code": "mechanic_locked_cooldown",
                "cooldown_until": cooldown_until,
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    # Keep lock active only while dispute is unresolved.
    has_active_dispute = DisputeBooking.objects.filter(
        complaint_against=account,
        status__in=[
            DisputeBooking.Status.ACTIVE,
            DisputeBooking.Status.UNDER_ADMIN_REVIEW,
            DisputeBooking.Status.WAITING_FOR_MECHANIC_PAYMENT,
            DisputeBooking.Status.WAITING_FOR_CLIENT_VERIFICATION,
        ],
    ).exists()
    if has_active_dispute:
        return Response(
            {
                "error": "Your account is locked due to an active dispute. Resolve it before accepting new jobs.",
                "code": "mechanic_locked_dispute",
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    # Stale lock safety: clear lock so mechanics are not blocked incorrectly.
    mechanic.is_locked = False
    mechanic.save(update_fields=["is_locked", "updated_at"])
    return None





@api_view(["POST"])
@permission_classes([AllowAny])
def mechanic_accept_backjob(request, booking_id):
    """
    Mechanic accepts a Backjob request for a booking. Marks Backjob.status = ACCEPTED and notifies parties.
    """
    account, err = _get_mechanic_account(request)
    if err:
        return err

    try:
        booking = Booking.objects.filter(_mechanic_booking_access_q(account)).distinct().get(id=booking_id)
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found or you do not have permission to update it"}, status=status.HTTP_404_NOT_FOUND)

    if getattr(getattr(account, "mechanic", None), "is_working_for_shop", False) and booking.request.shop_id:
        return Response(
            {"error": "Backjob requests for shop bookings must be accepted by the shop owner."},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        backjob = booking.backjob
    except Exception:
        return Response({"error": "No backjob found for this booking"}, status=status.HTTP_404_NOT_FOUND)

    # If already accepted or in progress, still continue below so the chat request
    # has an accepted system message instead of staying as an actionable request.
    already_accepted_or_active = backjob.status in [
        Booking.Status.ACCEPTED,
        Booking.Status.ON_THE_WAY,
        Booking.Status.AT_LOCATION,
        Booking.Status.DIAGNOSING,
        Booking.Status.ACTIVE,
    ]
    if already_accepted_or_active:
        try:
            booking.status = Booking.Status.ACCEPTED
            booking.amount_fee = Decimal("0.00")
            booking.convenience_fee = Decimal("0.00")
            booking.traffic_surcharge = Decimal("0.00")
            booking.completed_at = None
            booking.save(update_fields=["status", "amount_fee", "convenience_fee", "traffic_surcharge", "completed_at", "updated_at"])
            try:
                CompleteBooking.objects.filter(booking=booking).delete()
            except Exception:
                pass
            try:
                Receipt.objects.filter(booking=booking).delete()
            except Exception:
                pass
        except Exception:
            pass

    if not already_accepted_or_active:
        backjob.status = Booking.Status.ACCEPTED
        backjob.save(update_fields=["status", "updated_at"])

    # Notify participants via websocket util
    try:
        notify_booking_parties(
            account.id,
            booking.request.client.account_id,
            booking.id,
            backjob.status,
            "Mechanic accepted the backjob",
        )
    except Exception:
        # don't fail the request if notify fails
        pass

    # Mark the underlying booking as accepted for the backjob flow.
    try:
        booking.status = Booking.Status.ACCEPTED
        booking.amount_fee = Decimal("0.00")
        booking.convenience_fee = Decimal("0.00")
        booking.traffic_surcharge = Decimal("0.00")
        # clear any completion state so booking appears as accepted/booked
        booking.completed_at = None
        booking.save(update_fields=["status", "amount_fee", "convenience_fee", "traffic_surcharge", "completed_at", "updated_at"])
        # remove any CompleteBooking/Receipt records related to this booking
        try:
            CompleteBooking.objects.filter(booking=booking).delete()
        except Exception:
            pass
        try:
            Receipt.objects.filter(booking=booking).delete()
        except Exception:
            pass
    except Exception:
        # ignore failures to mutate booking; still proceed
        pass

    # Ensure there's a conversation for this booking and post a system chat message
    try:
        conv = Conversation.objects.filter(booking_id=booking.id).first()
        if not conv:
            conv = Conversation.objects.create(title=f'Booking {booking.id}', booking_id=booking.id)
            try:
                if booking.request.client and booking.request.client.account:
                    conv.participants.add(booking.request.client.account)
            except Exception:
                pass
            try:
                if booking.request.provider:
                    conv.participants.add(booking.request.provider)
            except Exception:
                pass
            try:
                if booking.request.shop and booking.request.shop.shop_owner and booking.request.shop.shop_owner.account:
                    conv.participants.add(booking.request.shop.shop_owner.account)
            except Exception:
                pass
            conv.participants.add(account)
            conv.save()

        payload = {
            'type': 'backjob_accepted',
            'mechanic_id': account.id,
            'mechanic_name': f"{getattr(account, 'firstname', '')} {getattr(account, 'lastname', '')}".strip(),
            'backjob_id': backjob.id,
            'booking_id': booking.id,
            'free': True,
            'message': 'Mechanic accepted the backjob and set it as booked (no cost).',
        }

        existing_msg = Message.objects.filter(
            Q(content__contains='backjob_accepted') &
            Q(content__contains=f'"backjob_id": {backjob.id}'),
            conversation=conv,
        ).order_by('-id').first()

        # Create a system-style message (no sender) so UI renders it as a system event.
        msg = existing_msg or Message.objects.create(conversation=conv, sender=None, content=json.dumps(payload))
        conv.save()
        ser = MessageSerializer(msg, context={'request': request})

        # Broadcast the chat message to participants except sender
        try:
            channel_layer = get_channel_layer()
            payload_ws = {
                'type': 'booking_update',
                'action': 'new_chat_message',
                'conversation_id': conv.id,
                'message': ser.data,
            }
            for participant in conv.participants.exclude(id=account.id).all():
                group_name = f'user_{participant.id}'
                async_to_sync(channel_layer.group_send)(group_name, payload_ws)
        except Exception:
            pass
    except Exception:
        # non-fatal; accept completed
        pass

    return Response({"message": "Backjob accepted", "backjob_id": backjob.id, "status": backjob.status}, status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def mechanic_location_view(request, booking_id):
    """
    GET  — Returns the latest mechanic GPS coordinates for a booking.
           Used by the client-side app to poll mechanic location every 5 seconds.
    POST — Upserts the MechanicLocation row for a booking.
           Used by the mechanic-side app to push GPS coordinates every 5 seconds.
    Works while mechanic is traveling or on site before the job is active.
    """
    account_id = request.session.get("account_id")
    if not account_id:
        return Response({"error": "Authentication required"}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        account = Account.objects.select_related("mechanic").get(id=account_id)
    except Account.DoesNotExist:
        return Response({"error": "Account not found"}, status=status.HTTP_404_NOT_FOUND)

    # Try to find the booking — accessible by either the mechanic (provider) or the client
    try:
        booking = Booking.objects.select_related("request", "request__client").get(id=booking_id)
    except Booking.DoesNotExist:
        return Response({"error": "Booking not found"}, status=status.HTTP_404_NOT_FOUND)

    # Verify access: provider (e.g. shop owner on shop jobs), client, or assigned shop mechanic.
    is_provider = booking.request.provider_id == account.id
    is_client = booking.request.client.account_id == account.id
    is_assigned_mechanic = RequestAssignment.objects.filter(
        request=booking.request, mechanic=account
    ).exists()
    if not is_provider and not is_client and not is_assigned_mechanic:
        return Response({"error": "You do not have permission to access this booking"}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "GET":
        try:
            loc = MechanicLocation.objects.get(booking=booking)
            return Response({
                "latitude": float(loc.latitude),
                "longitude": float(loc.longitude),
                "updated_at": loc.updated_at.isoformat(),
            }, status=status.HTTP_200_OK)
        except MechanicLocation.DoesNotExist:
            accepted_offer = _get_accepted_offer_for_booking(booking)
            if (
                accepted_offer
                and accepted_offer.mechanic_latitude is not None
                and accepted_offer.mechanic_longitude is not None
            ):
                loc = _save_mechanic_location(
                    booking,
                    float(accepted_offer.mechanic_latitude),
                    float(accepted_offer.mechanic_longitude),
                )
                if loc is not None:
                    return Response({
                        "latitude": float(loc.latitude),
                        "longitude": float(loc.longitude),
                        "updated_at": loc.updated_at.isoformat(),
                    }, status=status.HTTP_200_OK)

            return Response({"error": "Mechanic location not available yet"}, status=status.HTTP_404_NOT_FOUND)

    # POST — solo jobs use request.provider as the mechanic; shop jobs use RequestAssignment.
    can_push_location = is_provider or is_assigned_mechanic
    if not can_push_location:
        return Response({"error": "Only the traveling mechanic can update location"}, status=status.HTTP_403_FORBIDDEN)

    if booking.status not in (
        Booking.Status.ON_THE_WAY,
        Booking.Status.AT_LOCATION,
        Booking.Status.DIAGNOSING,
    ):
        return Response(
            {"error": "Location updates are only accepted while traveling or on site (before job is active)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    latitude = _to_float(request.data.get("latitude"))
    longitude = _to_float(request.data.get("longitude"))

    if latitude is None or longitude is None:
        return Response({"error": "latitude and longitude are required"}, status=status.HTTP_400_BAD_REQUEST)

    loc, created = MechanicLocation.objects.update_or_create(
        booking=booking,
        defaults={"latitude": Decimal(str(latitude)).quantize(Decimal('0.000001')),
                   "longitude": Decimal(str(longitude)).quantize(Decimal('0.000001'))},
    )

    _broadcast_mechanic_location(booking, loc)

    return Response({
        "latitude": float(loc.latitude),
        "longitude": float(loc.longitude),
        "updated_at": loc.updated_at.isoformat(),
    }, status=status.HTTP_200_OK)


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

    Mechanics can access:
    - jobs explicitly assigned to them in RequestAssignment
    - jobs where they are the provider account

    This avoids over-filtering on request.shop/provider shape (shop-owner
    bookings may be owner-scoped even when assigned to a shop mechanic).
    """
    return Q(request__assignments__mechanic=account) | Q(request__provider=account)


def _mechanic_pending_backjob_queryset(account):
    if getattr(getattr(account, "mechanic", None), "is_working_for_shop", False):
        return Booking.objects.none()
    return Booking.objects.filter(
        _mechanic_booking_access_q(account),
        backjobs__status__in=[Booking.Status.BACKJOB_PENDING, Booking.Status.REWORKED],
    ).distinct()


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

        # Base price for every booked service + add-ons (mechanic price when set)
        base_price = 0.0
        for svc in iter_direct_request_services(req):
            try:
                mechanic_service = MechanicService.objects.get(
                    mechanic=account.mechanic,
                    service=svc,
                )
                base_price += float(mechanic_service.price)
            except MechanicService.DoesNotExist:
                base_price += float(getattr(svc, "minimum_price", 0))

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


def _serialize_mechanic_booking_list(bookings_queryset):
    """
    Lightweight booking serializer for mechanic list endpoints.
    Keeps payload small and avoids heavy per-booking queries used by detail views.
    """
    rows = []
    for booking in bookings_queryset:
        loc = booking.request.service_location
        rows.append(
            {
                "id": booking.id,
                "status": booking.status,
                "dispute_status": booking.dispute_status,
                "amount_fee": float(booking.amount_fee),
                "booked_at": booking.booked_at.isoformat() if booking.booked_at else None,
                "booking_date": booking.booking_date.isoformat() if getattr(booking, "booking_date", None) else None,
                "updated_at": booking.updated_at.isoformat() if booking.updated_at else None,
                "completed_at": booking.completed_at.isoformat() if booking.completed_at else None,
                "request": {
                    "id": booking.request.id,
                    "type": booking.request.request_type,
                    "created_at": booking.request.created_at.isoformat() if booking.request.created_at else None,
                },
                "service_location": (
                    {
                        "street_name": loc.street_name,
                        "barangay": loc.barangay,
                        "city_municipality": loc.city_municipality,
                    }
                    if loc
                    else None
                ),
                "active_details": (
                    {"is_job_done": bool(getattr(booking.activebooking, "is_job_done", False))}
                    if hasattr(booking, "activebooking")
                    else None
                ),
                "dispute_details": (
                    {"dispute_status": booking.disputebooking.status}
                    if hasattr(booking, "disputebooking")
                    else None
                ),
            }
        )
    return rows


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
    compact_param = str(request.query_params.get("compact", "1")).strip().lower()
    compact_mode = compact_param not in {"0", "false", "no"}

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

    def serialize_booking_list(rows_queryset):
        if compact_mode:
            return _serialize_mechanic_booking_list(rows_queryset)
        return _serialize_bookings(rows_queryset, viewer_account=account)

    live_backjob_statuses = [
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
    live_backjob_q = ~Q(status=Booking.Status.COMPLETED) & Q(backjobs__status__in=live_backjob_statuses)

    if status_filter:
        # "all" status: paginate across every booking + pending requests
        if status_filter.lower() == "all":
            # pending includes pending direct requests + bookings that have a backjob
            pending_direct_count = _count_pending_direct_requests(account)
            # Only count backjobs that are still requested (not yet accepted)
            backjob_count = _mechanic_pending_backjob_queryset(account).count()
            pending_count = pending_direct_count + backjob_count
            bookings_count = bookings_queryset.count()
            total_count = pending_count + bookings_count
            total_pages = (total_count + page_size - 1) // page_size if page_size > 0 else 0
            start_index = (page - 1) * page_size
            end_index = start_index + page_size

            # Pending items come first (direct requests then backjob bookings), then bookings ordered by -booked_at
            paginated = []
            if start_index < pending_count:
                # Need some pending items on this page
                direct_pending = _serialize_pending_direct_requests(account)
                # Only include backjob bookings that are pending mechanic acceptance.
                backjob_qs = _mechanic_pending_backjob_queryset(account).order_by("-booked_at")
                backjob_pending = serialize_booking_list(backjob_qs)
                all_pending = direct_pending + backjob_pending
                pending_slice = all_pending[start_index:min(end_index, pending_count)]
                paginated.extend(pending_slice)

            if end_index > pending_count:
                # Need some booking items on this page; exclude backjob bookings already shown
                booking_start = max(0, start_index - pending_count)
                booking_end = end_index - pending_count
                bookings_slice = bookings_queryset.exclude(live_backjob_q)[booking_start:booking_end]
                paginated.extend(serialize_booking_list(bookings_slice))

            # Include tab counts so frontend doesn't need a separate request
            accepted_count = bookings_queryset.filter(status__in=["booked", "accepted"]).count()
            on_the_way_count = bookings_queryset.filter(status="on_the_way").count()
            at_location_count = bookings_queryset.filter(status="at_location").count()
            diagnosing_count = bookings_queryset.filter(status="diagnosing").count()
            active_count = bookings_queryset.filter(status__in=["active", "paused"]).count()
            completed_count = bookings_queryset.filter(status="completed").count()
            cancelled_count = bookings_queryset.filter(status="cancelled").count()
            # Include only live backjobs; completed rounds behave like normal completed jobs again.
            reworked_count = bookings_queryset.filter(
                Q(status="reworked") | live_backjob_q
            ).count()
            disputed_count = bookings_queryset.filter(dispute_status=Booking.DisputeState.ACTIVE).count()

            # Ensure pending tab count includes backjobs
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
                        "at_location": at_location_count,
                        "diagnosing": diagnosing_count,
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
            # include both direct pending requests and bookings that have backjob requests
            direct_pending = _serialize_pending_direct_requests(account)
            # Only include backjob bookings that are pending acceptance.
            backjob_qs = _mechanic_pending_backjob_queryset(account).order_by("-booked_at")
            backjob_pending = serialize_booking_list(backjob_qs)
            all_pending = direct_pending + backjob_pending
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

        # Combined on_going filter: travel + on site + active + paused
        if status_filter.lower() == "on_going":
            bookings_queryset = bookings_queryset.filter(
                status__in=["on_the_way", "at_location", "diagnosing", "active", "paused"]
            )
            total_count = bookings_queryset.count()
            total_pages = (total_count + page_size - 1) // page_size if page_size > 0 else 0
            start_index = (page - 1) * page_size
            end_index = start_index + page_size
            paginated_bookings = bookings_queryset[start_index:end_index]
            bookings_data = serialize_booking_list(paginated_bookings)
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
            "booked",
            "accepted",
            "on_the_way",
            "at_location",
            "diagnosing",
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
        if status_filter.lower() == 'accepted':
            bookings_queryset = bookings_queryset.filter(status__in=['booked', 'accepted'])
        elif status_filter.lower() == 'active':
            # include bookings that are active/paused OR that have a live backjob requested
            bookings_queryset = bookings_queryset.filter(Q(status__in=['active', 'paused']) | live_backjob_q)
        elif status_filter.lower() == 'reworked':
            # Include bookings explicitly marked reworked OR any live backjob round.
            bookings_queryset = bookings_queryset.filter(
                Q(status__in=['reworked', 'backjob_pending']) | live_backjob_q
            )
        else:
            bookings_queryset = bookings_queryset.filter(status=status_filter.lower())

        total_count = bookings_queryset.count()
        total_pages = (total_count + page_size - 1) // page_size if page_size > 0 else 0
        start_index = (page - 1) * page_size
        end_index = start_index + page_size
        paginated_bookings = bookings_queryset[start_index:end_index]
        bookings_data = serialize_booking_list(paginated_bookings)

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
    at_location_count = bookings_queryset.filter(status="at_location").count()
    diagnosing_count = bookings_queryset.filter(status="diagnosing").count()
    active_count = bookings_queryset.filter(status__in=["active", "paused"]).count()
    finished_count = bookings_queryset.filter(status="finished").count()
    pending_payment_count = bookings_queryset.filter(status="pending_payment").count()
    completed_count = bookings_queryset.filter(status="completed").count()
    cancelled_count = bookings_queryset.filter(status="cancelled").count()
    reworked_count = bookings_queryset.filter(
        Q(status="reworked") | live_backjob_q
    ).count()
    disputed_count = bookings_queryset.filter(dispute_status=Booking.DisputeState.ACTIVE).count()
    # Include backjob bookings in the pending count, but only those not yet accepted.
    pending_count = _count_pending_direct_requests(account) + _mechanic_pending_backjob_queryset(account).count()

    # Single DB aggregate — much cheaper than fetching all completed records
    total_earnings = bookings_queryset.filter(status="completed").aggregate(
        total=Sum("amount_fee")
    )["total"] or 0

    return Response(
        {
            "pending": {"count": pending_count},
            "accepted": {"count": accepted_count},
            "on_the_way": {"count": on_the_way_count},
            "at_location": {"count": at_location_count},
            "diagnosing": {"count": diagnosing_count},
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

    data = _serialize_single_booking(booking, viewer_account=account)
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

    lock_err = _reject_if_mechanic_locked(account)
    if lock_err:
        return lock_err

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

    # Calculate total amount from all services + add-ons (same logic as pending list)
    base_price = 0.0
    for svc in iter_direct_request_services(req):
        try:
            mechanic_service = MechanicService.objects.get(
                mechanic=account.mechanic,
                service=svc,
            )
            base_price += float(mechanic_service.price)
        except MechanicService.DoesNotExist:
            base_price += float(getattr(svc, "minimum_price", 0))

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
        status=Booking.Status.BOOKED,
        amount_fee=total_amount,
        booking_date=req.scheduled_time or timezone.now(),
    )
    ActiveBooking.objects.create(booking=booking)

    data = _serialize_single_booking(booking, viewer_account=account)

    notify_booking_parties(
        account.id,
        req.client.account_id,
        booking.id,
        booking.status,
        "Your request has been accepted",
        extra_event_fields={"event_source": "mechanic_accepted_direct"},
        client_message="A mechanic accepted your direct request.",
        mechanic_message="You accepted this direct request.",
        client_title="Mechanic accepted your request",
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

    lock_err = _reject_if_mechanic_locked(account)
    if lock_err:
        return lock_err

    mechanic = account.mechanic
    if mechanic.status != mechanic.WorkStatus.AVAILABLE:
        return Response(
            {
                "error": "Your status is unavailable. Switch to Available to accept emergency requests.",
                "reason": "mechanic_unavailable",
                "mechanic_status": mechanic.status,
            },
            status=status.HTTP_409_CONFLICT,
        )

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

    # If already assigned to another provider, reject
    if req.provider and req.provider != account:
        return Response({"error": "Request already assigned to another provider"}, status=status.HTTP_400_BAD_REQUEST)

    # If booking already exists, reject
    if hasattr(req, "booking"):
        return Response({"error": "Request already has a booking"}, status=status.HTTP_400_BAD_REQUEST)

    # Assign provider and create booking
    req.provider = account
    req.save(update_fields=["provider"])

    booking = Booking.objects.create(
        request=req,
        status=Booking.Status.BOOKED,
        amount_fee=0,
        booking_date=req.scheduled_time or timezone.now(),
    )
    ActiveBooking.objects.create(booking=booking)

    data = _serialize_single_booking(booking, viewer_account=account)

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

    has_pending_quotation_request = False
    quotation = getattr(booking, "quotation", None)
    if quotation is not None:
        quotation_status = str(quotation.status or "").lower()
        has_pending_quotation_request = quotation_status == Quotation.Status.PENDING
        if not has_pending_quotation_request:
            has_pending_quotation_request = quotation.items.filter(status=Quotation.Status.PENDING).exists()

    active_backjob = get_booking_backjob(booking)
    is_backjob_completion = active_backjob is not None

    payment_summary = _get_payment_summary(booking)
    remaining_balance = Decimal(str(payment_summary.get("remaining_balance", 0) or 0)).quantize(Decimal("0.01"))

    # For normal jobs, allow completion from pending_payment only when no balance remains
    # and no quotation request is still waiting for client action.
    if booking.status == Booking.Status.PENDING_PAYMENT and not is_backjob_completion:
        if remaining_balance > Decimal("0.00"):
            return Response(
                {
                    "error": "Cannot complete booking. Payment is still pending.",
                    "remaining_balance": float(remaining_balance),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if has_pending_quotation_request:
            return Response(
                {
                    "error": "Cannot complete booking. A quotation request is still pending client action.",
                    "code": "quotation_pending_client_approval",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    if not is_backjob_completion and remaining_balance > Decimal("0.00"):
        try:
            receipt = booking.receipt
            if not receipt.payment_received:
                return Response(
                    {
                        "error": "Cannot complete booking. Payment has not been confirmed yet."
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except Receipt.DoesNotExist:
            pass

    total_amount = request.data.get("total_amount")
    notes = request.data.get("notes", "")

    if is_backjob_completion:
        total_amount = 0.0
        notes = notes or "Backjob completed"
    elif total_amount is not None:
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
    if is_backjob_completion:
        booking.payment_status = Booking.PaymentStatus.FULLY_PAID
        booking.save(update_fields=["status", "amount_fee", "completed_at", "updated_at", "payment_status"])
        Receipt.objects.filter(booking=booking).delete()
        PaymentInstallment.objects.filter(booking=booking).delete()
        active_backjob.status = Booking.Status.COMPLETED
        active_backjob.save(update_fields=["status", "updated_at"])
    else:
        booking.save(update_fields=["status", "amount_fee", "completed_at", "updated_at"])

    if hasattr(booking, "activebooking"):
        booking.activebooking.is_job_done = True
        booking.activebooking.save(update_fields=["is_job_done"])

    data = _serialize_single_booking(booking, viewer_account=account)
    completion_message = "Backjob completed" if is_backjob_completion else "Your booking has been completed"

    notify_booking_parties(
        account.id,
        booking.request.client.account_id,
        booking.id,
        booking.status,
        completion_message,
    )

    return Response(
        {"message": completion_message, "booking": data},
        status=status.HTTP_200_OK,
    )

