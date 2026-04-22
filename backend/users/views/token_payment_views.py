import base64
import hashlib
import hmac
import logging
import uuid
from decimal import Decimal

import requests
from django.conf import settings
from django.db import transaction
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

from users.models import Account, Mechanic, ShopOwner, TokenPurchase
from services.pricing_utils import get_token_pricing


logger = logging.getLogger(__name__)
WEBHOOK_MAX_AGE_SECONDS = 30 * 60


def _build_token_paymongo_redirect_urls(is_shop_owner=False):
    """Build redirect URLs for token purchase payments."""
    base_url = str(getattr(settings, "PAYMONGO_REDIRECT_BASE_URL", "") or "").rstrip("/")
    if not base_url.startswith("https://"):
        raise ValueError("PAYMONGO_REDIRECT_BASE_URL must be an https URL")
    
    # Use different redirect URLs for shop owner vs mechanic
    user_type = "shop-owner" if is_shop_owner else "wallet"
    return (
        f"{base_url}/api/users/{user_type}/redirect/success/",
        f"{base_url}/api/users/{user_type}/redirect/failed/",
    )


def _get_authenticated_account(request):
    """Get authenticated account from session."""
    account_id = request.session.get("account_id")
    if not account_id:
        return None
    try:
        return Account.objects.get(id=account_id)
    except Account.DoesNotExist:
        return None


def _parse_token_purchase_body(request):
    """Validate token purchase JSON body."""
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

    return tokens, computed_price, raw_method


