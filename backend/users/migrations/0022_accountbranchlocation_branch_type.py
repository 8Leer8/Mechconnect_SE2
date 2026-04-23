from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0021_alter_address_formatted_address_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='accountbranchlocation',
            name='branch_type',
            field=models.CharField(blank=True, choices=[('mechanic', 'Mechanic'), ('shop_owner', 'Shop Owner')], max_length=20, null=True),
        ),
    ]