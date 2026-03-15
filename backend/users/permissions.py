from rest_framework.permissions import BasePermission


def _normalize_roles(roles):
    if not isinstance(roles, (list, tuple)):
        return []

    normalized = []
    for role_item in roles:
        if isinstance(role_item, str):
            normalized.append(role_item)
        elif isinstance(role_item, dict) and isinstance(role_item.get('account_role'), str):
            normalized.append(role_item['account_role'])
    return normalized


def _has_role(request, expected_role):
    account_id = request.session.get('account_id')
    user = getattr(request, 'user', None)

    if not account_id and getattr(user, 'is_authenticated', False):
        account_id = getattr(user, 'id', None)

    if not account_id:
        return False

    roles = _normalize_roles(request.session.get('roles', []))
    active_role = request.session.get('active_role')

    if expected_role in roles:
        return True

    # Accept active role only for session-authenticated requests.
    if request.session.get('account_id') and active_role == expected_role:
        return True

    # Fallback to DB when session roles are stale or incomplete.
    from .models import AccountRole

    has_db_role = AccountRole.objects.filter(
        account_id=account_id,
        account_role=expected_role,
    ).exists()

    if has_db_role:
        if expected_role not in roles:
            roles.append(expected_role)
            request.session['roles'] = roles
            request.session.modified = True
        return True

    return False


class IsAccountOwner(BasePermission):
    """
    Permission to only allow owners of an account to access it.
    """
    def has_object_permission(self, request, view, obj):
        account_id = request.session.get('account_id')
        return obj.id == account_id


class IsClient(BasePermission):
    """
    Permission to only allow clients.
    """
    def has_permission(self, request, view):
        return _has_role(request, 'client')


class IsMechanic(BasePermission):
    """
    Permission to only allow mechanics.
    """
    def has_permission(self, request, view):
        return _has_role(request, 'mechanic')


class IsShopOwner(BasePermission):
    """
    Permission to only allow shop owners.
    """
    def has_permission(self, request, view):
        return _has_role(request, 'shop_owner')


class IsAdmin(BasePermission):
    """
    Permission to only allow admins.
    """
    def has_permission(self, request, view):
        return _has_role(request, 'admin')
