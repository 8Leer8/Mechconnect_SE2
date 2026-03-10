from django.contrib import admin
from .models import RequestAssignment

@admin.register(RequestAssignment)
class RequestAssignmentAdmin(admin.ModelAdmin):
    list_display = ['id', 'request', 'mechanic', 'role', 'assigned_at']
    list_filter = ['role']
