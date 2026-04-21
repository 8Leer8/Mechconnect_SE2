from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

from bookings.models import Request, RequestAssignment, Booking
from bookings.ws_utils import notify_user
from users.models import Account


def _get_provider_account(request):
    """Return (account, error_response). Works for shop owner providers via session."""
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
    return account, None


def _notify_assignment_change(request_obj, target_account_ids, message, booking=None):
    """Push booking_update websocket event so mechanic UIs refresh after assignment changes."""
    if booking is None:
        booking = Booking.objects.filter(request=request_obj).first()
    if not booking:
        return

    for account_id in set(target_account_ids or []):
        if not account_id:
            continue
        try:
            notify_user(account_id, booking.id, booking.status, message)
        except Exception:
            continue


@api_view(['GET'])
@permission_classes([AllowAny])
def list_request_assignments(request, request_id):
    """List all mechanics assigned to a request."""
    account, err = _get_provider_account(request)
    if err:
        return err
    try:
        if hasattr(account, 'shopowner'):
            shop = account.shopowner.shop
            req = Request.objects.get(id=request_id, shop=shop)
        else:
            req = Request.objects.get(id=request_id, provider=account)
    except Request.DoesNotExist:
        return Response({"error": "Request not found or you are not the provider."}, status=status.HTTP_404_NOT_FOUND)

    assignments = RequestAssignment.objects.filter(request=req).select_related('mechanic')
    data = [
        {
            "id": a.id,
            "mechanic": {
                "id": a.mechanic.id,
                "firstname": a.mechanic.firstname,
                "lastname": a.mechanic.lastname,
                "username": a.mechanic.username,
            },
            "role": a.role,
            "assigned_at": a.assigned_at,
        }
        for a in assignments
    ]
    return Response(data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def assign_mechanic(request, request_id):
    """
    Assign a mechanic to a request. Only the provider (shop owner) can do this.
    Body: { "mechanic_id": int, "role": "lead" | "assistant" }
    """
    account, err = _get_provider_account(request)
    if err:
        return err
    
    # Get request filtering by shop if shop owner, or provider if mechanic
    try:
        if hasattr(account, 'shopowner'):
            shop = account.shopowner.shop
            req = Request.objects.get(id=request_id, shop=shop)
        else:
            req = Request.objects.get(id=request_id, provider=account)
    except Request.DoesNotExist:
        return Response({"error": "Request not found or you are not the provider."}, status=status.HTTP_404_NOT_FOUND)

    mechanic_id = request.data.get('mechanic_id')
    role = request.data.get('role', RequestAssignment.Role.ASSISTANT)

    if not mechanic_id:
        return Response({"error": "mechanic_id is required."}, status=status.HTTP_400_BAD_REQUEST)

    if role not in [choice[0] for choice in RequestAssignment.Role.choices]:
        return Response({"error": f"Invalid role. Choose from: {[c[0] for c in RequestAssignment.Role.choices]}"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        mechanic_account = Account.objects.get(id=mechanic_id)
    except Account.DoesNotExist:
        return Response({"error": "Mechanic account not found."}, status=status.HTTP_404_NOT_FOUND)

    # Safety guard: prevent assigning the same account that created the request as the mechanic.
    try:
        if req.client and req.client.account_id == mechanic_account.id:
            return Response(
                {"error": "You cannot assign the client of this request as a mechanic on the same booking."},
                status=status.HTTP_400_BAD_REQUEST,
            )
    except Exception:
        pass

    if RequestAssignment.objects.filter(request=req, mechanic=mechanic_account).exists():
        return Response({"error": "This mechanic is already assigned to this request."}, status=status.HTTP_400_BAD_REQUEST)

    assignment = RequestAssignment.objects.create(
        request=req,
        mechanic=mechanic_account,
        role=role,
    )

    # Keep booking in ACCEPTED until a mechanic starts travel (shop mechanic "Booked" tab).
    booking = Booking.objects.filter(request=req).first()

    booking_label = f"#{booking.id}" if booking else "this booking"
    _notify_assignment_change(
        req,
        [mechanic_account.id],
        f"You were assigned to booking {booking_label}.",
        booking=booking,
    )

    return Response({
        "id": assignment.id,
        "mechanic": {
            "id": mechanic_account.id,
            "firstname": mechanic_account.firstname,
            "lastname": mechanic_account.lastname,
            "username": mechanic_account.username,
        },
        "role": assignment.role,
        "assigned_at": assignment.assigned_at,
    }, status=status.HTTP_201_CREATED)


@api_view(['DELETE'])
@permission_classes([AllowAny])
def unassign_mechanic(request, request_id, assignment_id):
    """Remove a mechanic assignment from a request."""
    account, err = _get_provider_account(request)
    if err:
        return err
    
    # Get request filtering by shop if shop owner, or provider if mechanic
    try:
        if hasattr(account, 'shopowner'):
            shop = account.shopowner.shop
            req = Request.objects.get(id=request_id, shop=shop)
        else:
            req = Request.objects.get(id=request_id, provider=account)
    except Request.DoesNotExist:
        return Response({"error": "Request not found or you are not the provider."}, status=status.HTTP_404_NOT_FOUND)

    try:
        assignment = RequestAssignment.objects.get(id=assignment_id, request=req)
    except RequestAssignment.DoesNotExist:
        return Response({"error": "Assignment not found."}, status=status.HTTP_404_NOT_FOUND)

    target_mechanic_id = assignment.mechanic_id

    assignment.delete()
    _notify_assignment_change(req, [target_mechanic_id], "Your assignment was removed.")
    return Response({"message": "Mechanic unassigned successfully."}, status=status.HTTP_200_OK)


@api_view(['PATCH'])
@permission_classes([AllowAny])
def update_assignment_role(request, request_id, assignment_id):
    """
    Update the role of an assigned mechanic.
    Body: { "role": "lead" | "assistant" }
    """
    account, err = _get_provider_account(request)
    if err:
        return err
    
    # Get request filtering by shop if shop owner, or provider if mechanic
    try:
        if hasattr(account, 'shopowner'):
            shop = account.shopowner.shop
            req = Request.objects.get(id=request_id, shop=shop)
        else:
            req = Request.objects.get(id=request_id, provider=account)
    except Request.DoesNotExist:
        return Response({"error": "Request not found or you are not the provider."}, status=status.HTTP_404_NOT_FOUND)

    try:
        assignment = RequestAssignment.objects.get(id=assignment_id, request=req)
    except RequestAssignment.DoesNotExist:
        return Response({"error": "Assignment not found."}, status=status.HTTP_404_NOT_FOUND)

    role = request.data.get('role')
    if not role or role not in [choice[0] for choice in RequestAssignment.Role.choices]:
        return Response({"error": f"Invalid role. Choose from: {[c[0] for c in RequestAssignment.Role.choices]}"}, status=status.HTTP_400_BAD_REQUEST)

    assignment.role = role
    assignment.save()

    _notify_assignment_change(
        req,
        [assignment.mechanic_id],
        f"Your assignment role was updated to {assignment.role}.",
    )

    return Response({
        "id": assignment.id,
        "mechanic": {
            "id": assignment.mechanic.id,
            "firstname": assignment.mechanic.firstname,
            "lastname": assignment.mechanic.lastname,
            "username": assignment.mechanic.username,
        },
        "role": assignment.role,
        "assigned_at": assignment.assigned_at,
    }, status=status.HTTP_200_OK)
