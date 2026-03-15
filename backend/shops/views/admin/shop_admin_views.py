from django.db.models import Count, Q
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status

from ...models import Shop, ShopDocument, ShopOwnerDocument
from users.permissions import IsAdmin


def _to_bool(value):
    if value is None:
        return None
    return str(value).strip().lower() in {'1', 'true', 'yes'}


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_shop_overview(request):
    data = {
        'shops_total': Shop.objects.count(),
        'verified_shops': Shop.objects.filter(is_verified=True).count(),
        'open_shops': Shop.objects.filter(status=Shop.Status.OPEN).count(),
        'closed_shops': Shop.objects.filter(status=Shop.Status.CLOSED).count(),
        'shop_documents': ShopDocument.objects.count(),
        'owner_documents': ShopOwnerDocument.objects.count(),
    }
    return Response(data, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_list_shops(request):
    queryset = Shop.objects.select_related('shop_owner__account').annotate(
        mechanics_count=Count('mechanics', distinct=True),
    ).order_by('-id')

    q = request.GET.get('q')
    verified = _to_bool(request.GET.get('verified'))
    status_filter = request.GET.get('status')

    if q:
        queryset = queryset.filter(
            Q(shop_name__icontains=q)
            | Q(email__icontains=q)
            | Q(shop_owner__account__username__icontains=q)
        )

    if verified is not None:
        queryset = queryset.filter(is_verified=verified)

    if status_filter in {Shop.Status.OPEN, Shop.Status.CLOSED}:
        queryset = queryset.filter(status=status_filter)

    queryset = queryset[:200]

    results = []
    for shop in queryset:
        results.append(
            {
                'id': shop.id,
                'shop_name': shop.shop_name,
                'owner_username': shop.shop_owner.account.username,
                'contact_number': shop.contact_number,
                'email': shop.email,
                'is_verified': shop.is_verified,
                'status': shop.status,
                'mechanics_count': shop.mechanics_count,
                'created_at': shop.created_at,
            }
        )

    return Response({'count': len(results), 'results': results}, status=status.HTTP_200_OK)
