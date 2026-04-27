from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0045_quotationamendment_amendmentitem'),
    ]

    operations = [
        migrations.CreateModel(
            name='CashRemittance',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount', models.DecimalField(decimal_places=2, max_digits=10)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('received', 'Received')], default='pending', max_length=20)),
                ('reminders_count', models.PositiveIntegerField(default=0)),
                ('last_reminded_at', models.DateTimeField(blank=True, null=True)),
                ('received_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('booking', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='cash_remittance', to='bookings.booking')),
                ('lead_mechanic', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='cash_remittances_to_surrender', to='users.account')),
                ('shop', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='cash_remittances', to='shops.shop')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
