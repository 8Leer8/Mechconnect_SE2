# Generated migration for pricing model refactoring
# This migration:
# 1. Renames Service.price to Service.min_price
# 2. Adds mechanic-specific pricing to MechanicService
# 3. Adds validation and indexes

from django.db import migrations, models
import django.db.models.deletion


def set_default_mechanic_prices(apps, schema_editor):
    """
    Data migration: Set default price for existing MechanicService records.
    Uses the service's min_price (formerly 'price') as the initial mechanic price.
    """
    MechanicService = apps.get_model('services', 'MechanicService')
    Service = apps.get_model('services', 'Service')
    
    # Update each MechanicService with the service's min_price
    for ms in MechanicService.objects.select_related('service').all():
        ms.price = ms.service.min_price
        ms.save(update_fields=['price'])


def reverse_default_mechanic_prices(apps, schema_editor):
    """
    Reverse migration: Clear mechanic-specific prices.
    """
    MechanicService = apps.get_model('services', 'MechanicService')
    MechanicService.objects.all().update(price=0)


class Migration(migrations.Migration):

    dependencies = [
        ('services', '0002_initial'),
    ]

    operations = [
        # Step 1: Rename Service.price to Service.min_price
        migrations.RenameField(
            model_name='service',
            old_name='price',
            new_name='min_price',
        ),
        
        # Step 2: Update help_text for min_price
        migrations.AlterField(
            model_name='service',
            name='min_price',
            field=models.DecimalField(
                decimal_places=2,
                default=0,
                help_text='Minimum price set by admin. Mechanics must price at or above this.',
                max_digits=10
            ),
        ),
        
        # Step 3: Add price field to MechanicService (nullable first)
        migrations.AddField(
            model_name='mechanicservice',
            name='price',
            field=models.DecimalField(
                decimal_places=2,
                help_text="Mechanic's price for this service. Must be >= service.min_price",
                max_digits=10,
                null=True,  # Temporarily nullable for data migration
                blank=True
            ),
        ),
        
        # Step 4: Add timestamp fields to MechanicService
        migrations.AddField(
            model_name='mechanicservice',
            name='created_at',
            field=models.DateTimeField(auto_now_add=True, null=True),
        ),
        migrations.AddField(
            model_name='mechanicservice',
            name='updated_at',
            field=models.DateTimeField(auto_now=True, null=True),
        ),
        
        # Step 5: Run data migration to populate mechanic prices
        migrations.RunPython(
            set_default_mechanic_prices,
            reverse_default_mechanic_prices
        ),
        
        # Step 6: Make price field required (not null)
        migrations.AlterField(
            model_name='mechanicservice',
            name='price',
            field=models.DecimalField(
                decimal_places=2,
                help_text="Mechanic's price for this service. Must be >= service.min_price",
                max_digits=10,
            ),
        ),
        
        # Step 7: Add unique constraint
        migrations.AlterUniqueTogether(
            name='mechanicservice',
            unique_together={('mechanic', 'service')},
        ),
        
        # Step 8: Add related_name to foreign keys
        migrations.AlterField(
            model_name='mechanicservice',
            name='mechanic',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='mechanic_services',
                to='users.mechanic'
            ),
        ),
        migrations.AlterField(
            model_name='mechanicservice',
            name='service',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='mechanic_services',
                to='services.service'
            ),
        ),
        
        # Step 9: Add indexes for performance
        migrations.AddIndex(
            model_name='mechanicservice',
            index=models.Index(fields=['mechanic', 'service'], name='services_me_mechani_idx'),
        ),
        migrations.AddIndex(
            model_name='mechanicservice',
            index=models.Index(fields=['service'], name='services_me_service_idx'),
        ),
    ]
