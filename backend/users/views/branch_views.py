from django.db import transaction
import re
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import Account, AccountAddress, AccountBranchLocation
from ..serializers import AccountAddressSerializer, AccountBranchLocationSerializer


class BranchUpsertSerializer(serializers.Serializer):
    lat = serializers.FloatField(required=False, allow_null=True)
    lng = serializers.FloatField(required=False, allow_null=True)
    formatted_address = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    barangay = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=100)
    label = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=50)
    branch_type = serializers.ChoiceField(required=False, allow_blank=True, allow_null=True, choices=[('mechanic', 'Mechanic'), ('shop_owner', 'Shop Owner')])


def _get_authenticated_account(request):
    user = getattr(request, 'user', None)
    if getattr(user, 'is_authenticated', False):
        return user

    account_id = request.session.get('account_id')
    if not account_id:
        return None

    return Account.objects.filter(id=account_id).first()


def _can_manage_branches(account):
    return hasattr(account, 'mechanic') or hasattr(account, 'shopowner')


def _branch_type_from_request(request):
    branch_type = request.query_params.get('branch_type') or request.data.get('branch_type')
    if branch_type in {'mechanic', 'shop_owner'}:
        return branch_type
    return None


def _has_meaningful_address(instance):
    if not instance:
        return False

    return any([
        getattr(instance, 'formatted_address', None),
        getattr(instance, 'lat', None) is not None,
        getattr(instance, 'lng', None) is not None,
        getattr(instance, 'barangay', None),
        getattr(instance, 'street_name', None),
        getattr(instance, 'city_municipality', None),
        getattr(instance, 'province', None),
        getattr(instance, 'region', None),
    ])


def _next_branch_label(account):
    max_index = 1
    for branch in account.branch_locations.all():
        match = re.match(r'^Branch\s+(\d+)$', (branch.label or '').strip(), re.IGNORECASE)
        if match:
            max_index = max(max_index, int(match.group(1)))
    return f'Branch {max_index + 1}'


def _renumber_branches(account):
    branches = list(account.branch_locations.order_by('created_at'))
    for index, branch in enumerate(branches, start=2):
        next_label = f'Branch {index}'
        if branch.label != next_label:
            branch.label = next_label
            branch.save(update_fields=['label', 'updated_at'])


def _serialize_addresses(account, branch_type=None):
    addresses = []

    main_address = getattr(account, 'accountaddress', None)
    if main_address:
        main_data = AccountAddressSerializer(main_address).data
        main_data['address_type'] = 'main'
        addresses.append(main_data)

    branches = account.branch_locations.order_by('created_at')
    for branch in branches:
        if branch_type and branch.branch_type != branch_type:
            continue
        branch_data = AccountBranchLocationSerializer(branch).data
        branch_data['address_type'] = 'branch'
        addresses.append(branch_data)

    return addresses


def _build_formatted_address(instance):
    if not instance:
        return None

    if getattr(instance, 'formatted_address', None):
        return instance.formatted_address

    parts = [
        getattr(instance, 'house_building_number', None),
        getattr(instance, 'street_name', None),
        getattr(instance, 'subdivision_village', None),
        getattr(instance, 'barangay', None),
        getattr(instance, 'city_municipality', None),
        getattr(instance, 'province', None),
        getattr(instance, 'region', None),
        getattr(instance, 'postal_code', None),
    ]
    label = ', '.join(str(part).strip() for part in parts if part and str(part).strip())
    return label or None


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def profile_branches(request):
    account = _get_authenticated_account(request)
    if not account:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    if not _can_manage_branches(account):
        return Response({'error': 'Branch management is only available for mechanics and shop owners'}, status=status.HTTP_400_BAD_REQUEST)

    branch_type = _branch_type_from_request(request)

    if request.method == 'GET':
        return Response({'addresses': _serialize_addresses(account, branch_type=branch_type)}, status=status.HTTP_200_OK)

    serializer = BranchUpsertSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    data = serializer.validated_data
    label = (data.get('label') or '').strip() or _next_branch_label(account)

    branch = AccountBranchLocation.objects.create(
        account=account,
        lat=data.get('lat'),
        lng=data.get('lng'),
        formatted_address=(data.get('formatted_address') or '').strip() or None,
        barangay=(data.get('barangay') or '').strip() or None,
        label=label,
        branch_type=data.get('branch_type') or branch_type,
        is_main=False,
    )

    _renumber_branches(account)

    return Response({
        'message': 'Branch added successfully',
        'branch': AccountBranchLocationSerializer(branch).data,
        'addresses': _serialize_addresses(account, branch_type=branch.branch_type),
    }, status=status.HTTP_201_CREATED)


