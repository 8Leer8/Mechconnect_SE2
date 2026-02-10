"""
Pricing utilities for computing marketplace statistics.

This module provides functions to compute average and median pricing
for services based on mechanic-specific pricing. These values are computed
dynamically and should NOT be stored in the database.

Usage in views/serializers:
    from services.pricing_utils import get_service_price_stats
    
    stats = get_service_price_stats(service_id=1)
    # Returns: {'average': Decimal('150.00'), 'median': Decimal('145.00'), 'count': 10}
"""

from decimal import Decimal
from django.db.models import Avg, Count, Q, F
from django.db.models.functions import Coalesce
from .models import Service, MechanicService


def get_service_price_stats(service_id=None, service=None):
    """
    Compute price statistics for a service based on mechanic pricing.
    
    Args:
        service_id: ID of the service (optional if service object provided)
        service: Service object (optional if service_id provided)
    
    Returns:
        dict with keys:
            - average: Average price across all mechanics offering this service
            - median: Median price (approximated for PostgreSQL)
            - min_mechanic_price: Lowest mechanic price
            - max_mechanic_price: Highest mechanic price
            - count: Number of mechanics offering this service
            - minimum_price: Service minimum price (admin-set, informational)
        
        Returns None if service not found or has no mechanic offerings.
    
    Example:
        >>> stats = get_service_price_stats(service_id=1)
        >>> print(f"Average: ${stats['average']}, Median: ${stats['median']}")
    """
    # Get service object if not provided
    if service is None:
        try:
            service = Service.objects.get(pk=service_id)
        except Service.DoesNotExist:
            return None
    
    # Get all mechanic prices for this service
    mechanic_prices = MechanicService.objects.filter(
        service=service
    ).values_list('price', flat=True)
    
    if not mechanic_prices:
        return None
    
    # Convert to list for median calculation
    prices_list = sorted(list(mechanic_prices))
    count = len(prices_list)
    
    # Compute average using Django aggregation
    avg_data = MechanicService.objects.filter(
        service=service
    ).aggregate(
        average=Avg('price'),
        count=Count('id')
    )
    
    # Compute median (middle value or average of two middle values)
    if count % 2 == 1:
        median = prices_list[count // 2]
    else:
        mid1 = prices_list[count // 2 - 1]
        mid2 = prices_list[count // 2]
        median = (mid1 + mid2) / 2
    
    return {
        'average': avg_data['average'],
        'median': Decimal(str(median)),
        'min_mechanic_price': prices_list[0],
        'max_mechanic_price': prices_list[-1],
        'count': count,
        'minimum_price': service.minimum_price,
    }


def get_service_average_price(service_id):
    """
    Quick helper to get just the average price for a service.
    
    Args:
        service_id: ID of the service
    
    Returns:
        Decimal representing average price, or None if no mechanics offer it
    
    Example:
        >>> avg = get_service_average_price(1)
        >>> print(f"Average price: ${avg}")
    """
    result = MechanicService.objects.filter(
        service_id=service_id
    ).aggregate(average=Avg('price'))
    return result['average']


def get_service_median_price(service_id):
    """
    Quick helper to get just the median price for a service.
    
    Args:
        service_id: ID of the service
    
    Returns:
        Decimal representing median price, or None if no mechanics offer it
    
    Example:
        >>> median = get_service_median_price(1)
        >>> print(f"Median price: ${median}")
    """
    stats = get_service_price_stats(service_id=service_id)
    return stats['median'] if stats else None


def get_all_services_with_pricing():
    """
    Get all services annotated with average pricing from mechanics.
    
    This uses Django's aggregation to efficiently compute averages
    without fetching all individual prices.
    
    Returns:
        QuerySet of Service objects with additional 'average_price' annotation
    
    Example:
        >>> services = get_all_services_with_pricing()
        >>> for service in services:
        >>>     print(f"{service.name}: ${service.average_price} (min: ${service.minimum_price})")
    """
    return Service.objects.annotate(
        average_price=Coalesce(
            Avg('mechanic_services__price'),
            F('minimum_price')  # Fallback to minimum_price if no mechanics offer it
        ),
        mechanic_count=Count('mechanic_services')
    ).select_related('category')


def get_mechanic_price_for_service(mechanic_id, service_id):
    """
    Get a specific mechanic's price for a service.
    
    Args:
        mechanic_id: ID of the mechanic
        service_id: ID of the service
    
    Returns:
        Decimal price or None if mechanic doesn't offer the service
    
    Example:
        >>> price = get_mechanic_price_for_service(mechanic_id=5, service_id=1)
        >>> print(f"Mechanic's price: ${price}")
    """
    try:
        ms = MechanicService.objects.get(
            mechanic_id=mechanic_id,
            service_id=service_id
        )
        return ms.price
    except MechanicService.DoesNotExist:
        return None


def get_price_range_for_service(service_id):
    """
    Get the price range (min to max) across all mechanics for a service.
    
    Args:
        service_id: ID of the service
    
    Returns:
        dict with 'min' and 'max' keys, or None if no mechanics offer it
    
    Example:
        >>> range_data = get_price_range_for_service(1)
        >>> print(f"Price range: ${range_data['min']} - ${range_data['max']}")
    """
    prices = MechanicService.objects.filter(
        service_id=service_id
    ).values_list('price', flat=True)
    
    if not prices:
        return None
    
    prices_list = list(prices)
    return {
        'min': min(prices_list),
        'max': max(prices_list),
    }


# PostgreSQL-specific function for exact median using percentile_cont
def get_service_median_price_postgres(service_id):
    """
    Compute exact median using PostgreSQL's percentile_cont function.
    
    This is more accurate than the standard median calculation but
    requires PostgreSQL. Use get_service_median_price() for database-agnostic code.
    
    Args:
        service_id: ID of the service
    
    Returns:
        Decimal representing exact median price, or None if no mechanics offer it
    
    Example:
        >>> median = get_service_median_price_postgres(1)
    """
    from django.db.models import FloatField
    from django.db.models.aggregates import Aggregate
    
    class Percentile(Aggregate):
        function = 'PERCENTILE_CONT'
        name = 'percentile'
        output_field = FloatField()
        template = '%(function)s(%(percentile)s) WITHIN GROUP (ORDER BY %(expressions)s)'
    
    result = MechanicService.objects.filter(
        service_id=service_id
    ).aggregate(
        median=Percentile('price', percentile=0.5)
    )
    
    return Decimal(str(result['median'])) if result['median'] is not None else None
