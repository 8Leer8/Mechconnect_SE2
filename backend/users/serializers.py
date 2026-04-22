from rest_framework import serializers
from .models import (
    Account, AccountAddress, AccountRole, Client, 
    Mechanic, ShopOwner, Admin, PasswordReset, MechanicReview
)
from django.contrib.auth.hashers import make_password, check_password
from django.utils import timezone
from django.db.models import Avg
from MainBackend.storage_utils import get_media_url
from services.models import ServiceAddOn
from services.serializers import ServiceAddOnPublicSerializer
import re
import logging


class AccountAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = AccountAddress
        fields = [
            'house_building_number', 'street_name', 'subdivision_village',
            'barangay', 'city_municipality', 'province', 'region', 'postal_code'
        ]


class AccountRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = AccountRole
        fields = ['account_role', 'appointed_at']


class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = ['profile_photo', 'contact_number']


class MechanicSerializer(serializers.ModelSerializer):
    shop_name = serializers.SerializerMethodField()
    shop_id = serializers.IntegerField(source='shop.id', read_only=True, allow_null=True)
    
    class Meta:
        model = Mechanic
        fields = [
            'profile_photo', 'contact_number', 'bio', 'average_rating',
            'is_working_for_shop', 'status', 'is_locked', 'shop_id', 'shop_name'
        ]
    
    def get_shop_name(self, obj):
        """Get shop name if mechanic is working for a shop"""
        if obj.is_working_for_shop and obj.shop:
            return obj.shop.shop_name
        return None


class ShopOwnerSerializer(serializers.ModelSerializer):
    shop = serializers.SerializerMethodField()

    class Meta:
        model = ShopOwner
        fields = ['profile_photo', 'contact_number', 'owns_shop', 'shop']

    def get_shop(self, obj):
        shop = getattr(obj, 'shop', None)
        if not shop:
            return None

        request = self.context.get('request') if getattr(self, 'context', None) else None
        return {
            'shop_name': shop.shop_name,
            'contact_number': shop.contact_number,
            'email': shop.email,
            'website': shop.website,
            'description': shop.description,
            'service_banner': get_media_url(shop.service_banner, request) if shop.service_banner else None,
        }


class AdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Admin
        fields = ['profile_photo', 'contact_number', 'is_superadmin']


class AccountSerializer(serializers.ModelSerializer):
    address = AccountAddressSerializer(source='accountaddress', read_only=True)
    roles = AccountRoleSerializer(source='accountrole_set', many=True, read_only=True)
    profile = serializers.SerializerMethodField()
    is_superadmin = serializers.SerializerMethodField()

    class Meta:
        model = Account
        fields = [
            'id', 'lastname', 'firstname', 'middlename', 'email',
            'date_of_birth', 'gender', 'username', 'is_active',
            'is_verified', 'last_login', 'address', 'roles', 'profile',
            'is_superadmin'
        ]
        read_only_fields = ['id', 'is_active', 'is_verified', 'last_login']

    def get_is_superadmin(self, obj):
        """Return is_superadmin flag if user is an admin, otherwise False"""
        if hasattr(obj, 'admin') and obj.admin:
            return obj.admin.is_superadmin
        return False

    def get_profile(self, obj):
        """Get the profile data based on the user's role"""
        try:
            if hasattr(obj, 'client'):
                return ClientSerializer(obj.client).data
            elif hasattr(obj, 'mechanic'):
                return MechanicSerializer(obj.mechanic).data
            elif hasattr(obj, 'shopowner'):
                return ShopOwnerSerializer(obj.shopowner).data
            elif hasattr(obj, 'admin'):
                return AdminSerializer(obj.admin).data
        except:
            pass
        return None


