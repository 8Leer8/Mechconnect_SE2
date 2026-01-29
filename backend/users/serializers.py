from rest_framework import serializers
from .models import (
    Account, AccountAddress, AccountRole, Client, 
    Mechanic, ShopOwner, Admin, PasswordReset
)
from django.contrib.auth.hashers import make_password, check_password
from django.utils import timezone
import re


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
    class Meta:
        model = Mechanic
        fields = [
            'profile_photo', 'contact_number', 'average_rating',
            'is_working_for_shop', 'status'
        ]


class ShopOwnerSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopOwner
        fields = ['profile_photo', 'contact_number', 'owns_shop']


class AdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Admin
        fields = ['profile_photo', 'contact_number']


class AccountSerializer(serializers.ModelSerializer):
    address = AccountAddressSerializer(source='accountaddress', read_only=True)
    roles = AccountRoleSerializer(source='accountrole_set', many=True, read_only=True)
    profile = serializers.SerializerMethodField()
    
    class Meta:
        model = Account
        fields = [
            'id', 'lastname', 'firstname', 'middlename', 'email',
            'date_of_birth', 'gender', 'username', 'is_active',
            'is_verified', 'last_login', 'address', 'roles', 'profile'
        ]
        read_only_fields = ['id', 'is_active', 'is_verified', 'last_login']

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
            raise serializers.ValidationError("Email already exists")
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

    def validate(self, data):
        username = data.get('username')
        password = data.get('password')

        try:
            account = Account.objects.get(username=username)
        except Account.DoesNotExist:
            raise serializers.ValidationError({"username": "Invalid credentials"})

        if not check_password(password, account.password):
            raise serializers.ValidationError({"password": "Invalid credentials"})

        if not account.is_active:
            raise serializers.ValidationError({"account": "Account is deactivated"})

        # Update last login
        account.last_login = timezone.now()
        account.save()

        data['account'] = account
        return data


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
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

    def validate_old_password(self, value):
        account = self.context['request'].user
        if not check_password(value, account.password):
            raise serializers.ValidationError("Old password is incorrect")
        return value


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
