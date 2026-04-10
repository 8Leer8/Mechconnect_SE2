from decimal import Decimal
import math
from django.db.models import Avg, Count, Q, F
from django.db.models.functions import Coalesce
from .models import Service, MechanicService
from django.db.models import FloatField
from django.db.models.aggregates import Aggregate
from pricing.models import PricingConfiguration


def _normalize_token_packages(raw_packages):
    if not isinstance(raw_packages, list):
        return []

    normalized = []
    seen_tokens = set()

    for package in raw_packages:
        if not isinstance(package, dict):
            continue

        try:
            tokens = int(package.get('tokens'))
            price = round(float(package.get('price')), 2)
        except (TypeError, ValueError):
            continue

        if tokens <= 0 or price < 0:
            continue

        if tokens in seen_tokens:
            continue

        normalized.append({'tokens': tokens, 'price': price})
        seen_tokens.add(tokens)

    normalized.sort(key=lambda item: item['tokens'])
    return normalized


def get_distance_fee(distance_km):
    config = PricingConfiguration.get_config()
    if distance_km is None:
        return 0.0
    if float(distance_km) <= float(config.free_distance_km):
        return 0.0
    billable_km = float(distance_km) - float(config.free_distance_km)
    return float(config.base_distance_fee) + (billable_km * float(config.price_per_km))


def get_traffic_multiplier(traffic_level):
    config = PricingConfiguration.get_config()
    multipliers = {
        'low': float(config.traffic_low_multiplier),
        'light': float(config.traffic_low_multiplier),
        'medium': float(config.traffic_medium_multiplier),
        'moderate': float(config.traffic_medium_multiplier),
        'high': float(config.traffic_high_multiplier),
        'heavy': float(config.traffic_high_multiplier),
        'severe': float(config.traffic_high_multiplier),
    }
    return multipliers.get((traffic_level or '').lower(), float(config.traffic_low_multiplier))


def get_traffic_surcharge(base_price, traffic_level):
    multiplier = get_traffic_multiplier(traffic_level)
    surcharge = float(base_price) * (multiplier - 1.0)
    return round(surcharge, 2)


def get_convenience_fee(job_price):
    config = PricingConfiguration.get_config()
    percentage_fee = float(job_price) * (float(config.convenience_fee_percentage) / 100)
    fixed_fee = float(config.convenience_fee_fixed)
    return round(percentage_fee + fixed_fee, 2)


def get_platform_commission(job_price):
    config = PricingConfiguration.get_config()
    return round(float(job_price) * (float(config.platform_commission_percentage) / 100), 2)


def get_min_job_price():
    config = PricingConfiguration.get_config()
    return float(config.min_job_price)


def apply_min_job_price(job_price):
    minimum = get_min_job_price()
    return max(float(job_price), minimum)


def get_token_pricing():
    config = PricingConfiguration.get_config()
    token_packages = _normalize_token_packages(config.token_packages)

    min_token_purchase = config.min_token_purchase
    max_token_purchase = config.max_token_purchase

    if token_packages:
        min_token_purchase = token_packages[0]['tokens']
        max_token_purchase = token_packages[-1]['tokens']

    return {
        'base_token_price': float(config.base_token_price),
        'min_token_purchase': min_token_purchase,
        'max_token_purchase': max_token_purchase,
        'token_packages': token_packages,
    }


def get_required_tokens(job_total):
    config = PricingConfiguration.get_config()
    deduction_pct = float(getattr(config, 'token_deduction_percentage', 2.0) or 0.0)
    safe_pct = max(0.0, deduction_pct)
    safe_total = max(0.0, float(job_total or 0.0))
    return int(math.ceil(safe_total * (safe_pct / 100.0)))

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
