import django.utils.timezone
from django.db import migrations, models


def backfill_item_timestamps(apps, schema_editor):
    """Give existing rows sensible times from their parent quotation (best-effort)."""
    QuotationItem = apps.get_model('bookings', 'QuotationItem')
    for item in QuotationItem.objects.select_related('quotation'):
        q = item.quotation
        qc = getattr(q, 'created_at', None) or django.utils.timezone.now()
        qu = getattr(q, 'updated_at', None) or qc
        item.created_at = qc
        item.updated_at = qu
        item.save(update_fields=['created_at', 'updated_at'])


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0042_quotationitem_is_backjob_line'),
    ]

    operations = [
        migrations.AddField(
            model_name='quotationitem',
            name='created_at',
            field=models.DateTimeField(default=django.utils.timezone.now, editable=False),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='quotationitem',
            name='updated_at',
            field=models.DateTimeField(default=django.utils.timezone.now, editable=False),
            preserve_default=False,
        ),
        migrations.RunPython(backfill_item_timestamps, migrations.RunPython.noop),
    ]