class ProfileDetailSerializer(serializers.ModelSerializer):
    """Detailed profile serializer for profile page"""
    full_name = serializers.SerializerMethodField()
    user_type = serializers.SerializerMethodField()
    available_roles = serializers.SerializerMethodField()
    current_role_profile = serializers.SerializerMethodField()
    address = AccountAddressSerializer(source='accountaddress', read_only=True)
    
    class Meta:
        model = Account
        fields = [
            'id', 'username', 'email', 'full_name', 'firstname', 'lastname',
            'middlename', 'date_of_birth', 'gender', 'is_verified',
            'user_type', 'available_roles', 'current_role_profile', 'address'
        ]
    
    def get_full_name(self, obj):
        """Get full name of user"""
        parts = [obj.firstname, obj.middlename, obj.lastname]
        return ' '.join(filter(None, parts))
    
    def get_user_type(self, obj):
        """Get all user types/roles"""
        roles = obj.accountrole_set.values_list('account_role', flat=True)
        return list(roles)
    
    def get_available_roles(self, obj):
        """Get available roles for switching"""
        roles = obj.accountrole_set.values_list('account_role', flat=True)
        role_list = []
        for role in roles:
            role_list.append({
                'value': role,
                'label': role.replace('_', ' ').title()
            })
        return role_list
    
    def get_current_role_profile(self, obj):
        """Get current role profile data"""
        profiles = {}
        if hasattr(obj, 'client'):
            profiles['client'] = ClientSerializer(obj.client, context=self.context).data
        if hasattr(obj, 'mechanic'):
            profiles['mechanic'] = MechanicSerializer(obj.mechanic, context=self.context).data
        if hasattr(obj, 'shopowner'):
            profiles['shop_owner'] = ShopOwnerSerializer(obj.shopowner, context=self.context).data
        if hasattr(obj, 'admin'):
            profiles['admin'] = AdminSerializer(obj.admin, context=self.context).data
        return profiles


class RoleSwitchSerializer(serializers.Serializer):
    """Serializer for role switching"""
    role = serializers.ChoiceField(choices=[
        ('client', 'Client'),
        ('mechanic', 'Mechanic'),
        ('shop_owner', 'Shop Owner')
    ])
    
    def validate_role(self, value):
        """Validate that user has this role"""
        account = self.context.get('account')
        if not account:
            raise serializers.ValidationError("Account context required")
        
        user_roles = account.accountrole_set.values_list('account_role', flat=True)
        if value not in user_roles:
            raise serializers.ValidationError(
                f"You don't have the {value} role. Available roles: {', '.join(user_roles)}"
            )
        return value


class ProfileSettingsSerializer(serializers.Serializer):
    """Serializer for updating profile settings"""
    # Personal information
    firstname = serializers.CharField(max_length=100, required=False)
    lastname = serializers.CharField(max_length=100, required=False)
    middlename = serializers.CharField(max_length=100, required=False, allow_blank=True)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    gender = serializers.CharField(max_length=20, required=False, allow_blank=True)
    
    # Contact information
    contact_number = serializers.CharField(max_length=20, required=False, allow_blank=True)

    # Mechanic profile
    bio = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    # Shop owner profile
    shop_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    shop_contact_number = serializers.CharField(max_length=20, required=False, allow_blank=True)
    shop_email = serializers.EmailField(required=False, allow_blank=True, allow_null=True)
    website = serializers.CharField(max_length=255, required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)
    
    # Address information
    house_building_number = serializers.CharField(max_length=50, required=False, allow_blank=True)
    street_name = serializers.CharField(max_length=100, required=False)
    subdivision_village = serializers.CharField(max_length=100, required=False, allow_blank=True)
    barangay = serializers.CharField(max_length=100, required=False)
    city_municipality = serializers.CharField(max_length=100, required=False)
    province = serializers.CharField(max_length=100, required=False)
    region = serializers.CharField(max_length=100, required=False)
    postal_code = serializers.CharField(max_length=20, required=False, allow_blank=True)


