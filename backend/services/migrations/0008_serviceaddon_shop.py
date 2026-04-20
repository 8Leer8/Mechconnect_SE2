from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('shops', '0001_initial'),
        ('services', '0007_mechanicspecialty_proof_document_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='serviceaddon',
            name='shop',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='service_add_ons', to='shops.shop'),
        ),
    ]
