from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("bookings", "0038_quotationitem_line_kind_and_source"),
    ]

    operations = [
        migrations.AddField(
            model_name="quotationitem",
            name="purchase_receipt_image",
            field=models.ImageField(blank=True, null=True, upload_to="bookings/quotation/receipts/"),
        ),
        migrations.AddField(
            model_name="quotationitem",
            name="receipt_submitted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
