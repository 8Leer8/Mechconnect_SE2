from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from decimal import Decimal, InvalidOperation

from ..models import Account, Mechanic, ShopOwner, TokenPurchase
from services.pricing_utils import get_token_pricing


@api_view(['GET'])
@permission_classes([AllowAny])
def get_token_pricing_view(request):
    return Response(get_token_pricing())


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


@api_view(['GET'])
@permission_classes([AllowAny])
def shop_owner_wallet(request):
    """Return credits balance for the shop owner tab.

    Shop-owner credits are independent from mechanic wallet for now, so default is always 0
    until dedicated shop-owner top-up is implemented.
    """
    account_id = request.session.get('account_id')
    if not account_id:
        return Response({'error': 'Not authenticated'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        account = Account.objects.get(id=account_id)
    except Account.DoesNotExist:
        return Response({'error': 'Account not found'}, status=status.HTTP_404_NOT_FOUND)

    try:
        ShopOwner.objects.get(account=account)
    except ShopOwner.DoesNotExist:
        return Response({'error': 'Shop owner profile not found'}, status=status.HTTP_404_NOT_FOUND)

    return Response({'tokens_balance': 0}, status=status.HTTP_200_OK)


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

    try:
        tokens = int(request.data.get('tokens', 0))
    except (TypeError, ValueError):
        return Response({'error': 'Invalid token amount'}, status=status.HTTP_400_BAD_REQUEST)

    if tokens <= 0:
        return Response({'error': 'Invalid token amount'}, status=status.HTTP_400_BAD_REQUEST)

    token_pricing = get_token_pricing()
    token_packages = token_pricing.get('token_packages') or []

    if token_packages:
        matched_package = next((pkg for pkg in token_packages if pkg.get('tokens') == tokens), None)
        if not matched_package:
            return Response(
                {
                    'error': 'Tokens must match a configured package',
                    'allowed_packages': token_packages,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        computed_price = Decimal(str(matched_package['price'])).quantize(Decimal('0.01'))
        base_token_price = (computed_price / Decimal(tokens)).quantize(Decimal('0.01'))
    else:
        min_tokens = token_pricing['min_token_purchase']
        max_tokens = token_pricing['max_token_purchase']

        if tokens < min_tokens or tokens > max_tokens:
            return Response(
                {'error': f'Tokens must be between {min_tokens} and {max_tokens}'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        base_token_price = Decimal(str(token_pricing['base_token_price']))
        computed_price = (Decimal(tokens) * base_token_price).quantize(Decimal('0.01'))

    submitted_price = request.data.get('price', None)
    if submitted_price is not None and submitted_price != '':
        try:
            submitted_price_decimal = Decimal(str(submitted_price)).quantize(Decimal('0.01'))
        except (InvalidOperation, TypeError, ValueError):
            return Response({'error': 'Invalid price value'}, status=status.HTTP_400_BAD_REQUEST)
        if submitted_price_decimal != computed_price:
            return Response(
                {
                    'error': 'Price does not match current token pricing',
                    'expected_price': float(computed_price),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    try:
        account = Account.objects.get(id=account_id)
        mechanic = Mechanic.objects.get(account=account)
    except (Account.DoesNotExist, Mechanic.DoesNotExist):
        return Response({'error': 'Mechanic not found'}, status=status.HTTP_404_NOT_FOUND)

    # Create a TokenPurchase record for auditing
    TokenPurchase.objects.create(account=account, tokens_amount=tokens, price=computed_price, status='completed')

    # Increment mechanic balance
    mechanic.tokens_balance = mechanic.tokens_balance + tokens
    mechanic.save(update_fields=['tokens_balance'])

    return Response(
        {
            'tokens_balance': mechanic.tokens_balance,
            'token_price': float(base_token_price),
            'charged_price': float(computed_price),
        },
        status=status.HTTP_200_OK,
    )
