from django.db import models
from django.contrib.auth.models import AbstractUser

class Account(models.Model):
    # Depending on your auth setup, you might inherit from AbstractUser or AbstractBaseUser
    # Here is a standard implementation mimicking your schema
    lastname = models.CharField(max_length=255)
    firstname = models.CharField(max_length=255)
    middlename = models.CharField(max_length=255, blank=True, null=True)
    email = models.EmailField(unique=True)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=50, blank=True, null=True)
    username = models.CharField(max_length=150, unique=True)
    password = models.CharField(max_length=128) # Django handles hashing automatically
    is_active = models.BooleanField(default=True)
    is_verified = models.BooleanField(default=False)
    last_login = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.username

class AccountAddress(models.Model):
    account = models.OneToOneField(Account, on_delete=models.CASCADE, primary_key=True)
    house_building_number = models.CharField(max_length=255, blank=True)
    street_name = models.CharField(max_length=255, blank=True)
    subdivision_village = models.CharField(max_length=255, blank=True)
    barangay = models.CharField(max_length=255, blank=True)
    city_municipality = models.CharField(max_length=255, blank=True)
    province = models.CharField(max_length=255, blank=True)
    region = models.CharField(max_length=255, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class AccountRole(models.Model):
    ROLE_CHOICES = [
        ('client', 'Client'),
        ('mechanic', 'Mechanic'),
        ('shop_owner', 'Shop Owner'),
        ('admin', 'Admin'),
        ('head_admin', 'Head Admin'),
    ]
    account = models.ForeignKey(Account, on_delete=models.CASCADE)
    account_role = models.CharField(max_length=50, choices=ROLE_CHOICES)
    appointed_at = models.DateTimeField(auto_now_add=True)

class Client(models.Model):
    account = models.OneToOneField(Account, on_delete=models.CASCADE, primary_key=True)
    profile_photo = models.ImageField(upload_to='clients/photos/', blank=True, null=True)
    contact_number = models.CharField(max_length=50)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class ShopOwner(models.Model):
    STATUS_CHOICES = [('active', 'Active'), ('inactive', 'Inactive')]
    
    account = models.OneToOneField(Account, on_delete=models.CASCADE, primary_key=True)
    profile_photo = models.ImageField(upload_to='owners/photos/', blank=True, null=True)
    contact_number = models.CharField(max_length=50)
    # owns_shop logic is usually handled by the Shop model having a ForeignKey to ShopOwner
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='active')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class Mechanic(models.Model):
    RANKING_CHOICES = [
        ('standard', 'Standard'),
        ('bronze', 'Bronze'),
        ('silver', 'Silver'),
        ('gold', 'Gold'),
    ]
    STATUS_CHOICES = [('available', 'Available'), ('working', 'Working')]

    account = models.OneToOneField(Account, on_delete=models.CASCADE, primary_key=True)
    profile_photo = models.ImageField(upload_to='mechanics/photos/', blank=True, null=True)
    contact_number = models.CharField(max_length=50)
    average_rating = models.DecimalField(max_digits=3, decimal_places=2, default=0.00)
    ranking = models.CharField(max_length=20, choices=RANKING_CHOICES, default='standard')
    is_working_for_shop = models.BooleanField(default=False)
    # Shop relation is handled in ShopMechanic or a direct FK if 1:1, but your ERD has ShopMechanic
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='available')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class Admin(models.Model):
    account = models.OneToOneField(Account, on_delete=models.CASCADE, primary_key=True)
    profile_photo = models.ImageField(upload_to='admins/photos/', blank=True, null=True)
    contact_number = models.CharField(max_length=50)
    created_by_admin = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

# Additional Account Utilities
class PasswordReset(models.Model):
    account = models.ForeignKey(Account, on_delete=models.CASCADE)
    reset_token = models.CharField(max_length=255, unique=True)
    status = models.CharField(max_length=50, choices=[('pending','Pending'),('used','Used'),('expired','Expired')])
    requested_at = models.DateTimeField(auto_now_add=True)
    used_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField()

class AccountBan(models.Model):
    account = models.OneToOneField(Account, on_delete=models.CASCADE)
    reason_ban = models.TextField()
    banned_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class ReportAccount(models.Model):
    reported = models.ForeignKey(Account, related_name='reports_against', on_delete=models.CASCADE)
    reporter = models.ForeignKey(Account, related_name='reports_made', on_delete=models.CASCADE)
    reason = models.TextField()
    status = models.CharField(max_length=50, choices=[('pending','Pending'),('reviewed','Reviewed'),('action_taken','Action Taken')], default='pending')
    reported_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    admin_action_notes = models.TextField(blank=True)