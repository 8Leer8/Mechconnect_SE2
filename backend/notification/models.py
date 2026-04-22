from django.db import models
from users.models import Account

class Notification(models.Model):
    receiver = models.ForeignKey(Account, on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    message = models.TextField()
    payload = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.title} -> {self.receiver_id}"
