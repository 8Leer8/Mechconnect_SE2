from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0010_passwordchangeverification'),
    ]

    operations = [
        migrations.DeleteModel(
            name='PasswordChangeVerification',
        ),
    ]
