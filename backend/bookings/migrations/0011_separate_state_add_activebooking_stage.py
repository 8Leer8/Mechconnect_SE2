from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0010_activebooking_stage_activebooking_stage_updated_at'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.AddField(
                    model_name='activebooking',
                    name='stage',
                    field=models.CharField(default='', max_length=50),
                ),
                migrations.AddField(
                    model_name='activebooking',
                    name='stage_updated_at',
                    field=models.DateTimeField(default=django.utils.timezone.now),
                ),
            ],
        ),
    ]
