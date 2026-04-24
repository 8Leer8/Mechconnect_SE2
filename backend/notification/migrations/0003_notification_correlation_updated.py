# Generated manually for notification deduplication + role-badged titles

import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('notification', '0002_notification_read_state'),
    ]

    operations = [
        migrations.AddField(
            model_name='notification',
            name='updated_at',
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
        migrations.AddField(
            model_name='notification',
            name='correlation_key',
            field=models.CharField(blank=True, db_index=True, max_length=190, null=True),
        ),
        migrations.AddConstraint(
            model_name='notification',
            constraint=models.UniqueConstraint(
                condition=models.Q(correlation_key__isnull=False),
                fields=('receiver', 'correlation_key'),
                name='notification_receiver_correlation_uniq',
            ),
        ),
    ]
