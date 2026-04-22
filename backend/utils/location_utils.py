from django.db.models import OuterRef, Subquery

from bookings.models import BroadcastOffer, MechanicLocation


def haversine_km(lat1, lon1, lat2, lon2):
    from math import atan2, cos, radians, sin, sqrt

    earth_radius_km = 6371.0
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return earth_radius_km * c


def mechanic_location_annotations(account_ref='account_id', mechanic_ref='pk'):
    return {
        'live_lat': Subquery(
            MechanicLocation.objects.filter(
                booking__request__provider=OuterRef(account_ref)
            ).order_by('-updated_at').values('latitude')[:1]
        ),
        'live_lng': Subquery(
            MechanicLocation.objects.filter(
                booking__request__provider=OuterRef(account_ref)
            ).order_by('-updated_at').values('longitude')[:1]
        ),
        'offer_lat': Subquery(
            BroadcastOffer.objects.filter(
                mechanic=OuterRef(mechanic_ref),
                status=BroadcastOffer.Status.ACCEPTED,
                mechanic_latitude__isnull=False,
                mechanic_longitude__isnull=False,
            ).order_by('-responded_at', '-id').values('mechanic_latitude')[:1]
        ),
        'offer_lng': Subquery(
            BroadcastOffer.objects.filter(
                mechanic=OuterRef(mechanic_ref),
                status=BroadcastOffer.Status.ACCEPTED,
                mechanic_latitude__isnull=False,
                mechanic_longitude__isnull=False,
            ).order_by('-responded_at', '-id').values('mechanic_longitude')[:1]
        ),
    }