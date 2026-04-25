# Generated manually for backjob quotation split (old receipt vs new lines).

from django.db import migrations, models


LIVE_BACKJOB_STATUSES = {
    'backjob_pending',
    'reworked',
    'accepted',
    'on_the_way',
    'at_location',
    'diagnosing',
    'active',
    'paused',
    'finished',
    'pending_payment',
}


def flag_pending_backjob_lines(apps, schema_editor):
    QuotationItem = apps.get_model('bookings', 'QuotationItem')
    for item in QuotationItem.objects.filter(status='pending').select_related('quotation__booking'):
        booking = item.quotation.booking
        try:
            backjob = booking.backjob
        except Exception:
            continue
        bj_status = str(getattr(backjob, 'status', '') or '').lower()
        if bj_status in LIVE_BACKJOB_STATUSES:
            item.is_backjob_line = True
            item.save(update_fields=['is_backjob_line'])


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0041_alter_backjob_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='quotationitem',
            name='is_backjob_line',
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(flag_pending_backjob_lines, migrations.RunPython.noop),
    ]
