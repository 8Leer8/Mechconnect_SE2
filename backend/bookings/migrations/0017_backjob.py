from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = False

    dependencies = [
        ("bookings", "0016_request_shop"),
    ]

    operations = [
        migrations.CreateModel(
            name="Backjob",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(default="accepted", max_length=30)),
                ("reason", models.TextField(blank=True, null=True)),
                ("images", models.JSONField(default=list, blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "booking",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="backjob",
                        to="bookings.booking",
                    ),
                ),
                (
                    "requested_by",
                    models.ForeignKey(
                        related_name="requested_backjobs",
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        to="users.account",
                        blank=True,
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
