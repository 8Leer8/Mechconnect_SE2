import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .ml_utils import predict_specialties
from shops.models import Shop
from users.models import Mechanic
from services.models import ShopSpecialty, MechanicSpecialty, Specialty


@csrf_exempt
@require_http_methods(["POST"])
def predict_and_match(request):
    try:
        body = json.loads(request.body)
        description = body.get('description', '').strip()

        if not description:
            return JsonResponse({'error': 'description is required.'}, status=400)

        # Step 1: AI predicts specialties from description
        ai_results = predict_specialties(description)
        specialty_names = [r['specialty'] for r in ai_results]

        # Step 2: Match specialty names to DB records
        matched_specialties = Specialty.objects.filter(name__in=specialty_names)

        # Step 3: Fetch shops with matched specialties (approved only)
        shop_specialties = ShopSpecialty.objects.filter(
            specialty__in=matched_specialties,
            status='APPROVED',
        ).select_related('shop', 'specialty')

        # Step 4: Fetch mechanics with matched specialties (approved only)
        mechanic_specialties = MechanicSpecialty.objects.filter(
            specialty__in=matched_specialties,
            status='APPROVED',
        ).select_related(
            'mechanic',
            'mechanic__account',
            'specialty'
        )

        # Step 5: Build shop cards
        shops_dict = {}
        for ss in shop_specialties:
            shop = ss.shop
            if shop.id not in shops_dict:
                shops_dict[shop.id] = {
                    'id': shop.id,
                    'shop_name': shop.shop_name,
                    'service_banner': shop.service_banner.url if shop.service_banner else None,
                    'is_verified': shop.is_verified,
                    'status': shop.status,
                    'matched_specialties': []
                }
            shops_dict[shop.id]['matched_specialties'].append(ss.specialty.name)

        # Step 6: Build mechanic cards
        mechanics_dict = {}
        for ms in mechanic_specialties:
            mechanic = ms.mechanic
            account = mechanic.account
            if account.id not in mechanics_dict:
                mechanics_dict[account.id] = {
                    # IMPORTANT: this id is used as provider_id in direct/custom request APIs,
                    # so it must be Account.id (not Mechanic.id).
                    'id': account.id,
                    'mechanic_id': mechanic.id,
                    'username': account.username,
                    'full_name': f"{account.firstname} {account.lastname}",
                    'profile_photo': mechanic.profile_photo.url if mechanic.profile_photo else None,
                    'average_rating': float(mechanic.average_rating),
                    'status': mechanic.status,
                    'matched_specialties': []
                }
            mechanics_dict[account.id]['matched_specialties'].append(ms.specialty.name)

        return JsonResponse({
            'description': description,
            'ai_recommendations': ai_results,
            'matched_shops': list(shops_dict.values()),
            'matched_mechanics': list(mechanics_dict.values())
        })

    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON.'}, status=400)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)