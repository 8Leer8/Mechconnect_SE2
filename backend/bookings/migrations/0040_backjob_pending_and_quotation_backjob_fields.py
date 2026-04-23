from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("bookings", "0039_quotationitem_purchase_receipt_image_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="booking",
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
                default="active",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="quotation",
            name="backjob_discount",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name="quotation",
            name="final_labor_total",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name="quotation",
            name="is_backjob",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="quotation",
            name="original_labor_cost",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
    ]
