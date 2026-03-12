from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from .models import Account
import jwt
from django.conf import settings
from datetime import datetime


class SessionAuthentication(BaseAuthentication):
    """
    Custom session-based authentication
    """
    def authenticate(self, request):
        account_id = request.session.get('account_id')
        
        if not account_id:
            return None
        
        try:
            account = Account.objects.get(id=account_id)
        except Account.DoesNotExist:
            raise AuthenticationFailed('Invalid session')
        
        if not account.is_active:
            raise AuthenticationFailed('Account is deactivated')
        
        return (account, None)


class JWTAuthentication(BaseAuthentication):
    """
    Simple JWT authentication using HS256 signed tokens containing `account_id`.
    Clients should send `Authorization: Bearer <token>`.
    """
    keyword = 'Bearer'

    def authenticate(self, request):
        auth_header = request.headers.get('Authorization') or request.META.get('HTTP_AUTHORIZATION')
        if not auth_header:
            return None

        parts = auth_header.split()
        if len(parts) != 2 or parts[0] != self.keyword:
            return None

        token = parts[1]
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=['HS256'])
        except jwt.ExpiredSignatureError:
            raise AuthenticationFailed('Token has expired')
        except Exception:
            raise AuthenticationFailed('Invalid token')

        account_id = payload.get('account_id')
        if not account_id:
            raise AuthenticationFailed('Invalid token payload')

        try:
            account = Account.objects.get(id=account_id)
        except Account.DoesNotExist:
            raise AuthenticationFailed('User not found')

        if not account.is_active:
            raise AuthenticationFailed('Account is deactivated')

        return (account, None)
