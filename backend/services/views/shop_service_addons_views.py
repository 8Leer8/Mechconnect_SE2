"""
Shop owner CRUD for ServiceAddOn (services_serviceaddon).

Add-ons are global per `Service` (not per shop), but shop owners are allowed to manage
them only for services their shop offers.
"""

from decimal import Decimal, InvalidOperation

from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from users.models import Account
from shops.models import Shop
from ..models import Service, ServiceAddOn, ShopService


def _get_shop(request):
    """Return (shop, error_response). error_response is None if ok."""
    account_id = request.session.get("account_id")
    if not account_id:
        return None, Response({"error": "Authentication required"}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        account = Account.objects.get(id=account_id)
    except Account.DoesNotExist:
        return None, Response({"error": "Account not found"}, status=status.HTTP_404_NOT_FOUND)

    if not hasattr(account, "shopowner"):
        return None, Response({"error": "Only shop owners can manage add-ons"}, status=status.HTTP_403_FORBIDDEN)

    # Shop has a OneToOne relation with ShopOwner; if not created yet, shopowner.shop raises.
    if not hasattr(account.shopowner, "shop"):
        return None, Response({"error": "You don't have a shop yet"}, status=status.HTTP_404_NOT_FOUND)

    try:
        return account.shopowner.shop, None
    except Exception:
        return None, Response({"error": "You don't have a shop yet"}, status=status.HTTP_404_NOT_FOUND)


def _parse_decimal(value):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


@api_view(["GET"])
@permission_classes([AllowAny])
def list_shop_service_addons(request):
    """
    List ServiceAddOn for a selected service_id, but only if that service is offered by the shop.
    Query params: ?service_id=<int>
    """
    shop, err = _get_shop(request)
    if err:
        return err

    service_id = request.query_params.get("service_id")
    if service_id is None:
        return Response({"error": "service_id is required"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        service_id = int(service_id)
    except (TypeError, ValueError):
        return Response({"error": "service_id must be an integer"}, status=status.HTTP_400_BAD_REQUEST)

    # Permission scope: only allow editing add-ons for services your shop offers.
    if not ShopService.objects.filter(shop=shop, service_id=service_id).exists():
        return Response(
            {"error": "Service not offered by your shop"},
            status=status.HTTP_403_FORBIDDEN,
        )

    add_ons = (
        ServiceAddOn.objects.filter(service_id=service_id)
        .order_by("name")
    )

    data = [
        {
            "id": a.id,
            "name": a.name,
            "description": a.description,
            "price": float(a.price),
        }
        for a in add_ons
    ]

    return Response({"add_ons": data, "count": len(data)}, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([AllowAny])
def add_shop_service_addon(request):
    """
    Create a ServiceAddOn (services_serviceaddon) row.
    Body: { service_id, name, description, price }
    """
    shop, err = _get_shop(request)
    if err:
        return err

    service_id = request.data.get("service_id")
    name = request.data.get("name")
    description = request.data.get("description", "")
    price = request.data.get("price")

    if service_id is None or name is None or price is None:
        return Response(
            {"error": "service_id, name, and price are required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        service_id = int(service_id)
    except (TypeError, ValueError):
        return Response({"error": "service_id must be an integer"}, status=status.HTTP_400_BAD_REQUEST)

    name = str(name).strip()
    if not name:
        return Response({"error": "name cannot be empty"}, status=status.HTTP_400_BAD_REQUEST)

    description = str(description or "").strip()
    if not description:
        description = ""

    parsed_price = _parse_decimal(price)
    if parsed_price is None:
        return Response({"error": "price must be a valid number"}, status=status.HTTP_400_BAD_REQUEST)
    if parsed_price < 0:
        return Response({"error": "Price cannot be negative"}, status=status.HTTP_400_BAD_REQUEST)

    # Scope to services offered by the shop.
    if not ShopService.objects.filter(shop=shop, service_id=service_id).exists():
        return Response({"error": "Service not offered by your shop"}, status=status.HTTP_403_FORBIDDEN)

    try:
        service = Service.objects.get(id=service_id)
    except Service.DoesNotExist:
        return Response({"error": "Service not found"}, status=status.HTTP_404_NOT_FOUND)

    # Avoid exact duplicates (same service + same name) - safe UX.
    if ServiceAddOn.objects.filter(service=service, name__iexact=name).exists():
        return Response({"error": "Add-on with this name already exists for this service"}, status=status.HTTP_400_BAD_REQUEST)

    add_on = ServiceAddOn.objects.create(
        service=service,
        name=name,
        description=description,
        price=parsed_price,
    )

    return Response(
        {
            "message": "Add-on added",
            "add_on": {
                "id": add_on.id,
                "name": add_on.name,
                "description": add_on.description,
                "price": float(add_on.price),
            },
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST", "DELETE"])
@permission_classes([AllowAny])
def remove_shop_service_addon(request):
    """
    Remove a ServiceAddOn row (services_serviceaddon).
    Body: { service_add_on_id } (or query: ?service_add_on_id=)
    """
    shop, err = _get_shop(request)
    if err:
        return err

    service_add_on_id = request.data.get("service_add_on_id") or request.query_params.get("service_add_on_id")
    if service_add_on_id is None:
        return Response({"error": "service_add_on_id is required"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        service_add_on_id = int(service_add_on_id)
    except (TypeError, ValueError):
        return Response({"error": "service_add_on_id must be an integer"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        add_on = ServiceAddOn.objects.select_related("service").get(id=service_add_on_id)
    except ServiceAddOn.DoesNotExist:
        return Response({"error": "Add-on not found"}, status=status.HTTP_404_NOT_FOUND)

    # Permission scope: only allow deleting add-ons for services offered by this shop.
    if not ShopService.objects.filter(shop=shop, service_id=add_on.service_id).exists():
        return Response({"error": "Service not offered by your shop"}, status=status.HTTP_403_FORBIDDEN)

    add_on.delete()
    return Response({"message": "Add-on removed", "service_add_on_id": service_add_on_id}, status=status.HTTP_200_OK)

