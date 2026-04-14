from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0009_mechanic_rejection_note_mechanic_verification_status_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='PasswordChangeVerification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('verification_token', models.CharField(max_length=255, unique=True)),
                ('new_password_hash', models.CharField(max_length=255)),
                ('device_name', models.CharField(blank=True, max_length=255, null=True)),
                ('near_location', models.CharField(blank=True, max_length=255, null=True)),
                ('status', models.CharField(choices=[('pending', 'pending'), ('used', 'used'), ('expired', 'expired')], default='pending', max_length=20)),
                ('requested_at', models.DateTimeField(auto_now_add=True)),
                ('verified_at', models.DateTimeField(blank=True, null=True)),
                ('expires_at', models.DateTimeField()),
                ('account', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='password_change_requests', to='users.account')),
            ],
            options={
                'ordering': ['-requested_at'],
                'indexes': [models.Index(fields=['account', 'status'], name='users_passw_account_7962f7_idx'), models.Index(fields=['verification_token', 'status'], name='users_passw_verific_0c0c83_idx')],
            },
        ),
    ]
