from django.contrib import admin
from .models import EmailVerification

# Register your models here.

@admin.register(EmailVerification)
class EmailVerificationAdmin(admin.ModelAdmin):
    list_display = ('email', 'verification_code', 'status', 'created_at', 'expires_at', 'verified_at')
    list_filter = ('status', 'created_at')
    search_fields = ('email', 'verification_code')
    readonly_fields = ('created_at', 'verified_at')
    ordering = ('-created_at',)
