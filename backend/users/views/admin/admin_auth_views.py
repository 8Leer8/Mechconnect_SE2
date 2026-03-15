from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from datetime import datetime, timedelta
import jwt
from django.conf import settings

from ...models import Account
from ...serializers import LoginSerializer, AccountSerializer


def _is_admin_account(account):
    return account.accountrole_set.filter(account_role='admin').exists()


def _create_access_token(account_id):
    exp = datetime.utcnow() + timedelta(minutes=60)
    payload = {
        'account_id': account_id,
        'exp': exp,
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')
    return token, exp


@api_view(['POST'])
@permission_classes([AllowAny])
def admin_login(request):
    serializer = LoginSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    account = serializer.validated_data['account']

    if not _is_admin_account(account):
        request.session.flush()
        return Response(
            {'error': 'Admin access is required for this portal.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    request.session['account_id'] = account.id
    request.session['username'] = account.username
    request.session['roles'] = list(account.accountrole_set.values_list('account_role', flat=True))
    request.session['active_role'] = 'admin'

    token, exp = _create_access_token(account.id)

    return Response(
        {
            'message': 'Admin login successful',
            'account': AccountSerializer(account).data,
            'active_role': 'admin',
            'token': token,
            'expires_at': exp.isoformat(),
        },
        status=status.HTTP_200_OK,
    )


@api_view(['GET'])
@permission_classes([AllowAny])
def admin_check_session(request):
    account_id = request.session.get('account_id')
    roles = request.session.get('roles', [])

    account = None

    # Primary path: cookie-backed admin session.
    if account_id and 'admin' in roles:
        try:
            account = Account.objects.get(id=account_id)
        except Account.DoesNotExist:
            request.session.flush()
            return Response({'authenticated': False}, status=status.HTTP_401_UNAUTHORIZED)

        if not _is_admin_account(account):
            request.session.flush()
            return Response({'authenticated': False}, status=status.HTTP_401_UNAUTHORIZED)

    # Fallback path: JWT-authenticated admin (for cross-host cookie issues).
    if account is None:
        user = getattr(request, 'user', None)
        if not user or not getattr(user, 'is_authenticated', False):
            return Response({'authenticated': False}, status=status.HTTP_401_UNAUTHORIZED)

        candidate_id = getattr(user, 'id', None)
        if not candidate_id:
            return Response({'authenticated': False}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            account = Account.objects.get(id=candidate_id)
        except Account.DoesNotExist:
            return Response({'authenticated': False}, status=status.HTTP_401_UNAUTHORIZED)

        if not _is_admin_account(account):
            return Response({'authenticated': False}, status=status.HTTP_401_UNAUTHORIZED)

        # Rehydrate session so subsequent requests can also work with cookies.
        request.session['account_id'] = account.id
        request.session['username'] = account.username
        request.session['roles'] = list(account.accountrole_set.values_list('account_role', flat=True))

    request.session['active_role'] = 'admin'

    return Response(
        {
            'authenticated': True,
            'account': AccountSerializer(account).data,
            'active_role': 'admin',
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def admin_logout(request):
    request.session.flush()
    return Response({'message': 'Admin logout successful'}, status=status.HTTP_200_OK)
