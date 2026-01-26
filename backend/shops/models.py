from django.db import models
from users.models import ShopOwner, Mechanic

class Shop(models.Model):
    STATUS_CHOICES = [('open', 'Open'), ('closed', 'Closed')]

    shop_owner = models.ForeignKey(ShopOwner, on_delete=models.CASCADE)
    shop_name = models.CharField(max_length=255)
    contact_number = models.CharField(max_length=50)
    email = models.EmailField()
    website = models.URLField(blank=True, null=True)
    description = models.TextField(blank=True)
    service_banner = models.ImageField(upload_to='shops/banners/', blank=True, null=True)
    is_verified = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class ShopMechanic(models.Model):
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE)
    mechanic = models.ForeignKey(Mechanic, on_delete=models.CASCADE)
    date_joined = models.DateField(auto_now_add=True)

# Documents
class MechanicDocument(models.Model):
    mechanic = models.ForeignKey(Mechanic, on_delete=models.CASCADE)
    document_name = models.CharField(max_length=255)
    document_type = models.CharField(max_length=50) # Use choices as per ERD
    document_file = models.FileField(upload_to='mechanics/docs/')
    date_issued = models.DateField(null=True, blank=True)
    date_expiry = models.DateField(null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class ShopDocument(models.Model):
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE)
    document_name = models.CharField(max_length=255)
    document_type = models.CharField(max_length=50) 
    document_file = models.FileField(upload_to='shops/docs/')
    date_issued = models.DateField(null=True, blank=True)
    date_expiry = models.DateField(null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class ShopOwnerDocument(models.Model):
    shop_owner = models.ForeignKey(ShopOwner, on_delete=models.CASCADE)
    document_name = models.CharField(max_length=255)
    document_type = models.CharField(max_length=50)
    document_file = models.FileField(upload_to='owners/docs/')
    date_issued = models.DateField(null=True, blank=True)
    date_expiry = models.DateField(null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)