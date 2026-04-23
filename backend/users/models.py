from django.db import models
from django.db.models import Q
from django.utils import timezone
from django.core.validators import MinValueValidator, MaxValueValidator

class Account(models.Model):
    lastname = models.CharField(max_length=100)
    firstname = models.CharField(max_length=100)
    middlename = models.CharField(max_length=100, null=True, blank=True)
    email = models.EmailField(unique=True, null=True, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=20, null=True, blank=True)
    username = models.CharField(max_length=50, unique=True)
    password = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    deactivated_at = models.DateTimeField(null=True, blank=True)
    is_verified = models.BooleanField(default=False)
    last_login = models.DateTimeField(null=True, blank=True)
    last_active_role = models.CharField(
        max_length=20, 
        null=True, 
        blank=True,
        help_text="Last role the user was using before logout"
    )
    
    @property
    def is_authenticated(self):
        """Compatibility property so Django/DRF permission checks work.

        Returns True for persisted Account instances.
        """
        return True

    @property
    def is_anonymous(self):
        return False

class AccountAddress(models.Model):
    account = models.OneToOneField(Account, on_delete=models.CASCADE)
    lat = models.FloatField(null=True, blank=True)
    lng = models.FloatField(null=True, blank=True)
    formatted_address = models.TextField(null=True, blank=True)
    house_building_number = models.CharField(max_length=50, null=True, blank=True)
    street_name = models.CharField(max_length=100)
    subdivision_village = models.CharField(max_length=100, null=True, blank=True)
    barangay = models.CharField(max_length=100)
    city_municipality = models.CharField(max_length=100)
    province = models.CharField(max_length=100)
    region = models.CharField(max_length=100)
    postal_code = models.CharField(max_length=20, null=True, blank=True)
    label = models.CharField(max_length=50, default='Main Branch')
    is_main = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class AccountBranchLocation(models.Model):
    class BranchType(models.TextChoices):
        MECHANIC = 'mechanic', 'Mechanic'
        SHOP_OWNER = 'shop_owner', 'Shop Owner'

    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='branch_locations')
    lat = models.FloatField(null=True, blank=True)
    lng = models.FloatField(null=True, blank=True)
    formatted_address = models.TextField(null=True, blank=True)
    barangay = models.CharField(max_length=100, null=True, blank=True)
    label = models.CharField(max_length=50)
    branch_type = models.CharField(max_length=20, choices=BranchType.choices, null=True, blank=True)
    is_main = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['created_at']
        constraints = [
            models.UniqueConstraint(fields=['account', 'label'], name='unique_branch_label_per_account'),
            models.UniqueConstraint(fields=['account'], condition=Q(is_main=True), name='unique_main_branch_location_per_account'),
        ]

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


class FavoriteMechanic(models.Model):
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="favorite_mechanics")
    mechanic = models.ForeignKey("Mechanic", on_delete=models.CASCADE, related_name="favorited_by_clients")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [["client", "mechanic"]]
        ordering = ["-created_at"]


class FavoriteShop(models.Model):
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="favorite_shops")
    shop = models.ForeignKey("shops.Shop", on_delete=models.CASCADE, related_name="favorited_by_clients")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [["client", "shop"]]
        ordering = ["-created_at"]

class Mechanic(models.Model):
    class VerificationStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
    class WorkStatus(models.TextChoices):
        AVAILABLE = "available", "Available"
        WORKING = "working", "Working"
    account = models.OneToOneField(Account, on_delete=models.CASCADE)
    profile_photo = models.ImageField(upload_to='mechanics/profiles/', null=True, blank=True)
    bio = models.TextField(null=True, blank=True)
    contact_number = models.CharField(max_length=20, null=True, blank=True)
    # Admin verification
    verification_status = models.CharField(max_length=20, choices=VerificationStatus.choices, default=VerificationStatus.PENDING, help_text="Admin approval status of the mechanic account.")
    rejection_note = models.TextField(null=True, blank=True, help_text="Reason provided by admin if the mechanic request is rejected.")
    verified_at = models.DateTimeField(null=True, blank=True)
    average_rating = models.DecimalField(max_digits=3, decimal_places=2, default=0)
    is_working_for_shop = models.BooleanField(default=False)
    shop = models.ForeignKey('shops.Shop', on_delete=models.SET_NULL, null=True, blank=True, related_name='mechanics')
    status = models.CharField(max_length=20, choices=WorkStatus.choices, default=WorkStatus.AVAILABLE)
    is_locked = models.BooleanField(
        default=False,
        help_text="When true, mechanic is blocked from accepting new jobs",
    )
    no_show_count = models.PositiveIntegerField(
        default=0,
        help_text="Total no-show violations recorded for anti-abuse penalties",
    )
    cooldown_until = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Mechanic cannot accept jobs until this timestamp",
    )
    payout_method = models.CharField(
        max_length=10,
        choices=[('gcash', 'GCash'), ('maya', 'Maya')],
        null=True,
        blank=True,
    )
    payout_number = models.CharField(
        max_length=11,
        null=True,
        blank=True,
        help_text="GCash or Maya number for receiving payouts",
    )
    tokens_balance = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    def __str__(self):
        return self.account.username

