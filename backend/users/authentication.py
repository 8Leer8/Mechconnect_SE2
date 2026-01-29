from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from .models import Account


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
