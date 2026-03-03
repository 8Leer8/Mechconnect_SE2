from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

from ..models import Account, Mechanic, TokenPurchase


@api_view(['GET'])
@permission_classes([AllowAny])
def mechanic_wallet(request):
    """Return the current mechanic's token balance.

    Uses session `account_id` to identify the account and mechanic.
    """
    account_id = request.session.get('account_id')
    if not account_id:
        return Response({'error': 'Not authenticated'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        account = Account.objects.get(id=account_id)
    except Account.DoesNotExist:
        return Response({'error': 'Account not found'}, status=status.HTTP_404_NOT_FOUND)

    try:
        mechanic = Mechanic.objects.get(account=account)
    except Mechanic.DoesNotExist:
        return Response({'error': 'Mechanic profile not found'}, status=status.HTTP_404_NOT_FOUND)

    return Response({'tokens_balance': mechanic.tokens_balance}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def mechanic_wallet_topup(request):
    """Top-up mechanic tokens (development helper).

    Expects JSON: { "tokens": 10, "price": 1.99 }
    Creates a TokenPurchase record with status 'completed' and increments balance.
    """
    account_id = request.session.get('account_id')
    if not account_id:
        return Response({'error': 'Not authenticated'}, status=status.HTTP_401_UNAUTHORIZED)

    tokens = int(request.data.get('tokens', 0))
    price = request.data.get('price', 0)

    if tokens <= 0:
        return Response({'error': 'Invalid token amount'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        account = Account.objects.get(id=account_id)
        mechanic = Mechanic.objects.get(account=account)
    except (Account.DoesNotExist, Mechanic.DoesNotExist):
        return Response({'error': 'Mechanic not found'}, status=status.HTTP_404_NOT_FOUND)

    # Create a TokenPurchase record for auditing
    TokenPurchase.objects.create(account=account, tokens_amount=tokens, price=price, status='completed')

    # Increment mechanic balance
    mechanic.tokens_balance = mechanic.tokens_balance + tokens
    mechanic.save(update_fields=['tokens_balance'])

    return Response({'tokens_balance': mechanic.tokens_balance}, status=status.HTTP_200_OK)