class MechanicReview(models.Model):
    """
    Review model for mechanics.
    Allows accounts to rate and review mechanics.
    Enforces one review per reviewer per mechanic.
    """
    reviewer = models.ForeignKey(
        Account, 
        on_delete=models.CASCADE, 
        related_name="mechanic_reviews_made"
    )
    mechanic = models.ForeignKey(
        Mechanic, 
        on_delete=models.CASCADE, 
        related_name="reviews"
    )
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="Rating from 1 to 5"
    )
    comment = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        # Enforce one review per reviewer per mechanic
        unique_together = [['reviewer', 'mechanic']]
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.reviewer.username} -> {self.mechanic.account.username} ({self.rating}/5)"

class ShopOwner(models.Model):
    class VerificationStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
    account = models.OneToOneField(Account, on_delete=models.CASCADE)
    profile_photo = models.ImageField(upload_to='owners/profiles/', null=True, blank=True)
    contact_number = models.CharField(max_length=20, null=True, blank=True)
    verification_status = models.CharField(max_length=20, choices=VerificationStatus.choices, default=VerificationStatus.PENDING, help_text="Admin approval status of the shop owner.")
    rejection_note = models.TextField(null=True,blank=True, help_text="Admin explanation when the shop owner application is rejected.")
    verified_at = models.DateTimeField(null=True, blank=True)
    payout_method = models.CharField(
        max_length=10,
        choices=[('gcash', 'GCash'), ('maya', 'Maya')],
        null=True,
        blank=True,
    )
    payout_number = models.CharField(
        max_length=11,
        null=True,
        blank=True,
        help_text="GCash or Maya number for receiving payouts",
    )
    owns_shop = models.BooleanField(default=False)
    tokens_balance = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    def __str__(self):
        return self.account.username

class Admin(models.Model):
    account = models.OneToOneField(Account, on_delete=models.CASCADE)
    profile_photo = models.ImageField(upload_to='admins/profiles/', null=True, blank=True)
    contact_number = models.CharField(max_length=20, null=True, blank=True)
    is_superadmin = models.BooleanField(default=False, help_text="If true, admin has access to Trust and Safety and Wallet & Token Ledger")
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
    # PayMongo tracking fields
    ewallet_source_id = models.CharField(max_length=255, null=True, blank=True)
    external_reference = models.CharField(max_length=255, null=True, blank=True)


class TokenTransaction(models.Model):
    """Record of token movements (top-ups and deductions).

    Use positive `tokens` for additions and negative for deductions (taxes).
    """
    account = models.ForeignKey(Account, on_delete=models.CASCADE)
    tokens = models.IntegerField()
    reason = models.CharField(max_length=100)
    related_booking_id = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class EmailVerification(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending"
        VERIFIED = "verified"
        EXPIRED = "expired"

    email = models.EmailField()
    verification_code = models.CharField(max_length=6)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['email', 'status']),
        ]


class SMSOTPVerification(models.Model):
    """SMS OTP verification records for audit trail and rate limiting."""
    contact_number = models.CharField(max_length=20, db_index=True)
    otp_code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_verified = models.BooleanField(default=False)
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['contact_number', 'is_verified', 'expires_at']),
            models.Index(fields=['created_at']),
        ]

    def is_expired(self):
        from django.utils import timezone
        return timezone.now() > self.expires_at