class RegisterSerializer(serializers.Serializer):
    # Account fields
    lastname = serializers.CharField(max_length=100)
    firstname = serializers.CharField(max_length=100)
    middlename = serializers.CharField(max_length=100, required=False, allow_blank=True)
    email = serializers.EmailField()
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    gender = serializers.CharField(max_length=20, required=False, allow_blank=True)
    username = serializers.CharField(max_length=50)
    password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)
    
    # Role selection
    role = serializers.ChoiceField(choices=[
        ('client', 'Client'),
        ('mechanic', 'Mechanic'),
        ('shop_owner', 'Shop Owner')
    ])
    
    # Address fields
    house_building_number = serializers.CharField(max_length=50, required=False, allow_blank=True)
    street_name = serializers.CharField(max_length=100)
    subdivision_village = serializers.CharField(max_length=100, required=False, allow_blank=True)
    barangay = serializers.CharField(max_length=100)
    city_municipality = serializers.CharField(max_length=100)
    province = serializers.CharField(max_length=100)
    region = serializers.CharField(max_length=100)
    postal_code = serializers.CharField(max_length=20, required=False, allow_blank=True)
    
    # Profile fields
    contact_number = serializers.CharField(max_length=20, required=False, allow_blank=True)

    def validate_email(self, value):
        if Account.objects.filter(email=value).exists():
            raise serializers.ValidationError("Email is already registered")
        return value

    def validate_username(self, value):
        if Account.objects.filter(username=value).exists():
            raise serializers.ValidationError("Username already exists")
        # Username validation: alphanumeric and underscores only
        if not re.match(r'^[a-zA-Z0-9_]+$', value):
            raise serializers.ValidationError("Username can only contain letters, numbers, and underscores")
        return value

    def validate(self, data):
        if data['password'] != data['confirm_password']:
            raise serializers.ValidationError({"password": "Passwords do not match"})
        
        # Password strength validation
        password = data['password']
        if not re.search(r'[A-Z]', password):
            raise serializers.ValidationError({"password": "Password must contain at least one uppercase letter"})
        if not re.search(r'[a-z]', password):
            raise serializers.ValidationError({"password": "Password must contain at least one lowercase letter"})
        if not re.search(r'[0-9]', password):
            raise serializers.ValidationError({"password": "Password must contain at least one number"})
        
        return data

    def create(self, validated_data):
        # Remove confirm_password
        validated_data.pop('confirm_password')
        
        # Extract role and profile data
        role = validated_data.pop('role')
        contact_number = validated_data.pop('contact_number', None)
        
        # Extract address data
        address_data = {
            'house_building_number': validated_data.pop('house_building_number', None),
            'street_name': validated_data.pop('street_name'),
            'subdivision_village': validated_data.pop('subdivision_village', None),
            'barangay': validated_data.pop('barangay'),
            'city_municipality': validated_data.pop('city_municipality'),
            'province': validated_data.pop('province'),
            'region': validated_data.pop('region'),
            'postal_code': validated_data.pop('postal_code', None),
        }
        
        # Hash password
        validated_data['password'] = make_password(validated_data['password'])
        
        # Create account
        account = Account.objects.create(**validated_data)
        
        # Create address
        AccountAddress.objects.create(account=account, **address_data)
        
        # Create role
        AccountRole.objects.create(account=account, account_role=role)
        
        # Create profile based on role
        profile_data = {'account': account, 'contact_number': contact_number}
        if role == 'client':
            Client.objects.create(**profile_data)
        elif role == 'mechanic':
            Mechanic.objects.create(**profile_data)
        elif role == 'shop_owner':
            ShopOwner.objects.create(**profile_data)
        
        return account


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
    
    logger = logging.getLogger(__name__)

    def validate(self, data):
        username = data.get('username')
        password = data.get('password')

        try:
            account = Account.objects.get(username=username)
        except Account.DoesNotExist:
            raise serializers.ValidationError({"username": "User not found"})
        except Exception as e:
            self.logger.exception('Error fetching account for username=%s: %s', username, str(e))
            raise serializers.ValidationError({"non_field_errors": "Server error during authentication"})

        try:
            if not check_password(password, account.password):
                raise serializers.ValidationError({"password": "Incorrect password"})
        except serializers.ValidationError:
            raise
        except Exception as e:
            self.logger.exception('Error checking password for username=%s: %s', username, str(e))
            raise serializers.ValidationError({"non_field_errors": "Server error during authentication"})

        data['account'] = account
        return data


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)
    device_name = serializers.CharField(required=False, allow_blank=True, max_length=255)
    near_location = serializers.CharField(required=False, allow_blank=True, max_length=255)

    def _get_account(self):
        account = self.context.get('account')
        if account:
            return account

        request = self.context.get('request')
        return getattr(request, 'user', None) if request else None

    def validate(self, data):
        if data['new_password'] != data['confirm_password']:
            raise serializers.ValidationError({"password": "Passwords do not match"})
        
        # Password strength validation
        password = data['new_password']
        if not re.search(r'[A-Z]', password):
            raise serializers.ValidationError({"password": "Password must contain at least one uppercase letter"})
        if not re.search(r'[a-z]', password):
            raise serializers.ValidationError({"password": "Password must contain at least one lowercase letter"})
        if not re.search(r'[0-9]', password):
            raise serializers.ValidationError({"password": "Password must contain at least one number"})

        account = self._get_account()
        if account and check_password(password, account.password):
            raise serializers.ValidationError({"new_password": "New password must be different from your current password"})
        
        return data

    def validate_old_password(self, value):
        account = self._get_account()
        if not account:
            raise serializers.ValidationError("Unable to verify account")
        if not check_password(value, account.password):
            raise serializers.ValidationError("Old password is incorrect")
        return value


class VerifyCurrentPasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        account = self.context.get('account')
        if not account or not check_password(value, account.password):
            raise serializers.ValidationError("Current password is incorrect")
        return value


class ChangeEmailSerializer(serializers.Serializer):
    new_email = serializers.EmailField()
    current_password = serializers.CharField(write_only=True)
    update_shop_email = serializers.BooleanField(required=False, default=True)

    def validate_current_password(self, value):
        account = self.context.get('account')
        if not account or not check_password(value, account.password):
            raise serializers.ValidationError("Current password is incorrect")
        return value

    def validate_new_email(self, value):
        account = self.context.get('account')
        normalized_value = value.strip().lower()

        if account and account.email and account.email.strip().lower() == normalized_value:
            raise serializers.ValidationError("New email must be different from your current email")

        if Account.objects.filter(email__iexact=normalized_value).exists():
            raise serializers.ValidationError("Email is already registered")

        return normalized_value


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()

    def validate_email(self, value):
        try:
            account = Account.objects.get(email=value)
        except Account.DoesNotExist:
            raise serializers.ValidationError("No account found with this email")
        return value


class PasswordResetConfirmSerializer(serializers.Serializer):
    reset_token = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True)

    def validate(self, data):
        if data['new_password'] != data['confirm_password']:
            raise serializers.ValidationError({"password": "Passwords do not match"})
        
        # Password strength validation
        password = data['new_password']
        if not re.search(r'[A-Z]', password):
            raise serializers.ValidationError({"password": "Password must contain at least one uppercase letter"})
        if not re.search(r'[a-z]', password):
            raise serializers.ValidationError({"password": "Password must contain at least one lowercase letter"})
        if not re.search(r'[0-9]', password):
            raise serializers.ValidationError({"password": "Password must contain at least one number"})
        
        return data

    def validate_reset_token(self, value):
        try:
            reset = PasswordReset.objects.get(
                reset_token=value,
                status=PasswordReset.Status.PENDING
            )
            if timezone.now() > reset.expires_at:
                reset.status = PasswordReset.Status.EXPIRED
                reset.save()
                raise serializers.ValidationError("Reset token has expired")
        except PasswordReset.DoesNotExist:
            raise serializers.ValidationError("Invalid or expired reset token")
        return value


