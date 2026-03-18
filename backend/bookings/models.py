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
        ACTIVE = "active"            # Job started
        PAUSED = "paused"            # Job paused
        FINISHED = "finished"        # Job finished, pending payment
        PENDING_PAYMENT = "pending_payment" # Pending payment
        COMPLETED = "completed"
        REWORKED = "reworked"
        CANCELLED = "cancelled"
        DISPUTED = "disputed"

    request = models.OneToOneField(Request, on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    amount_fee = models.DecimalField(max_digits=10, decimal_places=2)
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
    class Status(models.TextChoices):
        PENDING = "pending"
        SOLVED = "solved"
        REFUNDED = "refunded"

    booking = models.OneToOneField(Booking, on_delete=models.CASCADE)
    complainer = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="complaints_made")
    complaint_against = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="complaints_received")
    admin = models.ForeignKey(Admin, on_delete=models.CASCADE, null=True, blank=True)
    issue_description = models.TextField()
    issue_picture = models.ImageField(upload_to='bookings/disputes/', null=True, blank=True)
    resolution_notes = models.TextField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
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
        ('cash', 'cash'),
        ('online', 'online'),
    )

    payment_received = models.BooleanField(default=False)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, default='cash')
    transaction_id = models.CharField(max_length=255, null=True, blank=True)
    receipt_image = models.ImageField(upload_to='bookings/receipts/', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


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
        help_text="Distance from mechanic to service location in kilometers"
    )
    estimated_price = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        null=True, 
        blank=True,
        help_text="Estimated total price: service minimum prices + distance charge (₱10/km, min 5km)"
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
