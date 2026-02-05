from django.db import models
from django.utils import timezone

class Account(models.Model):
    lastname = models.CharField(max_length=100)
    firstname = models.CharField(max_length=100)
    middlename = models.CharField(max_length=100, null=True, blank=True)
    email = models.EmailField(unique=True)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=20, null=True, blank=True)
    username = models.CharField(max_length=50, unique=True)
    password = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    is_verified = models.BooleanField(default=False)
    last_login = models.DateTimeField(null=True, blank=True)

class AccountAddress(models.Model):
    account = models.OneToOneField(Account, on_delete=models.CASCADE)
    house_building_number = models.CharField(max_length=50, null=True, blank=True)
    street_name = models.CharField(max_length=100)
    subdivision_village = models.CharField(max_length=100, null=True, blank=True)
    barangay = models.CharField(max_length=100)
    city_municipality = models.CharField(max_length=100)
    province = models.CharField(max_length=100)
    region = models.CharField(max_length=100)
    postal_code = models.CharField(max_length=20, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class AccountRole(models.Model):
    class Role(models.TextChoices):
        CLIENT = "client"
        MECHANIC = "mechanic"
        SHOP_OWNER = "shop_owner"
        ADMIN = "admin"

    account = models.ForeignKey(Account, on_delete=models.CASCADE)
    account_role = models.CharField(max_length=20, choices=Role.choices)
    appointed_at = models.DateTimeField(auto_now_add=True)

class AccountWarning(models.Model):
    issuer = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="issued_warnings")
    receiver = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="received_warnings")
    reason_warning = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class AccountBan(models.Model):
    account = models.OneToOneField(Account, on_delete=models.CASCADE)
    reason_ban = models.TextField()
    banned_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class PasswordReset(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending"
        USED = "used"
        EXPIRED = "expired"

    account = models.ForeignKey(Account, on_delete=models.CASCADE)
    reset_token = models.CharField(max_length=255, unique=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    requested_at = models.DateTimeField(auto_now_add=True)
    used_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField()

class ReportAccount(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending"
        REVIEWED = "reviewed"
        ACTION_TAKEN = "action_taken"

    reported = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="reports_against")
    reporter = models.ForeignKey(Account, on_delete=models.CASCADE, related_name="reports_made")
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    reported_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    admin_action_notes = models.TextField(null=True, blank=True)

class Client(models.Model):
    account = models.OneToOneField(Account, on_delete=models.CASCADE)
    profile_photo = models.ImageField(upload_to='clients/profiles/', null=True, blank=True)
    contact_number = models.CharField(max_length=20, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class Mechanic(models.Model):
    class Status(models.TextChoices):
        AVAILABLE = "available"
        WORKING = "working"

    account = models.OneToOneField(Account, on_delete=models.CASCADE)
    profile_photo = models.ImageField(upload_to='mechanics/profiles/', null=True, blank=True)
    contact_number = models.CharField(max_length=20, null=True, blank=True)
    average_rating = models.DecimalField(max_digits=3, decimal_places=2, default=0)
    is_working_for_shop = models.BooleanField(default=False)
    shop = models.ForeignKey('shops.Shop', on_delete=models.SET_NULL, null=True, blank=True, related_name='mechanics')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.AVAILABLE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class ShopOwner(models.Model):
    account = models.OneToOneField(Account, on_delete=models.CASCADE)
    profile_photo = models.ImageField(upload_to='owners/profiles/', null=True, blank=True)
    contact_number = models.CharField(max_length=20, null=True, blank=True)
    owns_shop = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class Admin(models.Model):
    account = models.OneToOneField(Account, on_delete=models.CASCADE)
    profile_photo = models.ImageField(upload_to='admins/profiles/', null=True, blank=True)
    contact_number = models.CharField(max_length=20, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class MechanicDocument(models.Model):
    class DocumentType(models.TextChoices):
        LICENSE = "license"
        CERTIFICATION = "certification"
        ID = "id"
        OTHERS = "others"
    
    mechanic = models.ForeignKey(Mechanic, on_delete=models.CASCADE)
    document_name = models.CharField(max_length=100)
    document_type = models.CharField(max_length=50, choices=DocumentType.choices)
    document_file = models.FileField(upload_to='mechanics/docs/')
    date_issued = models.DateField(null=True, blank=True)
    date_expiry = models.DateField(null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class TokenPurchase(models.Model):
    account = models.ForeignKey(Account, on_delete=models.CASCADE)
    tokens_amount = models.IntegerField()
    price = models.DecimalField(max_digits=10, decimal_places=2)
    payment_method = models.CharField(max_length=50, null=True, blank=True)
    status = models.CharField(max_length=50, default='pending')
    purchased_at = models.DateTimeField(auto_now_add=True)