class PasswordResetVerifySerializer(serializers.Serializer):
    reset_token = serializers.CharField()

    def validate_reset_token(self, value):
        try:
            reset = PasswordReset.objects.get(
                reset_token=value,
                status=PasswordReset.Status.PENDING
            )
            if timezone.now() > reset.expires_at:
                reset.status = PasswordReset.Status.EXPIRED
                reset.save()
                raise serializers.ValidationError("Reset token has expired")
        except PasswordReset.DoesNotExist:
            raise serializers.ValidationError("Invalid or expired reset token")
        return value


class MechanicReviewSerializer(serializers.ModelSerializer):
    """Serializer for mechanic reviews"""
    reviewer_name = serializers.SerializerMethodField()
    reviewer_photo = serializers.SerializerMethodField()
    
    class Meta:
        model = MechanicReview
        fields = [
            'id', 'reviewer_name', 'reviewer_photo', 
            'rating', 'comment', 'created_at'
        ]
    
    def get_reviewer_name(self, obj):
        """Get reviewer's full name"""
        parts = [obj.reviewer.firstname, obj.reviewer.lastname]
        return ' '.join(filter(None, parts))
    
    def get_reviewer_photo(self, obj):
        """Get reviewer's profile photo if they're a client"""
        try:
            if hasattr(obj.reviewer, 'client') and obj.reviewer.client.profile_photo:
                request = self.context.get('request')
                return get_media_url(obj.reviewer.client.profile_photo, request)
        except:
            pass
        return None


class MechanicServiceSerializer(serializers.ModelSerializer):
    """Serializer for mechanic services"""
    service_name = serializers.CharField(source='service.name', read_only=True)
    service_description = serializers.CharField(source='service.description', read_only=True)
    service_category = serializers.CharField(source='service.category.name', read_only=True)
    service_picture = serializers.SerializerMethodField()
    
    class Meta:
        model = None  # Will be imported from services
        fields = [
            'id', 'service_name', 'service_description', 
            'service_category', 'service_picture', 'price'
        ]
    
    def get_service_picture(self, obj):
        """Get service picture URL"""
        try:
            if obj.service.service_picture:
                request = self.context.get('request')
                return get_media_url(obj.service.service_picture, request)
        except:
            pass
        return None


class MechanicSpecialtySerializer(serializers.ModelSerializer):
    """Serializer for mechanic specialties"""
    specialty_name = serializers.CharField(source='specialty.name', read_only=True)
    specialty_description = serializers.CharField(source='specialty.description', read_only=True)
    
    class Meta:
        model = None  # Will be imported from services
        fields = ['id', 'specialty_name', 'specialty_description', 'created_at']