@api_view(['PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def profile_branch_detail(request, branch_id):
    account = _get_authenticated_account(request)
    if not account:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    if not _can_manage_branches(account):
        return Response({'error': 'Branch management is only available for mechanics and shop owners'}, status=status.HTTP_400_BAD_REQUEST)

    branch = AccountBranchLocation.objects.filter(account=account, id=branch_id).first()
    if not branch:
        return Response({'error': 'Branch not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'DELETE':
        branch.delete()
        _renumber_branches(account)
        return Response({'message': 'Branch deleted successfully', 'addresses': _serialize_addresses(account, branch_type=branch.branch_type)}, status=status.HTTP_200_OK)

    serializer = BranchUpsertSerializer(data=request.data, partial=True)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    data = serializer.validated_data
    update_fields = []

    if 'lat' in data:
        branch.lat = data['lat']
        update_fields.append('lat')
    if 'lng' in data:
        branch.lng = data['lng']
        update_fields.append('lng')
    if 'formatted_address' in data:
        branch.formatted_address = (data['formatted_address'] or '').strip() or None
        update_fields.append('formatted_address')
    if 'barangay' in data:
        branch.barangay = (data['barangay'] or '').strip() or None
        update_fields.append('barangay')
    if 'label' in data and (data['label'] or '').strip():
        branch.label = (data['label'] or '').strip()
        update_fields.append('label')

    if update_fields:
        update_fields.append('updated_at')
        branch.save(update_fields=update_fields)

    _renumber_branches(account)

    return Response({
        'message': 'Branch updated successfully',
        'branch': AccountBranchLocationSerializer(branch).data,
        'addresses': _serialize_addresses(account, branch_type=branch.branch_type),
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def set_main_branch(request, branch_id):
    account = _get_authenticated_account(request)
    if not account:
        return Response({'error': 'Authentication required'}, status=status.HTTP_401_UNAUTHORIZED)

    if not _can_manage_branches(account):
        return Response({'error': 'Branch management is only available for mechanics and shop owners'}, status=status.HTTP_400_BAD_REQUEST)

    branch = AccountBranchLocation.objects.filter(account=account, id=branch_id).first()
    if not branch:
        return Response({'error': 'Branch not found'}, status=status.HTTP_404_NOT_FOUND)

    with transaction.atomic():
        main_address, _created = AccountAddress.objects.select_for_update().get_or_create(
            account=account,
            defaults={
                'street_name': branch.formatted_address or '',
                'barangay': branch.barangay or '',
                'city_municipality': branch.barangay or '',
                'province': branch.barangay or '',
                'region': branch.barangay or '',
                'label': 'Main Branch',
                'is_main': True,
            },
        )

        previous_main_snapshot = None
        if _has_meaningful_address(main_address):
            previous_main_snapshot = {
                'lat': main_address.lat,
                'lng': main_address.lng,
                'formatted_address': _build_formatted_address(main_address),
                'barangay': main_address.barangay,
            }

        main_address.lat = branch.lat
        main_address.lng = branch.lng
        main_address.formatted_address = branch.formatted_address
        main_address.barangay = branch.barangay or main_address.barangay
        main_address.label = 'Main Branch'
        main_address.is_main = True
        main_address.save()

        branch.delete()

        if previous_main_snapshot and previous_main_snapshot.get('formatted_address'):
            AccountBranchLocation.objects.create(
                account=account,
                lat=previous_main_snapshot.get('lat'),
                lng=previous_main_snapshot.get('lng'),
                formatted_address=previous_main_snapshot.get('formatted_address'),
                barangay=previous_main_snapshot.get('barangay'),
                label=_next_branch_label(account),
                branch_type=branch.branch_type,
                is_main=False,
            )

        _renumber_branches(account)

    return Response({
        'message': 'Main branch updated successfully',
        'addresses': _serialize_addresses(account),
    }, status=status.HTTP_200_OK)   