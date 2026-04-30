from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from decimal import Decimal, InvalidOperation

from ..models import Account, Mechanic, ShopOwner, TokenPurchase, TokenTransaction, Wallet
from services.pricing_utils import get_token_pricing
from decimal import Decimal
from django.db import transaction
from ..models import CashOutRequest
from django.shortcuts import redirect
from django.http import HttpResponse


def get_account_from_session(request):
    """Get authenticated account from session.
    
    Returns Account instance or None if not authenticated.
    """
    account_id = request.session.get('account_id')
    if not account_id:
        return None
    try:
        return Account.objects.get(id=account_id)
    except Account.DoesNotExist:
        return None


@api_view(['GET'])
@permission_classes([AllowAny])
def get_token_pricing_view(request):
    return Response(get_token_pricing())


def _token_purchases_for_account(account):
    purchases = (
        TokenPurchase.objects
        .filter(account=account)
        .order_by('-purchased_at')[:50]
    )
    return [
        {
            'id': purchase.id,
            'tokens': purchase.tokens_amount,
            'price': float(purchase.price),
            'payment_method': (purchase.payment_method or '').lower() or None,
            'status': purchase.status,
            'time': purchase.purchased_at,
        }
        for purchase in purchases
    ]


def _parse_topup_body(request):
    """Validate top-up JSON. Returns (tokens, computed_price, base_token_price, raw_method) or a Response error."""
    try:
        tokens = int(request.data.get('tokens', 0))
    except (TypeError, ValueError):
        return Response({'error': 'Invalid token amount'}, status=status.HTTP_400_BAD_REQUEST)

    if tokens <= 0:
        return Response({'error': 'Invalid token amount'}, status=status.HTTP_400_BAD_REQUEST)

    raw_method = str(request.data.get('payment_method', 'gcash')).strip().lower()
    if raw_method not in {'gcash', 'maya'}:
        return Response({'error': 'Invalid payment method'}, status=status.HTTP_400_BAD_REQUEST)

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

    return tokens, computed_price, base_token_price, raw_method


