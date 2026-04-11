from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0024_quotationitem_status_alter_quotation_status'),
        ('bookings', '0023_request_vehicle_fields_and_broadcast_radius'),
    ]

    operations = [
        migrations.AddField(
            model_name='quotationitem',
            name='change_type',
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='quotationitem',
            name='previous_description',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='quotationitem',
            name='previous_quantity',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='quotationitem',
            name='previous_unit_price',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
    ]
