from django.db import models


class Conversation(models.Model):
    title = models.CharField(max_length=255, null=True, blank=True)
    participants = models.ManyToManyField('users.Account', related_name='conversations')
    # optional link to a booking so each booking can have a dedicated conversation
    booking_id = models.IntegerField(null=True, blank=True, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        parts = ','.join([str(p.id) for p in self.participants.all()])
        return f"Conversation({self.id}): {parts}"


class Message(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey('users.Account', on_delete=models.SET_NULL, null=True, blank=True)
    content = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        sid = getattr(self.sender, 'id', None) if self.sender else 'system'
        return f"Message({self.id}) from {sid} in conv {self.conversation.id}"
