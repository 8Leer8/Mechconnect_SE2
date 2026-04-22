from django.db import models


class VehicleType(models.Model):
    """Vehicle type (e.g., Car, Motorcycle, Truck)"""
    name = models.CharField(max_length=50, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        verbose_name = 'Vehicle Type'
        verbose_name_plural = 'Vehicle Types'

    def __str__(self):
        return self.name


class VehicleBrand(models.Model):
    """Vehicle brand (e.g., Toyota, Honda) within a type"""
    type = models.ForeignKey(VehicleType, on_delete=models.CASCADE, related_name='brands')
    name = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        unique_together = [['type', 'name']]
        verbose_name = 'Vehicle Brand'
        verbose_name_plural = 'Vehicle Brands'

    def __str__(self):
        return f"{self.name} ({self.type.name})"


class VehicleModel(models.Model):
    """Vehicle model (e.g., Vios, Click) with optional subcategory"""
    brand = models.ForeignKey(VehicleBrand, on_delete=models.CASCADE, related_name='models')
    name = models.CharField(max_length=150)
    subcategory = models.CharField(max_length=100, null=True, blank=True,
                                    help_text="e.g., 'Scooter / AT' for motorcycles")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['subcategory', 'name']
        unique_together = [['brand', 'name', 'subcategory']]
        verbose_name = 'Vehicle Model'
        verbose_name_plural = 'Vehicle Models'

    def __str__(self):
        if self.subcategory:
            return f"{self.name} - {self.subcategory} ({self.brand.name})"
        return f"{self.name} ({self.brand.name})"
