from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("bookings", "0040_backjob_pending_and_quotation_backjob_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="backjob",
            name="status",
            field=models.CharField(
                choices=[
                    ("accepted", "Accepted"),
                    ("on_the_way", "On The Way"),
                    ("at_location", "At Location"),
                    ("diagnosing", "Diagnosing"),
                    ("active", "Active"),
                    ("paused", "Paused"),
                    ("finished", "Finished"),
                    ("pending_payment", "Pending Payment"),
                    ("completed", "Completed"),
                    ("backjob_pending", "Backjob Pending"),
                    ("reworked", "Reworked"),
                    ("cancelled", "Cancelled"),
                    ("disputed", "Disputed"),
                ],
                default="accepted",
                max_length=30,
            ),
        ),
    ]
