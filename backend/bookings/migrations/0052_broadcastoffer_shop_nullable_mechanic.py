# Generated manually for shop broadcast offers (client must still pick a winner).

import django.db.models.deletion
from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):

    dependencies = [
        ('bookings', '0051_alter_paymentinstallment_installment_type_and_more'),
        ('shops', '0002_shopmechanic_is_active'),
    ]

    operations = [
        migrations.AlterUniqueTogether(
            name='broadcastoffer',
            unique_together=set(),
        ),
        migrations.AddField(
            model_name='broadcastoffer',
            name='shop',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='broadcast_shop_offers',
                to='shops.shop',
            ),
        ),
        migrations.AlterField(
            model_name='broadcastoffer',
            name='mechanic',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='broadcast_offers',
                to='users.mechanic',
            ),
        ),
        migrations.AddConstraint(
            model_name='broadcastoffer',
            constraint=models.UniqueConstraint(
                condition=Q(mechanic__isnull=False),
                fields=('broadcast_request', 'mechanic'),
                name='uniq_broadcastoffer_broadcast_mechanic',
            ),
        ),
        migrations.AddConstraint(
            model_name='broadcastoffer',
            constraint=models.UniqueConstraint(
                condition=Q(shop__isnull=False),
                fields=('broadcast_request', 'shop'),
                name='uniq_broadcastoffer_broadcast_shop',
            ),
        ),
        migrations.AddConstraint(
            model_name='broadcastoffer',
            constraint=models.CheckConstraint(
                condition=Q(mechanic__isnull=False, shop__isnull=True)
                | Q(mechanic__isnull=True, shop__isnull=False),
                name='broadcastoffer_mechanic_xor_shop',
            ),
        ),
    ]
