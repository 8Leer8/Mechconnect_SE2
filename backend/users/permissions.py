from rest_framework.permissions import BasePermission


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
        account_id = request.session.get('account_id')
        if not account_id:
            return False
        roles = request.session.get('roles', [])
        return 'client' in roles


class IsMechanic(BasePermission):
    """
    Permission to only allow mechanics.
    """
    def has_permission(self, request, view):
        account_id = request.session.get('account_id')
        if not account_id:
            return False
        roles = request.session.get('roles', [])
        return 'mechanic' in roles


class IsShopOwner(BasePermission):
    """
    Permission to only allow shop owners.
    """
    def has_permission(self, request, view):
        account_id = request.session.get('account_id')
        if not account_id:
            return False
        roles = request.session.get('roles', [])
        return 'shop_owner' in roles


class IsAdmin(BasePermission):
    """
    Permission to only allow admins.
    """
    def has_permission(self, request, view):
        account_id = request.session.get('account_id')
        if not account_id:
            return False
        roles = request.session.get('roles', [])
        return 'admin' in roles
