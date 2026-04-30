from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("bookings", "0055_merge_quotation_item_source_mechanic_selling"),
    ]

    operations = [
        migrations.AlterField(
            model_name="quotationitem",
            name="source",
            field=models.CharField(
                blank=True,
                choices=[
                    ("on_hand", "Mechanic supplied (from stock)"),
                    ("shop_supplied", "Shop supplied (from stock)"),
                    ("to_be_purchased", "To be purchased"),
                    ("already_purchased", "Already purchased (have receipt)"),
                ],
                max_length=30,
                null=True,
            ),
        ),
    ]
