from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("bookings", "0044_backjob_stack_per_booking"),
    ]

    operations = [
        migrations.CreateModel(
            name="QuotationAmendment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(choices=[("pending", "Pending"), ("accepted", "Accepted"), ("rejected", "Rejected")], default="pending", max_length=20)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("mechanic", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="users.account")),
                ("quotation", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="amendments", to="bookings.quotation")),
            ],
        ),
        migrations.CreateModel(
            name="AmendmentItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("item_id", models.UUIDField(blank=True, null=True)),
                ("action_type", models.CharField(choices=[("added", "Added"), ("edited", "Edited"), ("removed", "Removed")], max_length=20)),
                ("proposed_changes", models.JSONField(blank=True, default=dict)),
                ("original_snapshot", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("amendment", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="items", to="bookings.quotationamendment")),
                ("original_item", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="amendment_items", to="bookings.quotationitem")),
            ],
        ),
    ]
