from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("bookings", "0035_activebookingphoto"),
    ]

    operations = [
        migrations.AddField(
            model_name="request",
            name="vehicle_description",
            field=models.TextField(blank=True, null=True),
        ),
    ]
