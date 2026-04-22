from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("bookings", "0034_booking_at_location_diagnosing_status"),
    ]

    operations = [
        migrations.CreateModel(
            name="ActiveBookingPhoto",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("photo", models.ImageField(upload_to="bookings/progress/")),
                ("photo_type", models.CharField(choices=[("before", "Before"), ("after", "After")], max_length=20)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "active_booking",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="photos",
                        to="bookings.activebooking",
                    ),
                ),
            ],
        ),
    ]
