from django.db import models
from users.models import Client, Account, Admin
from services.models import Service, ServiceAddOn

class ServiceLocation(models.Model):
    street_name = models.CharField(max_length=100)
    subdivision_village = models.CharField(max_length=100, null=True, blank=True)
    barangay = models.CharField(max_length=100)
    city_municipality = models.CharField(max_length=100)
    landmark = models.CharField(max_length=255, null=True, blank=True)

class Request(models.Model):
    class Type(models.TextChoices):
        CUSTOM = "custom"
        DIRECT = "direct"
        EMERGENCY = "emergency"

    client = models.ForeignKey(Client, on_delete=models.CASCADE)
    provider = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="provided_requests", null=True, blank=True)
    request_type = models.CharField(max_length=20, choices=Type.choices)
    service_location = models.ForeignKey(ServiceLocation, on_delete=models.CASCADE, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

class CustomRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending"
        QUOTED = "quoted"
        REJECTED = "rejected"
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
    request = models.OneToOneField(Request, on_delete=models.CASCADE)
    service = models.ForeignKey(Service, on_delete=models.CASCADE)
    request_status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)

class DirectRequestAddOn(models.Model):
    request = models.ForeignKey(Request, on_delete=models.CASCADE)
    service_add_on = models.ForeignKey(ServiceAddOn, on_delete=models.CASCADE)

class EmergencyRequest(models.Model):
    request = models.OneToOneField(Request, on_delete=models.CASCADE)
    description = models.TextField()
    concern_picture = models.ImageField(upload_to='requests/emergency/', null=True, blank=True)
    providers_note = models.TextField(null=True, blank=True)

class Booking(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active"
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