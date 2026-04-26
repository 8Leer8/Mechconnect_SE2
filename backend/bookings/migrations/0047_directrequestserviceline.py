from django.db import migrations, models
import django.db.models.deletion


def backfill_direct_request_lines(apps, schema_editor):
    DirectRequest = apps.get_model("bookings", "DirectRequest")
    DirectRequestServiceLine = apps.get_model("bookings", "DirectRequestServiceLine")
    for dr in DirectRequest.objects.select_related("request", "service").iterator():
        if not dr.service_id:
            continue
        exists = DirectRequestServiceLine.objects.filter(request_id=dr.request_id).exists()
        if exists:
            continue
        DirectRequestServiceLine.objects.create(
            request_id=dr.request_id,
            service_id=dr.service_id,
            sort_order=0,
        )


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("bookings", "0046_cashremittance"),
    ]

    operations = [
        migrations.CreateModel(
            name="DirectRequestServiceLine",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("sort_order", models.PositiveSmallIntegerField(default=0)),
                (
                    "request",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="direct_request_service_lines",
                        to="bookings.request",
                    ),
                ),
                (
                    "service",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="services.service"),
                ),
            ],
            options={
                "ordering": ["sort_order", "id"],
            },
        ),
        migrations.RunPython(backfill_direct_request_lines, noop_reverse),
    ]