class MechanicProfileSerializer(serializers.ModelSerializer):
    """Comprehensive serializer for mechanic profile page"""
    # Account information
    full_name = serializers.SerializerMethodField()
    firstname = serializers.CharField(source='account.firstname', read_only=True)
    lastname = serializers.CharField(source='account.lastname', read_only=True)
    middlename = serializers.CharField(source='account.middlename', read_only=True)
    email = serializers.EmailField(source='account.email', read_only=True)
    username = serializers.CharField(source='account.username', read_only=True)
    
    # Profile photo
    profile_photo_url = serializers.SerializerMethodField()
    
    # Rating and reviews
    average_rating = serializers.DecimalField(max_digits=3, decimal_places=2, read_only=True)
    total_reviews = serializers.SerializerMethodField()
    reviews = serializers.SerializerMethodField()
    
    # Years of experience (calculated from account creation)
    years_active = serializers.SerializerMethodField()
    account_created = serializers.DateTimeField(source='created_at', read_only=True)
    
    # Shop information
    is_part_of_shop = serializers.BooleanField(source='is_working_for_shop', read_only=True)
    shop_name = serializers.SerializerMethodField()
    shop_id = serializers.IntegerField(source='shop.id', read_only=True, allow_null=True)
    # Expose account id so clients can reference provider Account id
    account_id = serializers.IntegerField(source='account.id', read_only=True)
    address = AccountAddressSerializer(source='account.accountaddress', read_only=True)
    
    # Specialties
    specialties = serializers.SerializerMethodField()
    
    # Services offered
    services = serializers.SerializerMethodField()

    # Mechanic add-ons
    addons = serializers.SerializerMethodField()
    
    # Additional info
    contact_number = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    
    class Meta:
        model = Mechanic
        fields = [
            'id', 'full_name', 'firstname', 'lastname', 'middlename',
                'account_id',
                'email', 'username', 'profile_photo_url', 'bio',
            'average_rating', 'total_reviews', 'reviews',
            'years_active', 'account_created',
            'is_part_of_shop', 'shop_name', 'shop_id',
            'address',
            'specialties', 'services', 'addons',
            'contact_number', 'status'
        ]
    
    def get_full_name(self, obj):
        """Get mechanic's full name"""
        parts = [obj.account.firstname, obj.account.middlename, obj.account.lastname]
        return ' '.join(filter(None, parts))
    
    def get_profile_photo_url(self, obj):
        """Get absolute URL for profile photo"""
        if obj.profile_photo:
            request = self.context.get('request')
            return get_media_url(obj.profile_photo, request)
        return None
    
    def get_total_reviews(self, obj):
        """Get total number of reviews"""
        return obj.reviews.count()
    
    def get_reviews(self, obj):
        """Get all reviews for this mechanic"""
        reviews = obj.reviews.all().order_by('-created_at')
        return MechanicReviewSerializer(reviews, many=True, context=self.context).data
    
    def get_years_active(self, obj):
        """Calculate years since account creation"""
        if obj.created_at:
            delta = timezone.now() - obj.created_at
            years = delta.days / 365.25
            return round(years, 1)
        return 0
    
    def get_shop_name(self, obj):
        """Get shop name if mechanic is working for a shop"""
        if obj.is_working_for_shop and obj.shop:
            return obj.shop.shop_name
        return None
    
    def get_specialties(self, obj):
        """Get mechanic's specialties"""
        try:
            from services.models import MechanicSpecialty
            specialties = MechanicSpecialty.objects.filter(mechanic=obj).select_related('specialty')
            return [
                {
                    'id': ms.specialty.id,
                    'name': ms.specialty.name,
                    'description': ms.specialty.description
                }
                for ms in specialties
            ]
        except:
            return []
    
    def get_services(self, obj):
        """Get services offered by this mechanic"""
        try:
            from services.models import MechanicService
            services = MechanicService.objects.filter(mechanic=obj).select_related('service', 'service__category')
            result = []
            for ms in services:
                service_data = {
                    'id': ms.id,
                    'service_id': ms.service.id,
                    'service_name': ms.service.name,
                    'service_description': ms.service.description,
                    'price': str(ms.price),
                    'category': ms.service.category.name if ms.service.category else None
                }
                
                # Add service picture URL if available
                if ms.service.service_picture:
                    request = self.context.get('request')
                    service_data['service_picture'] = get_media_url(ms.service.service_picture, request)
                
                result.append(service_data)
            
            return result
        except Exception as e:
            return []

    def get_addons(self, obj):
        """Get active mechanic add-ons for public profile consumption"""
        addon_qs = getattr(obj, 'public_addons', None)
        if addon_qs is None:
            filters = {
                'mechanic': obj,
                'mechanic__isnull': False,
            }
            addon_field_names = {field.name for field in ServiceAddOn._meta.fields}
            if 'is_active' in addon_field_names:
                filters['is_active'] = True

            addon_qs = ServiceAddOn.objects.select_related(
                'mechanic', 'shop', 'service'
            ).filter(**filters)

        return ServiceAddOnPublicSerializer(
            addon_qs,
            many=True,
            context=self.context,
        ).data