def create_paymongo_source_for_tokens(amount, payment_method, purchase_id, account_id, is_shop_owner=False):
    """Create PayMongo source for token purchase and return checkout URL."""
    secret_key = settings.PAYMONGO_SECRET_KEY
    encoded_key = base64.b64encode(f"{secret_key}:".encode()).decode()

    type_map = {
        "gcash": "gcash",
        "maya": "paymaya",
    }

    success_redirect, failed_redirect = _build_token_paymongo_redirect_urls(is_shop_owner)

    amount_centavos = int(Decimal(amount) * 100)

    payload = {
        "data": {
            "attributes": {
                "amount": amount_centavos,
                "currency": "PHP",
                "type": type_map[payment_method],
                "redirect": {
                    "success": success_redirect,
                    "failed": failed_redirect,
                },
                "metadata": {
                    "purchase_id": str(purchase_id),
                    "account_id": str(account_id),
                    "purpose": "token_purchase",
                    "is_shop_owner": str(is_shop_owner),
                },
            }
        }
    }

    response = requests.post(
        "https://api.paymongo.com/v1/sources",
        json=payload,
        headers={
            "Authorization": f"Basic {encoded_key}",
            "Content-Type": "application/json",
        },
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()
    return data["data"]["attributes"]["redirect"]["checkout_url"], data["data"]["id"]


def create_paymongo_maya_intent_for_tokens(amount, purchase_id, account_id, is_shop_owner=False):
    """Maya (PayMaya) checkout for token purchases — Payment Intent flow (same as booking Maya).

    PayMongo's Sources API with type ``paymaya`` is unreliable; booking payments use
    Payment Intents + ``paymaya`` payment method instead.
    """
    secret_key = settings.PAYMONGO_SECRET_KEY
    encoded_key = base64.b64encode(f"{secret_key}:".encode()).decode()
    headers = {
        "Authorization": f"Basic {encoded_key}",
        "Content-Type": "application/json",
    }

    amount_centavos = int(Decimal(amount) * 100)
    success_redirect, _failed_redirect = _build_token_paymongo_redirect_urls(is_shop_owner)

    intent_payload = {
        "data": {
            "attributes": {
                "amount": amount_centavos,
                "currency": "PHP",
                "payment_method_allowed": ["paymaya"],
                "metadata": {
                    "purchase_id": str(purchase_id),
                    "account_id": str(account_id),
                    "purpose": "token_purchase",
                    "is_shop_owner": str(is_shop_owner),
                },
            }
        }
    }
    intent_response = requests.post(
        "https://api.paymongo.com/v1/payment_intents",
        json=intent_payload,
        headers=headers,
        timeout=30,
    )
    intent_response.raise_for_status()
    intent_data = intent_response.json()
    intent_id = intent_data["data"]["id"]
    intent_client_key = intent_data["data"]["attributes"]["client_key"]

    method_payload = {
        "data": {
            "attributes": {
                "type": "paymaya",
            }
        }
    }
    method_response = requests.post(
        "https://api.paymongo.com/v1/payment_methods",
        json=method_payload,
        headers=headers,
        timeout=30,
    )
    method_response.raise_for_status()
    method_data = method_response.json()
    method_id = method_data["data"]["id"]

    attach_payload = {
        "data": {
            "attributes": {
                "payment_method": method_id,
                "client_key": intent_client_key,
                "return_url": success_redirect,
            }
        }
    }
    attach_response = requests.post(
        f"https://api.paymongo.com/v1/payment_intents/{intent_id}/attach",
        json=attach_payload,
        headers=headers,
        timeout=30,
    )
    attach_response.raise_for_status()
    attach_data = attach_response.json()

    next_action = attach_data["data"]["attributes"].get("next_action") or {}
    redirect_url = (next_action.get("redirect", {}) or {}).get("url")

    if not redirect_url:
        raise ValueError("No redirect URL returned from PayMongo Maya intent for token purchase")

    return redirect_url, intent_id


@api_view(['POST'])
@permission_classes([AllowAny])
def initiate_token_purchase(request):
    """Initiate PayMongo payment for token purchase.
    
    Creates a pending TokenPurchase record and returns checkout URL.
    """
    account = _get_authenticated_account(request)
    if not account:
        return Response({'error': 'Not authenticated'}, status=status.HTTP_401_UNAUTHORIZED)

    parsed = _parse_token_purchase_body(request)
    if isinstance(parsed, Response):
        return parsed
    tokens, computed_price, raw_method = parsed

    # Determine if mechanic or shop owner
    mechanic = None
    shop_owner = None
    try:
        mechanic = Mechanic.objects.get(account=account)
    except Mechanic.DoesNotExist:
        try:
            shop_owner = ShopOwner.objects.get(account=account)
        except ShopOwner.DoesNotExist:
            return Response(
                {'error': 'User must be a mechanic or shop owner'},
                status=status.HTTP_400_BAD_REQUEST
            )

    # Create pending purchase record
    purchase = TokenPurchase.objects.create(
        account=account,
        tokens_amount=tokens,
        price=computed_price,
        payment_method=raw_method,
        status='pending',
    )

    # Determine if shop owner for redirect URLs
    is_shop_owner = shop_owner is not None

    try:
        if raw_method == "maya":
            checkout_url, intent_id = create_paymongo_maya_intent_for_tokens(
                amount=computed_price,
                purchase_id=purchase.id,
                account_id=account.id,
                is_shop_owner=is_shop_owner,
            )
            purchase.ewallet_source_id = intent_id
            purchase.save(update_fields=["ewallet_source_id"])
        else:
            checkout_url, source_id = create_paymongo_source_for_tokens(
                amount=computed_price,
                payment_method=raw_method,
                purchase_id=purchase.id,
                account_id=account.id,
                is_shop_owner=is_shop_owner,
            )
            purchase.ewallet_source_id = source_id
            purchase.save(update_fields=["ewallet_source_id"])

        return Response({
            'checkout_url': checkout_url,
            'purchase_id': purchase.id,
            'tokens': tokens,
            'price': float(computed_price),
            'payment_method': raw_method,
        }, status=status.HTTP_200_OK)

    except Exception as e:
        logger.exception("PayMongo source creation failed for token purchase")
        # Mark purchase as failed
        purchase.status = 'failed'
        purchase.save(update_fields=['status'])
        return Response(
            {'error': 'Unable to initialize e-wallet payment'},
            status=status.HTTP_502_BAD_GATEWAY
        )


@api_view(['POST'])
@permission_classes([AllowAny])
def token_purchase_webhook(request):
    """Handle PayMongo webhook events for token purchases."""
    webhook_secret = settings.PAYMONGO_WEBHOOK_SECRET
    
    # Get signature from header
    signature_header = request.headers.get('Paymongo-Signature', '')
    if not signature_header:
        logger.warning("Missing PayMongo signature header")
        return Response({'error': 'Missing signature'}, status=status.HTTP_401_UNAUTHORIZED)

    # Get timestamp and signature
    timestamp = None
    signature = None
    for part in signature_header.split(','):
        if part.startswith('t='):
            try:
                timestamp = int(part[2:])
            except (ValueError, TypeError):
                pass
        elif part.startswith('v1='):
            signature = part[3:]

    if not timestamp or not signature:
        logger.warning("Invalid PayMongo signature format")
        return Response({'error': 'Invalid signature format'}, status=status.HTTP_401_UNAUTHORIZED)

    # Verify timestamp
    current_ts = int(timezone.now().timestamp())
    if abs(current_ts - timestamp) > WEBHOOK_MAX_AGE_SECONDS:
        logger.warning("PayMongo webhook timestamp too old: %s", timestamp)
        return Response({'error': 'Timestamp too old'}, status=status.HTTP_401_UNAUTHORIZED)

    # Compute expected signature
    payload_body = request.body.decode('utf-8') if request.body else ''
    signed_payload = f"{timestamp}.{payload_body}"
    expected_signature = hmac.new(
        webhook_secret.encode(),
        signed_payload.encode(),
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, signature):
        logger.warning("PayMongo webhook signature mismatch")
        return Response({'error': 'Invalid signature'}, status=status.HTTP_401_UNAUTHORIZED)

    # Process event
    event_data = request.data.get('data', {}) or {}
    event_attributes = event_data.get('attributes', {}) or {}
    event_type = event_attributes.get('type')
    resource = event_attributes.get('data', {}) or {}
    resource_attributes = resource.get('attributes', {}) or {}
    metadata = resource_attributes.get('metadata', {}) or {}

    # Only process token purchase events
    if metadata.get('purpose') != 'token_purchase':
        return Response({'status': 'ignored'}, status=status.HTTP_200_OK)

    purchase_id = metadata.get('purchase_id')
    if not purchase_id:
        logger.warning("PayMongo webhook missing purchase_id in metadata")
        return Response({'error': 'Missing purchase_id'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        purchase = TokenPurchase.objects.get(id=purchase_id)
    except TokenPurchase.DoesNotExist:
        logger.warning("PayMongo webhook for unknown purchase: %s", purchase_id)
        return Response({'error': 'Purchase not found'}, status=status.HTTP_404_NOT_FOUND)

    if event_type == 'source.chargeable':
        # Charge the source
        _charge_token_purchase_source(resource.get('id'), purchase, resource_attributes)
    elif event_type == 'payment.paid':
        # Mark purchase as completed and add tokens
        _finalize_token_purchase(purchase, resource_attributes)
    elif event_type == 'payment_intent.succeeded':
        # Maya token top-ups use Payment Intents (same as booking Maya flow)
        _finalize_token_purchase(purchase, resource_attributes)

    return Response({'status': 'processed'}, status=status.HTTP_200_OK)


def _charge_token_purchase_source(source_id, purchase, resource_attributes):
    """Charge a chargeable source for token purchase."""
    secret_key = settings.PAYMONGO_SECRET_KEY
    encoded_key = base64.b64encode(f"{secret_key}:".encode()).decode()

    amount_centavos = int(Decimal(purchase.price) * 100)

    payload = {
        "data": {
            "attributes": {
                "amount": amount_centavos,
                "source": {
                    "id": source_id,
                    "type": "source",
                },
                "currency": "PHP",
                "metadata": resource_attributes.get('metadata', {}),
            }
        }
    }

    try:
        response = requests.post(
            "https://api.paymongo.com/v1/payments",
            json=payload,
            headers={
                "Authorization": f"Basic {encoded_key}",
                "Content-Type": "application/json",
            },
            timeout=30,
        )
        response.raise_for_status()
        logger.info("Successfully charged source %s for purchase %s", source_id, purchase.id)
    except Exception as e:
        logger.exception("Failed to charge source %s for purchase %s", source_id, purchase.id)
        purchase.status = 'failed'
        purchase.save(update_fields=['status'])


def _finalize_token_purchase(purchase, resource_attributes):
    """Finalize successful token purchase and add tokens to balance."""
    if purchase.status == 'completed':
        return  # Already processed

    with transaction.atomic():
        # Update purchase status
        purchase.status = 'completed'
        purchase.external_reference = resource_attributes.get('reference_number') or resource_attributes.get('id')
        purchase.save(update_fields=['status', 'external_reference'])

        # Add tokens to user balance
        try:
            mechanic = Mechanic.objects.get(account=purchase.account)
            mechanic.tokens_balance = mechanic.tokens_balance + purchase.tokens_amount
            mechanic.save(update_fields=['tokens_balance'])
        except Mechanic.DoesNotExist:
            try:
                shop_owner = ShopOwner.objects.get(account=purchase.account)
                shop_owner.tokens_balance = shop_owner.tokens_balance + purchase.tokens_amount
                shop_owner.save(update_fields=['tokens_balance'])
            except ShopOwner.DoesNotExist:
                logger.error("No mechanic or shop owner found for purchase %s", purchase.id)

    logger.info("Token purchase %s completed: %s tokens added", purchase.id, purchase.tokens_amount)


def _build_token_redirect_bridge_page(target_deep_link, status_label):
    """Build HTML bridge page to redirect to app after payment."""
    safe_target = str(target_deep_link)
    safe_status = str(status_label)
    return f"""<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Payment {safe_status}</title>
    <style>
      body {{ font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0F1419; color: #ECEDEE; }}
      .box {{ text-align: center; padding: 24px; }}
      .status {{ font-size: 24px; font-weight: 700; margin-bottom: 12px; }}
      .hint {{ color: #8E8E93; font-size: 14px; margin-top: 8px; }}
      .spinner {{ display: inline-block; width: 24px; height: 24px; border: 3px solid rgba(255,140,0,0.3); border-top-color: #FF8C00; border-radius: 50%; animation: spin 1s linear infinite; margin-top: 16px; }}
      @keyframes spin {{ to {{ transform: rotate(360deg); }} }}
    </style>
  </head>
  <body>
    <div class="box">
      <div class="status">Payment {safe_status}</div>
      <div class="hint">Returning to app...</div>
      <div class="spinner"></div>
    </div>
    <script>
      setTimeout(function() {{
        window.location.href = "{safe_target}";
      }}, 1500);
    </script>
  </body>
</html>"""


@api_view(['GET'])
@permission_classes([AllowAny])
def token_redirect_success(request):
    """Redirect handler for successful token purchase payment."""
    html = _build_token_redirect_bridge_page("mechconnect://wallet/payment/success", "Successful")
    return HttpResponse(html)


@api_view(['GET'])
@permission_classes([AllowAny])
def token_redirect_failed(request):
    """Redirect handler for failed token purchase payment."""
    html = _build_token_redirect_bridge_page("mechconnect://wallet/payment/failed", "Failed")
    return HttpResponse(html)


@api_view(['GET'])
@permission_classes([AllowAny])
def check_purchase_status(request, purchase_id):
    """Check the status of a token purchase."""
    account = _get_authenticated_account(request)
    if not account:
        return Response({'error': 'Not authenticated'}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        purchase = TokenPurchase.objects.get(id=purchase_id, account=account)
    except TokenPurchase.DoesNotExist:
        return Response({'error': 'Purchase not found'}, status=status.HTTP_404_NOT_FOUND)

    # Get current balance
    balance = 0
    try:
        mechanic = Mechanic.objects.get(account=account)
        balance = mechanic.tokens_balance
    except Mechanic.DoesNotExist:
        try:
            shop_owner = ShopOwner.objects.get(account=account)
            balance = shop_owner.tokens_balance
        except ShopOwner.DoesNotExist:
            pass

    return Response({
        'purchase_id': purchase.id,
        'status': purchase.status,
        'tokens': purchase.tokens_amount,
        'price': float(purchase.price),
        'payment_method': purchase.payment_method,
        'tokens_balance': balance,
    }, status=status.HTTP_200_OK)
