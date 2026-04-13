from django.db import models


class PricingConfiguration(models.Model):
    # Token pricing
    base_token_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=1.00,
        help_text="Price per token in PHP"
    )
    min_token_purchase = models.IntegerField(
        default=1, help_text="Minimum tokens per purchase"
    )
    max_token_purchase = models.IntegerField(
        default=1000, help_text="Maximum tokens per purchase"
    )
    token_deduction_percentage = models.DecimalField(
        max_digits=5, decimal_places=2, default=2.00,
        help_text="Percentage of final job total deducted as required tokens"
    )
    token_packages = models.JSONField(
        default=list,
        blank=True,
        help_text="Optional explicit token packages, e.g. [{\"tokens\": 100, \"price\": 100}]",
    )

    # Distance pricing
    base_distance_fee = models.DecimalField(
        max_digits=10, decimal_places=2, default=50.00,
        help_text="Base fee in PHP"
    )
    price_per_km = models.DecimalField(
        max_digits=10, decimal_places=2, default=15.00,
        help_text="Price per km in PHP"
    )
    free_distance_km = models.DecimalField(
        max_digits=5, decimal_places=2, default=2.00,
        help_text="Free distance in km before charging"
    )

    # Traffic surcharge multipliers
    traffic_low_multiplier = models.DecimalField(
        max_digits=5, decimal_places=2, default=1.00,
        help_text="Multiplier for low traffic"
    )
    traffic_medium_multiplier = models.DecimalField(
        max_digits=5, decimal_places=2, default=1.25,
        help_text="Multiplier for medium traffic"
    )
    traffic_high_multiplier = models.DecimalField(
        max_digits=5, decimal_places=2, default=1.50,
        help_text="Multiplier for high traffic"
    )

    # Convenience fee
    convenience_fee_percentage = models.DecimalField(
        max_digits=5, decimal_places=2, default=5.00,
        help_text="Convenience fee percentage"
    )
    convenience_fee_fixed = models.DecimalField(
        max_digits=10, decimal_places=2, default=0.00,
        help_text="Fixed convenience fee in PHP"
    )

    # Job pricing
    min_job_price = models.DecimalField(
        max_digits=10, decimal_places=2, default=100.00,
        help_text="Minimum job price in PHP"
    )
    platform_commission_percentage = models.DecimalField(
        max_digits=5, decimal_places=2, default=10.00,
        help_text="Platform commission percentage"
    )

    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.CharField(max_length=100, blank=True)

    class Meta:
        verbose_name = "Pricing Configuration"

    def __str__(self):
        return f"Pricing Config (updated: {self.updated_at})"

    @classmethod
    def get_config(cls):
        config, _ = cls.objects.get_or_create(pk=1)
        return config
