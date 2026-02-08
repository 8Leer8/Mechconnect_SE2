"""
Mechanic services: list services offered by the logged-in mechanic, add, remove.
Used by mechanic profile "Services I offer".
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from users.models import Account
from ..models import Service, MechanicService


def _get_mechanic(request):
    """Return (mechanic, error_response). error_response is None if ok."""
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
    if not hasattr(account, "mechanic"):
        return None, Response(
            {"error": "Only mechanics can manage their services"},
            status=status.HTTP_403_FORBIDDEN,
        )
    return account.mechanic, None


@api_view(["GET"])
@permission_classes([AllowAny])
def list_my_services(request):
    """
    List services offered by the logged-in mechanic.
    Returns list of { id, mechanic_service_id, name, description, price, category, category_id }.
    """
    mechanic, err = _get_mechanic(request)
    if err:
        return err

    qs = (
        MechanicService.objects.filter(mechanic=mechanic)
        .select_related("service", "service__category")
        .order_by("service__name")
    )
    services_data = []
    for ms in qs:
        s = ms.service
        services_data.append({
            "id": s.id,
            "mechanic_service_id": ms.id,
            "name": s.name,
            "description": s.description,
            "price": float(s.price),
            "service_picture": s.service_picture.url if s.service_picture else None,
            "category": s.category.name if s.category else None,
            "category_id": s.category.id if s.category else None,
        })
    return Response({"services": services_data, "count": len(services_data)}, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([AllowAny])
def add_my_service(request):
    """
    Add a service to the mechanic's offered services.
    Body: { "service_id": <int> }
    """
    mechanic, err = _get_mechanic(request)
    if err:
        return err

    service_id = request.data.get("service_id")
    if service_id is None:
        return Response(
            {"error": "service_id is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        service = Service.objects.get(id=service_id)
    except Service.DoesNotExist:
        return Response(
            {"error": "Service not found"},
            status=status.HTTP_404_NOT_FOUND,
        )

    if MechanicService.objects.filter(mechanic=mechanic, service=service).exists():
        return Response(
            {"error": "You already offer this service"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ms = MechanicService.objects.create(mechanic=mechanic, service=service)
    return Response(
        {
            "message": "Service added",
            "mechanic_service_id": ms.id,
            "service": {
                "id": service.id,
                "name": service.name,
                "description": service.description,
                "price": float(service.price),
                "category": service.category.name if service.category else None,
            },
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST", "DELETE"])
@permission_classes([AllowAny])
def remove_my_service(request):
    """
    Remove a service from the mechanic's offered services.
    Body: { "service_id": <int> } or query param service_id.
    """
    mechanic, err = _get_mechanic(request)
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

    deleted, _ = MechanicService.objects.filter(
        mechanic=mechanic, service_id=service_id
    ).delete()
    if not deleted:
        return Response(
            {"error": "Service not in your list or not found"},
            status=status.HTTP_404_NOT_FOUND,
        )
    return Response(
        {"message": "Service removed", "service_id": service_id},
        status=status.HTTP_200_OK,
    )
