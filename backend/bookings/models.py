from django.db import models
from django.utils import timezone
from users.models import Client, Account, Admin, Mechanic
from services.models import Service, ServiceAddOn
from shops.models import Shop

class ServiceLocation(models.Model):
    street_name = models.CharField(max_length=100)
    subdivision_village = models.CharField(max_length=100, null=True, blank=True)
    barangay = models.CharField(max_length=100)
    city_municipality = models.CharField(max_length=100)
    landmark = models.CharField(max_length=255, null=True, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

class Request(models.Model):
    class Type(models.TextChoices):
        CUSTOM = "custom"
        DIRECT = "direct"
        EMERGENCY = "emergency"
        BROADCAST = "broadcast"

    client = models.ForeignKey(Client, on_delete=models.CASCADE)
    provider = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="provided_requests", null=True, blank=True)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="shop_requests", null=True, blank=True)
    request_type = models.CharField(max_length=20, choices=Type.choices)
    service_location = models.ForeignKey(ServiceLocation, on_delete=models.CASCADE, null=True, blank=True)
    vehicle_type = models.CharField(max_length=80, null=True, blank=True)
    vehicle_brand = models.CharField(max_length=80, null=True, blank=True)
    vehicle_model = models.CharField(max_length=120, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

class CustomRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending"
        QUOTED = "quoted"
        REJECTED = "rejected"
        CANCELLED = "cancelled"
    request = models.OneToOneField(Request, on_delete=models.CASCADE)
    description = models.TextField()
    request_status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)    
    concern_picture = models.ImageField(upload_to='requests/custom/', null=True, blank=True)
    quoted_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    providers_note = models.TextField(null=True, blank=True)

class DirectRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending"
        ACCEPTED = "accepted"
        REJECTED = "rejected"
        CANCELLED = "cancelled"
    request = models.OneToOneField(Request, on_delete=models.CASCADE)
    service = models.ForeignKey(Service, on_delete=models.CASCADE)
    request_status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)

class DirectRequestAddOn(models.Model):
    request = models.ForeignKey(Request, on_delete=models.CASCADE)
    service_add_on = models.ForeignKey(ServiceAddOn, on_delete=models.CASCADE)

class EmergencyRequest(models.Model):
    request = models.OneToOneField(Request, on_delete=models.CASCADE)
    description = models.TextField(null=True, blank=True)
    concern_picture = models.ImageField(upload_to='requests/emergency/', null=True, blank=True)
    providers_note = models.TextField(null=True, blank=True)

class Booking(models.Model):
    class Status(models.TextChoices):
        ACCEPTED = "accepted"         # Mechanic accepted, waiting to start
        ON_THE_WAY = "on_the_way"    # Mechanic traveling to client
        AT_LOCATION = "at_location"  # Mechanic arrived at service location
        DIAGNOSING = "diagnosing"    # Mechanic met client; inspection / diagnosis
        ACTIVE = "active"            # Job started
        PAUSED = "paused"            # Job paused
        FINISHED = "finished"        # Job finished, pending payment
        PENDING_PAYMENT = "pending_payment" # Pending payment
        COMPLETED = "completed"
        REWORKED = "reworked"
        CANCELLED = "cancelled"
        DISPUTED = "disputed"

    class PaymentStatus(models.TextChoices):
        UNPAID = "unpaid"
        PARTIALLY_PAID = "partially_paid"
        FULLY_PAID = "fully_paid"

    class DisputeState(models.TextChoices):
        NONE = "none"
        ACTIVE = "active"
        RESOLVED = "resolved"

    request = models.OneToOneField(Request, on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    payment_status = models.CharField(
        max_length=20,
        choices=PaymentStatus.choices,
        default=PaymentStatus.UNPAID,
    )
    dispute_status = models.CharField(
        max_length=20,
        choices=DisputeState.choices,
        default=DisputeState.NONE,
        help_text="Parallel dispute lifecycle state; does not replace booking status",
    )
    amount_fee = models.DecimalField(max_digits=10, decimal_places=2)
    distance_km = models.DecimalField(
        max_digits=6, decimal_places=2,
        null=True, blank=True,
        help_text="Road distance in km from ORS when mechanic accepted the booking"
    )
    convenience_fee = models.DecimalField(
        max_digits=10, decimal_places=2,
        null=True, blank=True,
        help_text="Locked convenience fee when mechanic pressed On The Way"
    )
    eta_minutes = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Estimated travel time in minutes from ORS when fee was locked"
    )
    fee_locked_at = models.DateTimeField(
        null=True, blank=True,
        help_text="Timestamp when mechanic pressed On The Way and fee was locked"
    )
    traffic_surcharge = models.DecimalField(
    max_digits=10, decimal_places=2,
    null=True, blank=True,
    help_text="Real traffic surcharge added when mechanic went OTW"
    )
    booked_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

