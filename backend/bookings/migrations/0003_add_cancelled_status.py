from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0002_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='customrequest',
            name='request_status',
            field=models.CharField(
                choices=[('pending', 'Pending'), ('quoted', 'Quoted'), ('rejected', 'Rejected'), ('cancelled', 'Cancelled')],
                default='pending',
                max_length=20
            ),
        ),
        migrations.AlterField(
            model_name='directrequest',
            name='request_status',
            field=models.CharField(
                choices=[('pending', 'Pending'), ('accepted', 'Accepted'), ('rejected', 'Rejected'), ('cancelled', 'Cancelled')],
                default='pending',
                max_length=20
            ),
        ),
    ]
