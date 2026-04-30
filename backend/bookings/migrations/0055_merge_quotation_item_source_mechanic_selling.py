from django.db import migrations, models


def _fix_source_in_dict(d, changed):
    if not isinstance(d, dict):
        return
    for k, v in list(d.items()):
        if k == "source" and v == "mechanic_selling":
            d[k] = "on_hand"
            changed[0] = True
        elif isinstance(v, dict):
            _fix_source_in_dict(v, changed)
        elif isinstance(v, list):
            for item in v:
                if isinstance(item, dict):
                    _fix_source_in_dict(item, changed)


def merge_mechanic_selling_into_on_hand(apps, schema_editor):
    QuotationItem = apps.get_model("bookings", "QuotationItem")
    QuotationItem.objects.filter(source="mechanic_selling").update(source="on_hand")

    AmendmentItem = apps.get_model("bookings", "AmendmentItem")
    for row in AmendmentItem.objects.iterator():
        changed = [False]
        pc = row.proposed_changes
        if isinstance(pc, dict):
            _fix_source_in_dict(pc, changed)
        osnap = row.original_snapshot
        if isinstance(osnap, dict):
            _fix_source_in_dict(osnap, changed)
        if changed[0]:
            row.save(update_fields=["proposed_changes", "original_snapshot"])


class Migration(migrations.Migration):

    dependencies = [
        ("bookings", "0054_quotationitem_source_already_purchased"),
    ]

    operations = [
        migrations.RunPython(merge_mechanic_selling_into_on_hand, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="quotationitem",
            name="source",
            field=models.CharField(
                blank=True,
                choices=[
                    ("on_hand", "Mechanic supplied (from stock)"),
                    ("to_be_purchased", "To be purchased"),
                    ("already_purchased", "Already purchased (have receipt)"),
                ],
                max_length=30,
                null=True,
            ),
        ),
    ]