class ActiveBooking(models.Model):
    booking = models.OneToOneField(Booking, on_delete=models.CASCADE)
    before_picture_service = models.ImageField(upload_to='bookings/before/', null=True, blank=True)
    is_job_done = models.BooleanField(default=False)
    after_picture_service = models.ImageField(upload_to='bookings/after/', null=True, blank=True)
    is_rescheduled = models.BooleanField(default=False)
    reason = models.TextField(null=True, blank=True)
    new_time = models.DateTimeField(null=True, blank=True)
    new_date = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    paused_at = models.DateTimeField(null=True, blank=True)
    total_pause_duration = models.DurationField(default=timezone.timedelta(0))
    # Legacy/staging fields present in DB; keep in model so ORM supplies values
    stage = models.CharField(max_length=50, default="")
    stage_updated_at = models.DateTimeField(default=timezone.now)
    paused_at = models.DateTimeField(null=True, blank=True)
    total_pause_duration = models.DurationField(default=timezone.timedelta(0))

class ActiveBookingPhoto(models.Model):
    class PhotoType(models.TextChoices):
        BEFORE = "before", "Before"
        AFTER = "after", "After"

    active_booking = models.ForeignKey(
        ActiveBooking,
        on_delete=models.CASCADE,
        related_name="photos",
    )
    photo = models.ImageField(upload_to="bookings/progress/")
    photo_type = models.CharField(max_length=20, choices=PhotoType.choices)
    created_at = models.DateTimeField(auto_now_add=True)

class CancelBooking(models.Model):
    booking = models.OneToOneField(Booking, on_delete=models.CASCADE)
    cancelled_by = models.ForeignKey(Account, on_delete=models.CASCADE)
    reason = models.TextField(null=True, blank=True)
    cancelled_at = models.DateTimeField(auto_now_add=True)

class ReworkBooking(models.Model):
    booking = models.OneToOneField(Booking, on_delete=models.CASCADE)
    requested_by = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="rework_requests")
    reason = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

class DisputeBooking(models.Model):
    class RefundMethod(models.TextChoices):
        GCASH = "gcash"
        MAYA = "maya"
        VOUCHER = "voucher"

    class Status(models.TextChoices):
        ACTIVE = "active"
        UNDER_ADMIN_REVIEW = "under_admin_review"
        WAITING_FOR_MECHANIC_PAYMENT = "waiting_for_mechanic_payment"
        WAITING_FOR_CLIENT_VERIFICATION = "waiting_for_client_verification"
        RESOLVED_REFUNDED = "resolved_refunded"
        RESOLVED_DISMISSED = "resolved_dismissed"
        RESOLVED_VOUCHER = "resolved_voucher"

    booking = models.OneToOneField(Booking, on_delete=models.CASCADE)
    complainer = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="complaints_made")
    complaint_against = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="complaints_received")
    admin = models.ForeignKey(Admin, on_delete=models.CASCADE, null=True, blank=True)
    issue_description = models.TextField()
    issue_picture = models.ImageField(upload_to='bookings/disputes/', null=True, blank=True)
    mechanic_defense_description = models.TextField(null=True, blank=True)
    mechanic_defense_picture = models.ImageField(upload_to='bookings/disputes/defense/', null=True, blank=True)
    refund_receipt_image = models.ImageField(upload_to='bookings/disputes/refunds/', null=True, blank=True)
    refund_method = models.CharField(max_length=20, choices=RefundMethod.choices, null=True, blank=True)
    refund_account_number = models.CharField(max_length=50, null=True, blank=True)
    resolution_notes = models.TextField(null=True, blank=True)
    status = models.CharField(max_length=50, choices=Status.choices, default=Status.ACTIVE)
    is_client_verified = models.BooleanField(default=False)
    amount_refunded = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    refund_receiver = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="refunds", null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

