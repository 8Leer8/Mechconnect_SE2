from django.db import models
from users.models import Account

class Notification(models.Model):
    receiver = models.ForeignKey(Account, on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
