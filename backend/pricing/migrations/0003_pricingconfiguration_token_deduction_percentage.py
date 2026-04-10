from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pricing', '0002_pricingconfiguration_token_packages'),
    ]

    operations = [
        migrations.AddField(
            model_name='pricingconfiguration',
            name='token_deduction_percentage',
            field=models.DecimalField(
                decimal_places=2,
                default=2.0,
                help_text='Percentage of final job total deducted as required tokens',
                max_digits=5,
            ),
        ),
    ]
