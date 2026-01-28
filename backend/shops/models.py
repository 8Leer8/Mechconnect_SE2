from django.db import models
from users.models import Mechanic, ShopOwner

class Shop(models.Model):
    class Status(models.TextChoices):
        OPEN = "open"
        CLOSED = "closed"

    shop_owner = models.OneToOneField(ShopOwner, on_delete=models.CASCADE)
    shop_name = models.CharField(max_length=150)
    contact_number = models.CharField(max_length=20, null=True, blank=True)
    email = models.EmailField(null=True, blank=True)
    website = models.CharField(max_length=255, null=True, blank=True)
    description = models.TextField(null=True, blank=True)
    service_banner = models.ImageField(upload_to='shops/banners/', null=True, blank=True)
    is_verified = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class ShopMechanic(models.Model):
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE)
    mechanic = models.ForeignKey(Mechanic, on_delete=models.CASCADE)
    date_joined = models.DateTimeField(auto_now_add=True)

class ShopDocument(models.Model):
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE)
    document_name = models.CharField(max_length=100)
    document_type = models.CharField(max_length=50)
    document_file = models.FileField(upload_to='shops/docs/')
    date_issued = models.DateField(null=True, blank=True)
    date_expiry = models.DateField(null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class ShopOwnerDocument(models.Model):
    shop_owner = models.ForeignKey(ShopOwner, on_delete=models.CASCADE)
    document_name = models.CharField(max_length=100)
    document_type = models.CharField(max_length=50)
    document_file = models.FileField(upload_to='owners/docs/')
    date_issued = models.DateField(null=True, blank=True)
    date_expiry = models.DateField(null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

