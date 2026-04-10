from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pricing', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='pricingconfiguration',
            name='token_packages',
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='Optional explicit token packages, e.g. [{"tokens": 100, "price": 100}]',
            ),
        ),
    ]