class CompleteBooking(models.Model):
    booking = models.OneToOneField(Booking, on_delete=models.CASCADE)
    completed_at = models.DateTimeField(auto_now_add=True)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    notes = models.TextField(null=True, blank=True)


class Receipt(models.Model):
    booking = models.OneToOneField(Booking, on_delete=models.CASCADE)
    # Record payment method and any external transaction id for online payments
    PAYMENT_METHOD_CHOICES = (
        ('cash', 'Cash'),
        ('gcash', 'GCash'),
        ('maya', 'Maya'),
    )

    payment_received = models.BooleanField(default=False)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, default='cash')
    ewallet_type = models.CharField(
        max_length=10,
        choices=[('gcash', 'GCash'), ('maya', 'Maya')],
        null=True,
        blank=True,
        help_text="E-wallet type if payment_method is gcash or maya",
    )
    ewallet_source_id = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="PayMongo payment source ID for e-wallet",
    )
    platform_fee = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Base fee deducted as platform earnings",
    )
    mechanic_payout = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Amount disbursed to mechanic or shop owner",
    )
    paid_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when payment was confirmed",
    )
    transaction_id = models.CharField(max_length=255, null=True, blank=True)
    receipt_image = models.ImageField(upload_to='bookings/receipts/', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class PaymentInstallment(models.Model):
    class Type(models.TextChoices):
        INITIAL = "initial"
        FINAL = "final"
        FULL = "full"

    class Status(models.TextChoices):
        PENDING = "pending"
        PAID = "paid"

    booking = models.ForeignKey(
        Booking,
        on_delete=models.CASCADE,
        related_name="payment_installments",
    )
    installment_type = models.CharField(max_length=20, choices=Type.choices)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    is_released = models.BooleanField(default=False)
    paid_at = models.DateTimeField(null=True, blank=True)
    external_reference = models.CharField(max_length=255, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at", "id"]
        unique_together = [["booking", "installment_type"]]

    def __str__(self):
        return f"Installment({self.installment_type}) Booking {self.booking_id} - {self.status}"


class PaymentTransaction(models.Model):
    class Method(models.TextChoices):
        QR = "qr"
        GCASH = "gcash"
        MAYA = "maya"

    class Status(models.TextChoices):
        SUCCESS = "success"
        FAILED = "failed"

    booking = models.ForeignKey(Booking, on_delete=models.CASCADE, related_name="payment_transactions")
    installment = models.ForeignKey(
        PaymentInstallment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="transactions",
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    method = models.CharField(max_length=20, choices=Method.choices)
    reference = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SUCCESS)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"PaymentTransaction({self.method}) Booking {self.booking_id} - {self.status}"


class PaymentQRToken(models.Model):
    booking = models.OneToOneField(
        Booking,
        on_delete=models.CASCADE,
        related_name='qr_token',
    )
    token = models.UUIDField(
        unique=True,
        help_text="Unique signed UUID for QR code",
    )
    is_used = models.BooleanField(
        default=False,
        help_text="True after client confirms payment",
    )
    expires_at = models.DateTimeField(
        help_text="24 hours after booking marked FINISHED",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'bookings_paymentqrtoken'

    def is_valid(self):
        return not self.is_used and timezone.now() < self.expires_at


class Backjob(models.Model):
    """
    Represents a client's request for a backjob (follow-up work) tied to an existing Booking.
    Keeps backjob lifecycle separate from the primary Booking while allowing reuse of
    similar status values and independent metadata (reason, images, requester).
    """
    booking = models.OneToOneField(Booking, on_delete=models.CASCADE, related_name='backjob')
    # Reuse Booking.Status choices so backjob states mirror booking states (accepted, on_the_way, active, etc.)
    status = models.CharField(max_length=30, choices=Booking.Status.choices, default=Booking.Status.ACCEPTED)
    requested_by = models.ForeignKey(Account, on_delete=models.SET_NULL, null=True, blank=True, related_name='requested_backjobs')
    reason = models.TextField(null=True, blank=True)
    # Store uploaded image URLs or relative paths as JSON list
    images = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Backjob({self.id}) for Booking {self.booking_id} - {self.status}"


class Quotation(models.Model):
    """An editable quotation attached to a Booking created/updated by the mechanic.
    Acts like a receipt but editable while the mechanic is on-site."""
    booking = models.OneToOneField(Booking, on_delete=models.CASCADE, related_name='quotation')
    mechanic = models.ForeignKey(Account, on_delete=models.CASCADE)
    class Status(models.TextChoices):
        PENDING = "pending"
        ACCEPTED = "accepted"
        REJECTED = "rejected"
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    notes = models.TextField(null=True, blank=True)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_final = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class QuotationItem(models.Model):
    quotation = models.ForeignKey(Quotation, on_delete=models.CASCADE, related_name='items')
    # one of service or service_add_on may be set, or neither for free-text items
    service = models.ForeignKey('services.Service', on_delete=models.SET_NULL, null=True, blank=True)
    service_add_on = models.ForeignKey('services.ServiceAddOn', on_delete=models.SET_NULL, null=True, blank=True)
    description = models.CharField(max_length=255, null=True, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # per-item status: defaults to pending so newly-added items are pending until client accepts
    status = models.CharField(max_length=20, choices=Quotation.Status.choices, default=Quotation.Status.PENDING)
    # Explicit change metadata allows clients to classify mixed pending deltas
    # (add/edit/remove) without relying on brittle heuristics.
    change_type = models.CharField(max_length=20, null=True, blank=True)
    previous_description = models.CharField(max_length=255, null=True, blank=True)
    previous_quantity = models.PositiveIntegerField(null=True, blank=True)
    previous_unit_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    @property
    def line_total(self):
        return self.quantity * self.unit_price


class BroadcastRequest(models.Model):
    """
    Broadcast Request - Similar to Uber/Grab ride-hailing flow.
    Multiple mechanics can see and attempt to accept.
    First to accept wins and gets the booking.
    """
    class Status(models.TextChoices):
        SEARCHING = "searching"      # Looking for mechanics
        ACCEPTED = "accepted"         # A mechanic has been assigned
        EXPIRED = "expired"           # Time limit passed
        CANCELLED = "cancelled"       # Client cancelled

    request = models.OneToOneField(Request, on_delete=models.CASCADE, related_name='broadcast_request')
    services = models.ManyToManyField(Service, related_name='broadcast_requests')
    description = models.TextField()
    concern_picture = models.ImageField(upload_to='requests/broadcast/', null=True, blank=True)
    
    # Broadcast-specific fields
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SEARCHING)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)  # -90 to 90
    longitude = models.DecimalField(max_digits=9, decimal_places=6)  # -180 to 180
    search_radius_km = models.PositiveIntegerField(default=5)
    expires_at = models.DateTimeField()
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'bookings_broadcastrequest'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'expires_at']),
            models.Index(fields=['latitude', 'longitude']),
        ]

    def __str__(self):
        return f"Broadcast Request {self.id} - {self.status}"

    def is_expired(self):
        """Check if the broadcast request has expired"""
        return timezone.now() > self.expires_at and self.status == self.Status.SEARCHING

    def can_accept_offers(self):
        """Check if mechanics can still accept this broadcast"""
        return self.status == self.Status.SEARCHING and not self.is_expired()


