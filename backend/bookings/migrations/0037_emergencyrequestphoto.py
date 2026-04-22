from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("bookings", "0036_request_vehicle_description"),
    ]

    operations = [
        migrations.CreateModel(
            name="EmergencyRequestPhoto",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("photo", models.ImageField(upload_to="requests/emergency/multiple/")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("emergency_request", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="photos", to="bookings.emergencyrequest")),
            ],
        ),
    ]
