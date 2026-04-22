from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0016_favorites'),
    ]

    operations = [
        migrations.AddField(
            model_name='account',
            name='deactivated_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]