class BroadcastRequestAddOn(models.Model):
    """
    Service add-ons for broadcast requests.
    Allows clients to specify additional services beyond the main services.
    """
    broadcast_request = models.ForeignKey(
        BroadcastRequest, 
        on_delete=models.CASCADE, 
        related_name='add_ons'
    )
    service_add_on = models.ForeignKey(
        ServiceAddOn, 
        on_delete=models.CASCADE,
        related_name='broadcast_requests'
    )

    class Meta:
        db_table = 'bookings_broadcastrequestaddon'
        unique_together = [['broadcast_request', 'service_add_on']]

    def __str__(self):
        return f"AddOn for Broadcast {self.broadcast_request_id}: {self.service_add_on}"


class BroadcastOffer(models.Model):
    """
    Tracks mechanics attempting to accept broadcast requests.
    Only used for broadcast flow - prevents race conditions.
    """
    class Status(models.TextChoices):
        PENDING = "pending"           # Offer submitted, waiting
        ACCEPTED = "accepted"         # This mechanic won
        REJECTED = "rejected"         # Another mechanic was faster

    broadcast_request = models.ForeignKey(
        BroadcastRequest, 
        on_delete=models.CASCADE, 
        related_name='offers'
    )
    mechanic = models.ForeignKey(
        Mechanic, 
        on_delete=models.CASCADE, 
        related_name='broadcast_offers'
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    
    # Mechanic location when accepting (for distance calculation)
    mechanic_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    mechanic_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    
    # Calculated distance and pricing
    distance_km = models.DecimalField(
        max_digits=6, 
        decimal_places=2, 
        null=True, 
        blank=True,
        help_text="Distance from mechanic to service location in kilometers when accepted"
    )
    estimated_price = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        null=True, 
        blank=True,
        help_text="Estimated total price: service minimum prices + distance charge (₱10/km, min 5km)"
    )
    convenience_fee = models.DecimalField(
        max_digits=10, decimal_places=2,
        null=True, blank=True,
        help_text="Estimated convenience fee (base + distance + traffic surcharge)"
    )
    traffic_level = models.CharField(
        max_length=20,
        null=True, blank=True,
        help_text="Traffic level when mechanic viewed: light/moderate/heavy/severe"
    )
    estimated_eta_minutes = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Estimated travel time in minutes from ORS when mechanic viewed"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'bookings_broadcastoffer'
        ordering = ['created_at']  # First-come-first-served
        unique_together = [['broadcast_request', 'mechanic']]  # One offer per mechanic per broadcast
        indexes = [
            models.Index(fields=['broadcast_request', 'status']),
            models.Index(fields=['mechanic', 'created_at']),
        ]

    def __str__(self):
        return f"Offer by Mechanic {self.mechanic_id} for Broadcast {self.broadcast_request_id} - {self.status}"


