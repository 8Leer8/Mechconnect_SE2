from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0032_remove_disputebooking_refund_account_name'),
    ]

    operations = [
        migrations.AddField(
            model_name='disputebooking',
            name='mechanic_defense_description',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='disputebooking',
            name='mechanic_defense_picture',
            field=models.ImageField(blank=True, null=True, upload_to='bookings/disputes/defense/'),
        ),
        migrations.AlterField(
            model_name='disputebooking',
            name='status',
            field=models.CharField(
                choices=[
                    ('active', 'Active'),
                    ('under_admin_review', 'Under Admin Review'),
                    ('waiting_for_mechanic_payment', 'Waiting For Mechanic Payment'),
                    ('waiting_for_client_verification', 'Waiting For Client Verification'),
                    ('resolved_refunded', 'Resolved Refunded'),
                    ('resolved_dismissed', 'Resolved Dismissed'),
                    ('resolved_voucher', 'Resolved Voucher'),
                ],
                default='active',
                max_length=50,
            ),
        ),
    ]
