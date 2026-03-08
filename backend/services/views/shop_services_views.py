"""
Shop owner services: list services offered by the shop, add, remove, update price.
Mirrors the mechanic services pattern for shop owners.
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from users.models import Account
from ..models import Service, ShopService
from MainBackend.storage_utils import get_media_url


def _get_shop(request):
    """Return (shop, error_response). error_response is None if ok."""
    account_id = request.session.get("account_id")
    if not account_id:
        return None, Response(
            {"error": "Authentication required"},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    try:
        account = Account.objects.get(id=account_id)
    except Account.DoesNotExist:
        return None, Response(
            {"error": "Account not found"},
            status=status.HTTP_404_NOT_FOUND,
        )
    if not hasattr(account, "shopowner"):
        return None, Response(
            {"error": "Only shop owners can manage shop services"},
            status=status.HTTP_403_FORBIDDEN,
        )
    if not hasattr(account.shopowner, "shop"):
        return None, Response(
            {"error": "You don't have a shop yet"},
            status=status.HTTP_404_NOT_FOUND,
        )
    return account.shopowner.shop, None


@api_view(["GET"])
@permission_classes([AllowAny])
def list_shop_services(request):
    """
    List services offered by the logged-in shop owner's shop.
    """
    shop, err = _get_shop(request)
    if err:
        return err

    qs = (
        ShopService.objects.filter(shop=shop)
        .select_related("service", "service__category")
        .order_by("service__name")
    )
    services_data = []
    for ss in qs:
        s = ss.service
        services_data.append({
            "id": s.id,
            "shop_service_id": ss.id,
            "name": s.name,
            "description": s.description,
            "price": float(ss.price),
            "minimum_price": float(s.minimum_price),
            "service_picture": get_media_url(s.service_picture, request),
            "category": s.category.name if s.category else None,
            "category_id": s.category.id if s.category else None,
        })
    return Response({"services": services_data, "count": len(services_data)}, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([AllowAny])
def add_shop_service(request):
    """
    Add a service to the shop's offerings with custom pricing.
    Body: { "service_id": <int>, "price": <float> }
    """
    shop, err = _get_shop(request)
    if err:
        return err

    service_id = request.data.get("service_id")
    price = request.data.get("price")

    if service_id is None:
        return Response(
            {"error": "service_id is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if price is None:
        return Response(
            {"error": "price is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        price = float(price)
    except (TypeError, ValueError):
        return Response(
            {"error": "price must be a valid number"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if price < 0:
        return Response(
            {"error": "Price cannot be negative"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        service = Service.objects.get(id=service_id)
    except Service.DoesNotExist:
        return Response(
            {"error": "Service not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if ShopService.objects.filter(shop=shop, service=service).exists():
        return Response(
            {"error": "This shop already offers this service"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ss = ShopService.objects.create(shop=shop, service=service, price=price)
    return Response(
        {
            "message": "Service added",
            "shop_service_id": ss.id,
            "service": {
                "id": service.id,
                "name": service.name,
                "description": service.description,
                "price": float(ss.price),
                "minimum_price": float(service.minimum_price),
                "category": service.category.name if service.category else None,
            },
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST", "DELETE"])
@permission_classes([AllowAny])
def remove_shop_service(request):
    """
    Remove a service from the shop's offerings.
    Body: { "service_id": <int> } or query param service_id.
    """
    shop, err = _get_shop(request)
    if err:
        return err

    service_id = request.data.get("service_id") or request.query_params.get("service_id")
    if service_id is None:
        return Response(
            {"error": "service_id is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        service_id = int(service_id)
    except (TypeError, ValueError):
        return Response(
            {"error": "service_id must be an integer"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    deleted, _ = ShopService.objects.filter(
        shop=shop, service_id=service_id
    ).delete()
    if not deleted:
        return Response(
            {"error": "Service not in your shop or not found"},
            status=status.HTTP_404_NOT_FOUND,
        )
    return Response(
        {"message": "Service removed", "service_id": service_id},
        status=status.HTTP_200_OK,
    )


@api_view(["PUT", "PATCH"])
@permission_classes([AllowAny])
def update_shop_service_price(request):
    """
    Update the price for a shop's service.
    Body: { "shop_service_id": <int>, "price": <float> }
    """
    shop, err = _get_shop(request)
    if err:
        return err

    shop_service_id = request.data.get("shop_service_id")
    price = request.data.get("price")

    if shop_service_id is None:
        return Response(
            {"error": "shop_service_id is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if price is None:
        return Response(
            {"error": "price is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        price = float(price)
    except (TypeError, ValueError):
        return Response(
            {"error": "price must be a valid number"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if price < 0:
        return Response(
            {"error": "Price cannot be negative"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        ss = ShopService.objects.select_related('service').get(
            id=shop_service_id,
            shop=shop
        )
    except ShopService.DoesNotExist:
        return Response(
            {"error": "Service not found in your shop offerings"},
            status=status.HTTP_404_NOT_FOUND,
        )

    ss.price = price
    ss.save()
    return Response(
        {
            "message": "Price updated",
            "shop_service_id": ss.id,
            "service": {
                "id": ss.service.id,
                "name": ss.service.name,
                "price": float(ss.price),
                "minimum_price": float(ss.service.minimum_price),
            },
        },
        status=status.HTTP_200_OK,
    )
