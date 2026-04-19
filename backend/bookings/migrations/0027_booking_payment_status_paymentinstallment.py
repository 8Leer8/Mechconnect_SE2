from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("bookings", "0026_receipt_ewallet_source_id_receipt_ewallet_type_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="booking",
            name="payment_status",
            field=models.CharField(
                choices=[
                    ("unpaid", "Unpaid"),
                    ("partially_paid", "Partially Paid"),
                    ("fully_paid", "Fully Paid"),
                ],
                default="unpaid",
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name="PaymentInstallment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "installment_type",
                    models.CharField(
                        choices=[
                            ("initial", "Initial"),
                            ("final", "Final"),
                            ("full", "Full"),
                        ],
                        max_length=20,
                    ),
                ),
                ("amount", models.DecimalField(decimal_places=2, max_digits=10)),
                (
                    "status",
                    models.CharField(
                        choices=[("pending", "Pending"), ("paid", "Paid")],
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("is_released", models.BooleanField(default=False)),
                ("paid_at", models.DateTimeField(blank=True, null=True)),
                ("external_reference", models.CharField(blank=True, max_length=255, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "booking",
                    models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="payment_installments", to="bookings.booking"),
                ),
            ],
            options={
                "ordering": ["created_at", "id"],
                "unique_together": {("booking", "installment_type")},
            },
        ),
    ]
