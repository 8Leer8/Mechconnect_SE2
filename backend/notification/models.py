from django.db import models
from users.models import Account

class Notification(models.Model):
    TYPE_CHOICES = [('info', 'Info'), ('warning', 'Warning'), ('alert', 'Alert'), ('promotional', 'Promotional')]
    
    receiver = models.ForeignKey(Account, on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    message = models.TextField()
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)