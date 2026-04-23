from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0020_accountaddress_branch_fields_and_accountbranchlocation'),
    ]

    operations = [
        migrations.AlterField(
            model_name='accountaddress',
            name='formatted_address',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='accountbranchlocation',
            name='formatted_address',
            field=models.TextField(blank=True, null=True),
        ),
    ]