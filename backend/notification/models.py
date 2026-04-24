from django.db import models
from django.utils import timezone

from users.models import Account

class Notification(models.Model):
    receiver = models.ForeignKey(Account, on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    message = models.TextField()
    payload = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(default=timezone.now)
    correlation_key = models.CharField(max_length=190, null=True, blank=True, db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['receiver', 'correlation_key'],
                condition=models.Q(correlation_key__isnull=False),
                name='notification_receiver_correlation_uniq',
            ),
        ]

    def __str__(self):
        return f"{self.title} -> {self.receiver_id}"
