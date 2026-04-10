from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0022_booking_traffic_surcharge_alter_booking_distance_km_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='request',
            name='vehicle_brand',
            field=models.CharField(blank=True, max_length=80, null=True),
        ),
        migrations.AddField(
            model_name='request',
            name='vehicle_model',
            field=models.CharField(blank=True, max_length=120, null=True),
        ),
        migrations.AddField(
            model_name='request',
            name='vehicle_type',
            field=models.CharField(blank=True, max_length=80, null=True),
        ),
        migrations.AddField(
            model_name='broadcastrequest',
            name='search_radius_km',
            field=models.PositiveIntegerField(default=5),
        ),
    ]
