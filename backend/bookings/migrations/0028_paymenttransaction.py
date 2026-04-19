from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("bookings", "0027_booking_payment_status_paymentinstallment"),
    ]

    operations = [
        migrations.CreateModel(
            name="PaymentTransaction",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("amount", models.DecimalField(decimal_places=2, max_digits=10)),
                (
                    "method",
                    models.CharField(
                        choices=[("qr", "Qr"), ("gcash", "Gcash"), ("maya", "Maya")],
                        max_length=20,
                    ),
                ),
                ("reference", models.CharField(blank=True, db_index=True, max_length=255, null=True)),
                (
                    "status",
                    models.CharField(
                        choices=[("success", "Success"), ("failed", "Failed")],
                        default="success",
                        max_length=20,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "booking",
                    models.ForeignKey(on_delete=models.deletion.CASCADE, related_name="payment_transactions", to="bookings.booking"),
                ),
                (
                    "installment",
                    models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, related_name="transactions", to="bookings.paymentinstallment"),
                ),
            ],
            options={
                "ordering": ["-created_at", "-id"],
            },
        ),
    ]
