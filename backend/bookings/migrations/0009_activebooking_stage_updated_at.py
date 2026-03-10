# Generated manually to avoid migration failures when DB already has the column
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("bookings", "0008_activebooking_stage"),
    ]

    operations = [
        migrations.RunSQL(
            sql=(
                "ALTER TABLE bookings_activebooking "
                "ADD COLUMN IF NOT EXISTS stage_updated_at timestamp with time zone NOT NULL DEFAULT now();"
            ),
            reverse_sql=(
                "ALTER TABLE bookings_activebooking DROP COLUMN IF EXISTS stage_updated_at;"
            ),
        ),
    ]