@api_view(['GET'])
@permission_classes([AllowAny])
def mechanic_wallet(request):
    """Return the current mechanic's token balance.

    Uses session `account_id` to identify the account and mechanic.
    Balance is read from the unified Wallet model.
    """
    account = get_account_from_session(request)
    if not account:
        return Response({'error': 'Not authenticated'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        Mechanic.objects.get(account=account)
    except Mechanic.DoesNotExist:
        return Response({'error': 'Mechanic profile not found'}, status=status.HTTP_404_NOT_FOUND)

    # Get or create wallet (should exist due to signal, but be defensive)
    wallet, _ = Wallet.objects.get_or_create(account=account, defaults={'balance': Decimal('0.00')})
    
    # Return balance as integer for backward compatibility (tokens are whole units)
    return Response({'tokens_balance': int(wallet.balance)}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
def mechanic_wallet_transactions(request):
    """Return recent mechanic token purchase transactions."""
    account = get_account_from_session(request)
    if not account:
        return Response({'error': 'Not authenticated'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        Mechanic.objects.get(account=account)
    except Mechanic.DoesNotExist:
        return Response({'error': 'Mechanic not found'}, status=status.HTTP_404_NOT_FOUND)

    return Response({'transactions': _token_purchases_for_account(account)}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
def shop_owner_wallet(request):
    """Return credits balance for the logged-in shop owner.
    
    Balance is read from the unified Wallet model.
    """
    account = get_account_from_session(request)
    if not account:
        return Response({'error': 'Not authenticated'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        ShopOwner.objects.get(account=account)
    except ShopOwner.DoesNotExist:
        return Response({'error': 'Shop owner profile not found'}, status=status.HTTP_404_NOT_FOUND)

    # Get or create wallet (should exist due to signal, but be defensive)
    wallet, _ = Wallet.objects.get_or_create(account=account, defaults={'balance': Decimal('0.00')})
    
    # Return balance as integer for backward compatibility (tokens are whole units)
    return Response({'tokens_balance': int(wallet.balance)}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
def shop_owner_wallet_transactions(request):
    """Return recent shop owner token purchase transactions (same TokenPurchase ledger as mechanics)."""
    account = get_account_from_session(request)
    if not account:
        return Response({'error': 'Not authenticated'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        ShopOwner.objects.get(account=account)
    except ShopOwner.DoesNotExist:
        return Response({'error': 'Shop owner not found'}, status=status.HTTP_404_NOT_FOUND)

    return Response({'transactions': _token_purchases_for_account(account)}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def mechanic_wallet_topup(request):
    """Top-up mechanic tokens (development helper).

    Expects JSON: { "tokens": 10, "price": 1.99, "payment_method": "gcash"|"maya" }
    Creates a TokenPurchase record with status 'completed' and increments wallet balance.
    Also creates a TokenTransaction ledger entry.
    """
    account = get_account_from_session(request)
    if not account:
        return Response({'error': 'Not authenticated'}, status=status.HTTP_401_UNAUTHORIZED)

    parsed = _parse_topup_body(request)
    if isinstance(parsed, Response):
        return parsed
    tokens, computed_price, base_token_price, raw_method = parsed

    try:
        Mechanic.objects.get(account=account)
    except Mechanic.DoesNotExist:
        return Response({'error': 'Mechanic not found'}, status=status.HTTP_404_NOT_FOUND)

    # Get or create wallet
    wallet, _ = Wallet.objects.get_or_create(account=account, defaults={'balance': Decimal('0.00')})

    # Create TokenPurchase record (universal ledger)
    purchase = TokenPurchase.objects.create(
        account=account,
        tokens_amount=tokens,
        price=computed_price,
        payment_method=raw_method,
        status='completed',
    )

    # Create TokenTransaction ledger entry (universal ledger)
    TokenTransaction.objects.create(
        account=account,
        tokens=int(tokens),  # Cast Decimal to int for IntegerField
        reason=f'Top-up via {raw_method}',
    )

    # Update wallet balance using Decimal for precision
    wallet.balance = wallet.balance + Decimal(str(tokens))
    wallet.save(update_fields=['balance'])

    return Response(
        {
            'tokens_balance': int(wallet.balance),
            'token_price': float(base_token_price),
            'charged_price': float(computed_price),
            'purchase': {
                'id': purchase.id,
                'tokens': purchase.tokens_amount,
                'price': float(purchase.price),
                'payment_method': purchase.payment_method,
                'status': purchase.status,
                'time': purchase.purchased_at,
            },
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def shop_owner_wallet_topup(request):
    """Top-up shop owner credits (same pricing rules as mechanic wallet).
    
    Creates TokenPurchase and TokenTransaction ledger entries,
    and updates the unified Wallet balance.
    """
    account = get_account_from_session(request)
    if not account:
        return Response({'error': 'Not authenticated'}, status=status.HTTP_401_UNAUTHORIZED)

    parsed = _parse_topup_body(request)
    if isinstance(parsed, Response):
        return parsed
    tokens, computed_price, base_token_price, raw_method = parsed

    try:
        ShopOwner.objects.get(account=account)
    except ShopOwner.DoesNotExist:
        return Response({'error': 'Shop owner not found'}, status=status.HTTP_404_NOT_FOUND)

    # Get or create wallet
    wallet, _ = Wallet.objects.get_or_create(account=account, defaults={'balance': Decimal('0.00')})

    # Create TokenPurchase record (universal ledger)
    purchase = TokenPurchase.objects.create(
        account=account,
        tokens_amount=tokens,
        price=computed_price,
        payment_method=raw_method,
        status='completed',
    )

    # Create TokenTransaction ledger entry (universal ledger)
    TokenTransaction.objects.create(
        account=account,
        tokens=int(tokens),  # Cast Decimal to int for IntegerField
        reason=f'Top-up via {raw_method}',
    )

    # Update wallet balance using Decimal for precision
    wallet.balance = wallet.balance + Decimal(str(tokens))
    wallet.save(update_fields=['balance'])

    return Response(
        {
            'tokens_balance': int(wallet.balance),
            'token_price': float(base_token_price),
            'charged_price': float(computed_price),
            'purchase': {
                'id': purchase.id,
                'tokens': purchase.tokens_amount,
                'price': float(purchase.price),
                'payment_method': purchase.payment_method,
                'status': purchase.status,
                'time': purchase.purchased_at,
            },
        },
        status=status.HTTP_200_OK,
    )


@api_view(['GET'])
@permission_classes([AllowAny])
def client_wallet(request):
    """Return the current client's token/credit balance.

    Uses session `account_id` to identify the account.
    Balance is read from the unified Wallet model (shared across roles).
    """
    account = get_account_from_session(request)
    if not account:
        return Response({'error': 'Not authenticated'}, status=status.HTTP_401_UNAUTHORIZED)

    # Verify the account is a client (or has client role)
    if not hasattr(account, 'client'):
        return Response({'error': 'Client profile not found'}, status=status.HTTP_404_NOT_FOUND)

    # Get or create wallet (should exist due to signal, but be defensive)
    wallet, _ = Wallet.objects.get_or_create(account=account, defaults={'balance': Decimal('0.00')})
    
    # Return balance as integer for consistency (tokens are whole units)
    return Response({'tokens_balance': int(wallet.balance)}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
def client_wallet_transactions(request):
    """Return recent client token purchase transactions.
    
    Uses the same TokenPurchase ledger as mechanics and shop owners.
    """
    account = get_account_from_session(request)
    if not account:
        return Response({'error': 'Not authenticated'}, status=status.HTTP_401_UNAUTHORIZED)

    if not hasattr(account, 'client'):
        return Response({'error': 'Client profile not found'}, status=status.HTTP_404_NOT_FOUND)

    return Response({'transactions': _token_purchases_for_account(account)}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def client_wallet_topup(request):
    """Top-up client tokens/credits (same pricing rules as mechanic/shop owner wallets).
    
    Creates TokenPurchase and TokenTransaction ledger entries,
    and updates the unified Wallet balance (shared across roles).
    """
    account = get_account_from_session(request)
    if not account:
        return Response({'error': 'Not authenticated'}, status=status.HTTP_401_UNAUTHORIZED)

    if not hasattr(account, 'client'):
        return Response({'error': 'Client profile not found'}, status=status.HTTP_404_NOT_FOUND)

    parsed = _parse_topup_body(request)
    if isinstance(parsed, Response):
        return parsed
    tokens, computed_price, base_token_price, raw_method = parsed

    # Get or create wallet (shared across roles)
    wallet, _ = Wallet.objects.get_or_create(account=account, defaults={'balance': Decimal('0.00')})

    # Create TokenPurchase record (universal ledger)
    purchase = TokenPurchase.objects.create(
        account=account,
        tokens_amount=tokens,
        price=computed_price,
        payment_method=raw_method,
        status='completed',
    )

    # Create TokenTransaction ledger entry (universal ledger)
    TokenTransaction.objects.create(
        account=account,
        tokens=int(tokens),  # Cast Decimal to int for IntegerField
        reason=f'Top-up via {raw_method}',
    )

    # Update wallet balance using Decimal for precision
    wallet.balance = wallet.balance + Decimal(str(tokens))
    wallet.save(update_fields=['balance'])

    return Response(
        {
            'tokens_balance': int(wallet.balance),
            'token_price': float(base_token_price),
            'charged_price': float(computed_price),
            'purchase': {
                'id': purchase.id,
                'tokens': purchase.tokens_amount,
                'price': float(purchase.price),
                'payment_method': purchase.payment_method,
                'status': purchase.status,
                'time': purchase.purchased_at,
            },
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def wallet_cashout(request):
    """Request a cash-out of tokens to GCash/Maya (test flow).

    Body: { tokens: int, payout_method?: 'gcash'|'maya', payout_number?: str, redirect_url?: str }
    Returns: checkout_url to authorize the cashout (test confirmation page)
    """
    account = get_account_from_session(request)
    if not account:
        return Response({'error': 'Not authenticated'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        tokens = int(request.data.get('tokens', 0))
    except (TypeError, ValueError):
        return Response({'error': 'Invalid token amount'}, status=status.HTTP_400_BAD_REQUEST)

    if tokens <= 0:
        return Response({'error': 'Invalid token amount'}, status=status.HTTP_400_BAD_REQUEST)

    raw_method = str(request.data.get('payout_method') or account.payout_method or '').strip().lower()
    if raw_method not in {'gcash', 'maya'}:
        return Response({'error': 'Invalid or missing payout method'}, status=status.HTTP_400_BAD_REQUEST)

    payout_number = (request.data.get('payout_number') or account.payout_number or '').strip()
    if not payout_number:
        return Response({'error': 'No payout number configured'}, status=status.HTTP_400_BAD_REQUEST)

    # Compute amount in PHP using base token price
    token_pricing = get_token_pricing()
    base_price = Decimal(str(token_pricing.get('base_token_price', 1)))
    amount_php = (Decimal(tokens) * base_price).quantize(Decimal('0.01'))

    # Lock wallet and create cashout request atomically
    try:
        with transaction.atomic():
            wallet = Wallet.objects.select_for_update().get(account=account)
            if wallet.balance < Decimal(tokens):
                return Response({'error': 'Insufficient balance'}, status=status.HTTP_400_BAD_REQUEST)

            # create CashOutRequest (pending) — wallet not debited until authorization completes
            cashout = CashOutRequest.objects.create(
                account=account,
                role=request.session.get('active_role') or None,
                tokens=tokens,
                amount_php=amount_php,
                payout_method=raw_method,
                payout_number=payout_number,
                status=CashOutRequest.Status.PENDING,
            )
    except Wallet.DoesNotExist:
        return Response({'error': 'Wallet not found'}, status=status.HTTP_404_NOT_FOUND)

    # Build a test authorization URL which the frontend will open. Include redirect_url for returning.
    redirect_url = request.data.get('redirect_url') or request.query_params.get('redirect_url') or ''
    # The simple confirm endpoint will mark the cashout completed (test) and then redirect back to provided redirect_url
    confirm_url = f"/api/users/wallet/cashout/confirm/{cashout.id}/"
    if redirect_url:
        confirm_url += f"?redirect_url={redirect_url}"

    # Return full absolute URL relative to request
    base = request.build_absolute_uri('/')[:-1]
    return Response({'checkout_url': base + confirm_url, 'cashout_id': cashout.id}, status=status.HTTP_200_OK)


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def wallet_cashout_confirm(request, cashout_id):
    """A lightweight test confirmation page to simulate external authorization.

    GET: show a simple HTML page with number and amount and an Authorize button.
    POST: mark cashout completed (debit wallet, ledger entry) and redirect to redirect_url?paymentStatus=success
    """
    cashout = CashOutRequest.objects.filter(id=cashout_id).first()
    if not cashout:
        return HttpResponse('CashOut request not found', status=404)

    if request.method == 'GET':
        html = f"""
        <html>
        <head><title>Test Cash-out Authorization</title></head>
        <body style='font-family: system-ui, -apple-system, Roboto, sans-serif; padding:24px;'>
        <h2>Authorize Test Cash-out</h2>
        <p>Account: {cashout.account.username}</p>
        <p>Amount: ₱{cashout.amount_php}</p>
        <p>Method: {cashout.payout_method.upper()}</p>
        <p>Number: {cashout.payout_number}</p>
        <form method='post'>
          <button type='submit' style='padding:12px 18px;background:#FF8C00;color:#fff;border:none;border-radius:6px'>Authorize (Test)</button>
        </form>
        </body>
        </html>
        """
        return HttpResponse(html)

    # POST: perform debit and mark completed
    try:
        with transaction.atomic():
            wallet = Wallet.objects.select_for_update().get(account=cashout.account)
            if wallet.balance < Decimal(cashout.tokens):
                cashout.status = CashOutRequest.Status.FAILED
                cashout.save(update_fields=['status'])
                return HttpResponse('Insufficient balance to complete cashout', status=400)

            # debit wallet
            wallet.balance = wallet.balance - Decimal(cashout.tokens)
            wallet.save(update_fields=['balance'])

            # ledger entry
            TokenTransaction.objects.create(
                account=cashout.account,
                tokens=-int(cashout.tokens),
                reason=f'Cash-out to {cashout.payout_method} {cashout.payout_number}'
            )

            cashout.status = CashOutRequest.Status.COMPLETED
            cashout.processed_at = timezone.now()
            cashout.external_reference = f'test-{cashout.id}'
            cashout.save(update_fields=['status', 'processed_at', 'external_reference'])
    except Wallet.DoesNotExist:
        return HttpResponse('Wallet not found', status=404)

    # Redirect back to provided redirect_url if present
    redirect_url = request.GET.get('redirect_url') or request.POST.get('redirect_url') or ''
    if redirect_url:
        sep = '&' if '?' in redirect_url else '?'
        return redirect(redirect_url + sep + 'paymentStatus=success')

    return HttpResponse('Cash-out authorized (test). You can close this page.')
