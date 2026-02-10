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

class ShopService(models.Model):
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE)
    service = models.ForeignKey(Service, on_delete=models.CASCADE)

class ShopServiceMechanic(models.Model):
    shop_service = models.ForeignKey(ShopService, on_delete=models.CASCADE)
    mechanic = models.ForeignKey(Mechanic, on_delete=models.CASCADE)

class Specialty(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class MechanicSpecialty(models.Model):
    mechanic = models.ForeignKey(Mechanic, on_delete=models.CASCADE)
    specialty = models.ForeignKey(Specialty, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

class ShopSpecialty(models.Model):
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE)
    specialty = models.ForeignKey(Specialty, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

class Tag(models.Model):
    name = models.CharField(max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)

class ServiceTag(models.Model):
    service = models.ForeignKey(Service, on_delete=models.CASCADE)
    tag = models.ForeignKey(Tag, on_delete=models.CASCADE)