class RequestAssignment(models.Model):
    """
    Allows a shop owner to assign multiple mechanics to a single job/request.
    The Request.provider field is kept as the primary provider for backward compatibility.
    """
    class Role(models.TextChoices):
        LEAD = "lead"
        ASSISTANT = "assistant"

    request = models.ForeignKey(Request, on_delete=models.CASCADE, related_name="assignments")
    mechanic = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="job_assignments")
    assigned_at = models.DateTimeField(auto_now_add=True)
    role = models.CharField(max_length=50, choices=Role.choices, default=Role.ASSISTANT, blank=True)

    class Meta:
        unique_together = [['request', 'mechanic']]

    def __str__(self):
        return f"Assignment: {self.mechanic} -> Request {self.request_id} ({self.role})"
class MechanicLocation(models.Model):
    """
    Stores live mechanic GPS location
    while booking status is on_the_way.
    Updated every 5 seconds from mechanic phone.
    Uses OneToOne so only ONE location record
    exists per booking at any time.
    Automatically overwritten on each update
    so database doesn't grow infinitely.
    """
    booking = models.OneToOneField(
        Booking,
        on_delete=models.CASCADE,
        related_name='mechanic_location'
    )
    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        help_text="Mechanic current latitude"
    )
    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        help_text="Mechanic current longitude"
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        help_text="Last time location was updated"
    )

    class Meta:
        db_table = 'bookings_mechaniclocation'

    def __str__(self):
        return f"Location for Booking {self.booking_id} — ({self.latitude}, {self.longitude})"