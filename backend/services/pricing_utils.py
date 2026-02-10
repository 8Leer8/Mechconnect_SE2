from decimal import Decimal
from django.db.models import Avg, Count, Q, F
from django.db.models.functions import Coalesce
from .models import Service, MechanicService
from django.db.models import FloatField
from django.db.models.aggregates import Aggregate

def get_service_price_stats(service_id=None, service=None):
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
    result = MechanicService.objects.filter(
        service_id=service_id
    ).aggregate(average=Avg('price'))
    return result['average']


def get_service_median_price(service_id):
    stats = get_service_price_stats(service_id=service_id)
    return stats['median'] if stats else None


def get_all_services_with_pricing():
    return Service.objects.annotate(
        average_price=Coalesce(
            Avg('mechanic_services__price'),
            F('minimum_price')  # Fallback to minimum_price if no mechanics offer it
        ),
        mechanic_count=Count('mechanic_services')
    ).select_related('category')


def get_mechanic_price_for_service(mechanic_id, service_id):
    try:
        ms = MechanicService.objects.get(
            mechanic_id=mechanic_id,
            service_id=service_id
        )
        return ms.price
    except MechanicService.DoesNotExist:
        return None


def get_price_range_for_service(service_id):
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
