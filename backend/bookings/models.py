from django.db import models
from users.models import Account, Client
from services.models import Service, ServiceAddOn

class Request(models.Model):
    TYPE_CHOICES = [('custom', 'Custom'), ('direct', 'Direct'), ('emergency', 'Emergency')]
    STATUS_CHOICES = [('pending', 'Pending'), ('quoted', 'Quoted'), ('accepted', 'Accepted'), ('rejected', 'Rejected')]

    client = models.ForeignKey(Client, on_delete=models.CASCADE)
    provider_id = models.IntegerField() # Can refer to Mechanic or Shop (GenericFK useful here)
    request_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    request_status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    # Locations would likely be better as a separate model or JSON field, using ID for now
    service_location_id = models.IntegerField()
    service_time_id = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class CustomRequest(models.Model):
    request = models.OneToOneField(Request, on_delete=models.CASCADE, primary_key=True)
    description = models.TextField()
    concern_picture = models.ImageField(upload_to='requests/custom/', blank=True, null=True)
    providers_note = models.TextField(blank=True)

class QuotedRequestItem(models.Model):
    custom_request = models.ForeignKey(CustomRequest, on_delete=models.CASCADE)
    item = models.CharField(max_length=255)
    price = models.DecimalField(max_digits=10, decimal_places=2)

class DirectRequest(models.Model):
    request = models.OneToOneField(Request, on_delete=models.CASCADE, primary_key=True)
    service = models.ForeignKey(Service, on_delete=models.CASCADE)
    add_ons = models.ManyToManyField(ServiceAddOn, blank=True)

class Booking(models.Model):
    STATUS_CHOICES = [('active', 'Active'), ('completed', 'Completed'), ('refunded', 'Refunded'), ('cancelled', 'Cancelled')]
    
    request = models.OneToOneField(Request, on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES)
    amount_fee = models.DecimalField(max_digits=10, decimal_places=2)
    booked_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

class ActiveBooking(models.Model):
    booking = models.OneToOneField(Booking, on_delete=models.CASCADE)
    status = models.CharField(max_length=50) # in_progress, working
    before_picture_service = models.ImageField(upload_to='bookings/before/', blank=True, null=True)
    after_picture_service = models.ImageField(upload_to='bookings/after/', blank=True, null=True)
    started_at = models.DateTimeField(auto_now_add=True)

class Dispute(models.Model):
    booking = models.ForeignKey(Booking, on_delete=models.CASCADE)
    complainer = models.ForeignKey(Account, related_name='filed_disputes', on_delete=models.CASCADE)
    complaint_against = models.ForeignKey(Account, related_name='received_disputes', on_delete=models.CASCADE)
    issue_description = models.TextField()
    issue_picture = models.ImageField(upload_to='disputes/', blank=True, null=True)
    status = models.CharField(max_length=50, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)