from django.db import models
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from users.models import Mechanic
from shops.models import Shop

class ServiceCategory(models.Model):
    name = models.CharField(max_length=100)
    worth_token = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

class Service(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField()
    service_picture = models.ImageField(upload_to='services/pictures/', null=True, blank=True)
    category = models.ForeignKey(ServiceCategory, on_delete=models.CASCADE, null=True, blank=True)
    minimum_price = models.DecimalField(
        max_digits=10, 
        decimal_places=2, 
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Informational minimum price set by admin. Mechanics can set their own prices freely."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

class ServiceAddOn(models.Model):
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, null=True, blank=True, related_name='service_add_ons')
    service = models.ForeignKey(Service, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    description = models.TextField()
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)

class MechanicService(models.Model):
    mechanic = models.ForeignKey(Mechanic, on_delete=models.CASCADE, related_name='mechanic_services')
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name='mechanic_services')
    price = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text="Mechanic's price for this service. Set freely by the mechanic."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('mechanic', 'service')
        indexes = [
            models.Index(fields=['mechanic', 'service']),
            models.Index(fields=['service']),  # For aggregating prices by service
        ]

    def __str__(self):
        return f"{self.mechanic} - {self.service} (${self.price})"


#Shop Services
class ShopService(models.Model):
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE)
    service = models.ForeignKey(Service, on_delete=models.CASCADE)
    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0)],
        help_text="Shop's price for this service."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('shop', 'service')

class ShopServiceMechanic(models.Model):
    shop_service = models.ForeignKey(ShopService, on_delete=models.CASCADE)
    mechanic = models.ForeignKey(Mechanic, on_delete=models.CASCADE)

class Specialty(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class MechanicSpecialty(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
    class SourceType(models.TextChoices):
        CERTIFICATION = "certification", "Certification"
        LICENSE = "license", "License"
        TRAINING = "training", "Training"
        EXPERIENCE = "experience", "Work Experience"
        OTHER = "other", "Other"    
    mechanic = models.ForeignKey(Mechanic, on_delete=models.CASCADE)
    specialty = models.ForeignKey(Specialty, on_delete=models.CASCADE)
    # Proof source
    source_type = models.CharField(max_length=50, choices=SourceType.choices, default=SourceType.OTHER, help_text="Type of proof showing the mechanic's expertise.")
    proof_document = models.FileField(upload_to="mechanics/specialty_docs/", null=True, blank=True, help_text="Upload certificate, license, or supporting document.")
    source_description = models.TextField(null=True, blank=True, help_text="Explanation of the mechanic's experience or training.")
    # Admin review fields
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    rejection_reason = models.TextField(null=True, blank=True)
    requested_at = models.DateTimeField(auto_now_add=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    class Meta:
        unique_together = ('mechanic', 'specialty')
    def clean(self):
        if self.status == self.Status.REJECTED and not self.rejection_reason:
            raise ValidationError("Rejection reason is required when rejecting a specialty.")
    def __str__(self):
        return f"{self.mechanic} - {self.specialty} ({self.status})"
class ShopSpecialty(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
    class SourceType(models.TextChoices):
        CERTIFICATION = "certification", "Certification"
        LICENSE = "license", "License"
        TRAINING = "training", "Training"
        EXPERIENCE = "experience", "Work Experience"
        OTHER = "other", "Other"
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE)
    specialty = models.ForeignKey(Specialty, on_delete=models.CASCADE)
    # Proof source
    source_type = models.CharField(max_length=50, choices=SourceType.choices, default=SourceType.OTHER)
    proof_document = models.FileField(upload_to="shops/specialty_docs/", null=True, blank=True)
    source_description = models.TextField(null=True, blank=True)
    # Admin review fields
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    rejection_reason = models.TextField(null=True, blank=True)
    requested_at = models.DateTimeField(auto_now_add=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    class Meta:
        unique_together = ('shop', 'specialty')
    def clean(self):
        if self.status == self.Status.REJECTED and not self.rejection_reason:
            raise ValidationError("Rejection reason is required when rejecting a specialty.")
    def __str__(self):
        return f"{self.shop} - {self.specialty} ({self.status})"
class Tag(models.Model):
    name = models.CharField(max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)

class ServiceTag(models.Model):
    service = models.ForeignKey(Service, on_delete=models.CASCADE)
    tag = models.ForeignKey(Tag, on_delete=models.CASCADE)
