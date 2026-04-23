from django.db import migrations, models


def set_line_kind_from_legacy(apps, schema_editor):
    QuotationItem = apps.get_model('bookings', 'QuotationItem')
    for row in QuotationItem.objects.all().iterator():
        if getattr(row, 'service_id', None):
            row.line_kind = 'service'
            row.source = None
            row.save(update_fields=['line_kind', 'source'])
        elif not row.source:
            row.source = 'on_hand'
            row.save(update_fields=['source'])


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0037_emergencyrequestphoto'),
    ]

    operations = [
        migrations.AddField(
            model_name='quotationitem',
            name='line_kind',
            field=models.CharField(
                choices=[('service', 'Service'), ('item', 'Item')],
                default='item',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='quotationitem',
            name='source',
            field=models.CharField(
                blank=True,
                choices=[
                    ('on_hand', 'On-hand (mechanic stock)'),
                    ('to_be_purchased', 'To be purchased'),
                    ('mechanic_selling', 'Mechanic selling / owned spare'),
                ],
                max_length=30,
                null=True,
            ),
        ),
        migrations.RunPython(set_line_kind_from_legacy, migrations.RunPython.noop),
    ]
