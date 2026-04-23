from django.db.models import Count, Q, Sum
from django.core.exceptions import ObjectDoesNotExist
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework import status

from ...models import (
    Account,
    AccountAddress,
    AccountRole,
    AccountBan,
    ReportAccount,
    TokenPurchase,
    TokenTransaction,
    Client,
    Mechanic,
    ShopOwner,
    Admin,
    MechanicDocument,
)
from ...permissions import IsAdmin
from ...serializers import AdminCreationSerializer
from shops.models import Shop, ShopDocument, ShopOwnerDocument
from services.models import MechanicSpecialty, ShopSpecialty


def _to_bool(value):
    if value is None:
        return None
    return str(value).strip().lower() in {'1', 'true', 'yes'}


def _to_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _safe_related(instance, relation_name):
    try:
        return getattr(instance, relation_name)
    except ObjectDoesNotExist:
        return None


def _file_url(file_field):
    if not file_field:
        return None
    try:
        return file_field.url
    except ValueError:
        return None


def _serialize_uploaded_document(document):
    return {
        'id': document.id,
        'document_name': document.document_name,
        'document_type': document.document_type,
        'document_url': _file_url(document.document_file),
        'date_issued': document.date_issued,
        'date_expiry': document.date_expiry,
        'uploaded_at': document.uploaded_at,
    }


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_user_overview(request):
    role_counts_map = {
        row['account_role']: row['total']
        for row in AccountRole.objects.values('account_role').annotate(total=Count('id'))
    }

    data = {
        'accounts_total': Account.objects.count(),
        'verified_accounts': Account.objects.filter(is_verified=True).count(),
        'active_accounts': Account.objects.filter(is_active=True).count(),
        'banned_accounts': AccountBan.objects.count(),
        'reports_pending': ReportAccount.objects.filter(status=ReportAccount.Status.PENDING).count(),
        'roles': {
            'client': role_counts_map.get('client', 0),
            'mechanic': role_counts_map.get('mechanic', 0),
            'shop_owner': role_counts_map.get('shop_owner', 0),
            'admin': role_counts_map.get('admin', 0),
        },
    }

    return Response(data, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_list_accounts(request):
    queryset = (
        Account.objects.all()
        .prefetch_related(
            'accountrole_set',
            'mechanic__mechanic_services__service',
            'mechanic__mechanicspecialty_set__specialty',
            'shopowner__shop__shopservice_set__service',
            'shopowner__shop__shopspecialty_set__specialty',
            'shopowner__shop__shopmechanic_set__mechanic__account',
            'shopowner__shop__mechanics__account',
        )
        .select_related('accountaddress', 'client', 'mechanic', 'mechanic__shop', 'shopowner', 'shopowner__shop', 'admin')
        .order_by('-id')
    )

    q = request.GET.get('q')
    role = request.GET.get('role')
    is_active = _to_bool(request.GET.get('is_active'))
    is_verified = _to_bool(request.GET.get('is_verified'))

    if q:
        queryset = queryset.filter(
            Q(username__icontains=q)
            | Q(email__icontains=q)
            | Q(firstname__icontains=q)
            | Q(lastname__icontains=q)
        )

    if role:
        queryset = queryset.filter(accountrole__account_role=role)

    if is_active is not None:
        queryset = queryset.filter(is_active=is_active)

    if is_verified is not None:
        queryset = queryset.filter(is_verified=is_verified)

    queryset = queryset.distinct()[:200]

    data = []
    for account in queryset:
        roles = list(account.accountrole_set.values_list('account_role', flat=True))

        client_profile = _safe_related(account, 'client')
        mechanic_profile = _safe_related(account, 'mechanic')
        shop_owner_profile = _safe_related(account, 'shopowner')
        admin_profile = _safe_related(account, 'admin')
        address = _safe_related(account, 'accountaddress')
        shop_profile = _safe_related(shop_owner_profile, 'shop') if shop_owner_profile else None

        mechanic_services = []
        mechanic_specialties = []
        if mechanic_profile:
            mechanic_services = [
                {
                    'id': mechanic_service.service_id,
                    'name': mechanic_service.service.name if mechanic_service.service else None,
                    'price': mechanic_service.price,
                }
                for mechanic_service in mechanic_profile.mechanic_services.all()
            ]

            mechanic_specialties = [
                {
                    'id': mechanic_specialty.specialty_id,
                    'name': mechanic_specialty.specialty.name if mechanic_specialty.specialty else None,
                    'status': mechanic_specialty.status,
                    'requested_at': mechanic_specialty.requested_at,
                    'approved_at': mechanic_specialty.approved_at,
                }
                for mechanic_specialty in mechanic_profile.mechanicspecialty_set.all()
            ]

        shop_services = []
        shop_specialties = []
        shop_mechanics = []
        if shop_profile:
            shop_services = [
                {
                    'id': shop_service.service_id,
                    'name': shop_service.service.name if shop_service.service else None,
                    'price': shop_service.price,
                }
                for shop_service in shop_profile.shopservice_set.all()
            ]

            shop_specialties = [
                {
                    'id': shop_specialty.specialty_id,
                    'name': shop_specialty.specialty.name if shop_specialty.specialty else None,
                    'status': shop_specialty.status,
                    'requested_at': shop_specialty.requested_at,
                    'approved_at': shop_specialty.approved_at,
                }
                for shop_specialty in shop_profile.shopspecialty_set.all()
            ]

            mechanics_map = {}
            for shop_assignment in shop_profile.shopmechanic_set.all():
                assigned_mechanic = shop_assignment.mechanic
                if not assigned_mechanic or not assigned_mechanic.account:
                    continue

                mechanics_map[assigned_mechanic.account_id] = {
                    'account_id': assigned_mechanic.account_id,
                    'username': assigned_mechanic.account.username,
                    'name': f"{assigned_mechanic.account.firstname} {assigned_mechanic.account.lastname}".strip(),
                    'status': assigned_mechanic.status,
                    'average_rating': assigned_mechanic.average_rating,
                    'working_for_shop': assigned_mechanic.is_working_for_shop,
                    'joined_at': shop_assignment.date_joined,
                }

            for assigned_mechanic in shop_profile.mechanics.all():
                if not assigned_mechanic.account:
                    continue

                mechanics_map.setdefault(
                    assigned_mechanic.account_id,
                    {
                        'account_id': assigned_mechanic.account_id,
                        'username': assigned_mechanic.account.username,
                        'name': f"{assigned_mechanic.account.firstname} {assigned_mechanic.account.lastname}".strip(),
                        'status': assigned_mechanic.status,
                        'average_rating': assigned_mechanic.average_rating,
                        'working_for_shop': assigned_mechanic.is_working_for_shop,
                        'joined_at': None,
                    },
                )

            shop_mechanics = sorted(mechanics_map.values(), key=lambda item: (item.get('username') or '').lower())

        role_profiles = {
            'client': {
                'contact_number': client_profile.contact_number if client_profile else None,
                'profile_photo': _file_url(client_profile.profile_photo) if client_profile else None,
            },
            'mechanic': {
                'contact_number': mechanic_profile.contact_number if mechanic_profile else None,
                'profile_photo': _file_url(mechanic_profile.profile_photo) if mechanic_profile else None,
                'status': mechanic_profile.status if mechanic_profile else None,
                'average_rating': mechanic_profile.average_rating if mechanic_profile else None,
                'is_working_for_shop': mechanic_profile.is_working_for_shop if mechanic_profile else None,
                'tokens_balance': mechanic_profile.tokens_balance if mechanic_profile else None,
                'services': mechanic_services,
                'specialties': mechanic_specialties,
            },
            'shop_owner': {
                'contact_number': shop_owner_profile.contact_number if shop_owner_profile else None,
                'profile_photo': _file_url(shop_owner_profile.profile_photo) if shop_owner_profile else None,
                'owns_shop': shop_owner_profile.owns_shop if shop_owner_profile else None,
                'shop': {
                    'id': shop_profile.id,
                    'shop_name': shop_profile.shop_name,
                    'status': shop_profile.status,
                    'is_verified': shop_profile.is_verified,
                    'contact_number': shop_profile.contact_number,
                    'email': shop_profile.email,
                    'website': shop_profile.website,
                    'description': shop_profile.description,
                    'created_at': shop_profile.created_at,
                    'services': shop_services,
                    'specialties': shop_specialties,
                    'mechanics': shop_mechanics,
                }
                if shop_profile
                else None,
            },
            'admin': {
                'contact_number': admin_profile.contact_number if admin_profile else None,
                'profile_photo': _file_url(admin_profile.profile_photo) if admin_profile else None,
            },
        }

        primary_profile_photo = (
            role_profiles.get('mechanic', {}).get('profile_photo')
            or role_profiles.get('shop_owner', {}).get('profile_photo')
            or role_profiles.get('client', {}).get('profile_photo')
            or role_profiles.get('admin', {}).get('profile_photo')
        )

        primary_contact_number = (
            role_profiles.get('mechanic', {}).get('contact_number')
            or role_profiles.get('shop_owner', {}).get('contact_number')
            or role_profiles.get('client', {}).get('contact_number')
            or role_profiles.get('admin', {}).get('contact_number')
        )

        data.append(
            {
                'id': account.id,
                'username': account.username,
                'email': account.email,
                'firstname': account.firstname,
                'middlename': account.middlename,
                'lastname': account.lastname,
                'date_of_birth': account.date_of_birth,
                'gender': account.gender,
                'is_active': account.is_active,
                'is_verified': account.is_verified,
                'last_active_role': account.last_active_role,
                'roles': roles,
                'last_login': account.last_login,
                'profile_photo': primary_profile_photo,
                'contact_number': primary_contact_number,
                'role_profiles': role_profiles,
                'address': {
                    'house_building_number': address.house_building_number,
                    'street_name': address.street_name,
                    'subdivision_village': address.subdivision_village,
                    'barangay': address.barangay,
                    'city_municipality': address.city_municipality,
                    'province': address.province,
                    'region': address.region,
                    'postal_code': address.postal_code,
                }
                if address
                else None,
            }
        )

    return Response({'count': len(data), 'results': data}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_verification_queue(request):
    mechanic_queryset = (
        Mechanic.objects.select_related('account')
        .prefetch_related('mechanicdocument_set')
        .filter(verification_status=Mechanic.VerificationStatus.PENDING)
        .order_by('-id')
    )

    shop_queryset = (
        Shop.objects.select_related('shop_owner__account')
        .prefetch_related('shopdocument_set', 'shop_owner__shopownerdocument_set')
        .filter(
            Q(is_verified=False)
            | Q(shop_owner__verification_status=ShopOwner.VerificationStatus.PENDING)
        )
        .order_by('-id')
    )

    mechanic_specialty_queryset = (
        MechanicSpecialty.objects.select_related('mechanic__account', 'specialty')
        .filter(status=MechanicSpecialty.Status.PENDING)
        .order_by('-requested_at')
    )

    shop_specialty_queryset = (
        ShopSpecialty.objects.select_related('shop__shop_owner__account', 'specialty')
        .filter(status=ShopSpecialty.Status.PENDING)
        .order_by('-requested_at')
    )

    mechanic_results = []
    for mechanic in mechanic_queryset[:100]:
        account = mechanic.account
        documents = [_serialize_uploaded_document(doc) for doc in mechanic.mechanicdocument_set.all()[:20]]

        mechanic_results.append(
            {
                'id': mechanic.id,
                'type': 'mechanic',
                'target_type': 'mechanic',
                'account_id': account.id,
                'username': account.username,
                'email': account.email,
                'firstname': account.firstname,
                'lastname': account.lastname,
                'contact_number': mechanic.contact_number,
                'verification_status': mechanic.verification_status,
                'requested_at': mechanic.created_at,
                'documents': documents,
                'documents_count': len(documents),
            }
        )

    shop_results = []
    for shop in shop_queryset[:100]:
        owner = shop.shop_owner
        owner_account = owner.account
        shop_documents = [_serialize_uploaded_document(doc) for doc in shop.shopdocument_set.all()[:20]]
        owner_documents = [_serialize_uploaded_document(doc) for doc in owner.shopownerdocument_set.all()[:20]]

        shop_results.append(
            {
                'id': shop.id,
                'type': 'shop',
                'target_type': 'shop',
                'shop_name': shop.shop_name,
                'owner_username': owner_account.username,
                'owner_firstname': owner_account.firstname,
                'owner_lastname': owner_account.lastname,
                'email': shop.email,
                'contact_number': shop.contact_number,
                'status': shop.status,
                'verification_status': owner.verification_status,
                'created_at': shop.created_at,
                'shop_documents': shop_documents,
                'owner_documents': owner_documents,
                'shop_documents_count': len(shop_documents),
                'owner_documents_count': len(owner_documents),
            }
        )

    specialty_results = []

    for entry in mechanic_specialty_queryset[:100]:
        specialty_results.append(
            {
                'id': entry.id,
                'type': 'specialty',
                'target_type': 'specialty_mechanic',
                'provider_kind': 'mechanic',
                'provider_name': entry.mechanic.account.username,
                'provider_email': entry.mechanic.account.email,
                'specialty_name': entry.specialty.name,
                'specialty_description': entry.specialty.description,
                'source_type': entry.source_type,
                'source_description': entry.source_description,
                'proof_document_url': _file_url(entry.proof_document),
                'status': entry.status,
                'requested_at': entry.requested_at,
                'rejection_reason': entry.rejection_reason,
            }
        )

    for entry in shop_specialty_queryset[:100]:
        specialty_results.append(
            {
                'id': entry.id,
                'type': 'specialty',
                'target_type': 'specialty_shop',
                'provider_kind': 'shop',
                'provider_name': entry.shop.shop_name,
                'provider_email': entry.shop.email,
                'specialty_name': entry.specialty.name,
                'specialty_description': entry.specialty.description,
                'source_type': entry.source_type,
                'source_description': entry.source_description,
                'proof_document_url': _file_url(entry.proof_document),
                'status': entry.status,
                'requested_at': entry.requested_at,
                'rejection_reason': entry.rejection_reason,
            }
        )

    specialty_results.sort(key=lambda row: row.get('requested_at') or timezone.now(), reverse=True)

    return Response(
        {
            'mechanics_pending': len(mechanic_results),
            'shops_pending': len(shop_results),
            'specialties_pending': len(specialty_results),
            'mechanic_results': mechanic_results,
            'shop_results': shop_results,
            'specialty_results': specialty_results,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([IsAdmin])
def admin_verification_decision(request):
    target_type = str(request.data.get('target_type') or '').strip().lower()
    decision = str(request.data.get('decision') or '').strip().lower()
    target_id = request.data.get('target_id')
    rejection_note = str(request.data.get('rejection_note') or '').strip()

    if decision not in {'approve', 'reject'}:
        return Response({'error': 'Invalid decision value.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        target_id = int(target_id)
    except (TypeError, ValueError):
        return Response({'error': 'Invalid target_id.'}, status=status.HTTP_400_BAD_REQUEST)

    is_approve = decision == 'approve'
    decision_label = 'approved' if is_approve else 'rejected'

    if target_type == 'mechanic':
        try:
            mechanic = Mechanic.objects.select_related('account').get(pk=target_id)
        except Mechanic.DoesNotExist:
            return Response({'error': 'Mechanic not found.'}, status=status.HTTP_404_NOT_FOUND)

        mechanic.verification_status = (
            Mechanic.VerificationStatus.APPROVED if is_approve else Mechanic.VerificationStatus.REJECTED
        )
        mechanic.rejection_note = '' if is_approve else rejection_note
        mechanic.verified_at = timezone.now() if is_approve else None
        mechanic.save(update_fields=['verification_status', 'rejection_note', 'verified_at'])

        mechanic.account.is_verified = is_approve
        mechanic.account.save(update_fields=['is_verified'])

        if not is_approve:
            for existing_doc in MechanicDocument.objects.filter(mechanic=mechanic):
                if existing_doc.document_file:
                    existing_doc.document_file.delete(save=False)
            MechanicDocument.objects.filter(mechanic=mechanic).delete()

        return Response({'message': f'Mechanic verification {decision_label} successfully.'}, status=status.HTTP_200_OK)

    if target_type == 'shop':
        try:
            shop = Shop.objects.select_related('shop_owner__account').get(pk=target_id)
        except Shop.DoesNotExist:
            return Response({'error': 'Shop not found.'}, status=status.HTTP_404_NOT_FOUND)

        shop.is_verified = is_approve
        shop.save(update_fields=['is_verified'])

        owner = shop.shop_owner
        owner.verification_status = (
            ShopOwner.VerificationStatus.APPROVED if is_approve else ShopOwner.VerificationStatus.REJECTED
        )
        owner.rejection_note = '' if is_approve else rejection_note
        owner.verified_at = timezone.now() if is_approve else None
        owner.save(update_fields=['verification_status', 'rejection_note', 'verified_at'])

        owner.account.is_verified = is_approve
        owner.account.save(update_fields=['is_verified'])

        if not is_approve:
            for existing_doc in ShopDocument.objects.filter(shop=shop):
                if existing_doc.document_file:
                    existing_doc.document_file.delete(save=False)
            ShopDocument.objects.filter(shop=shop).delete()

            for existing_doc in ShopOwnerDocument.objects.filter(shop_owner=owner):
                if existing_doc.document_file:
                    existing_doc.document_file.delete(save=False)
            ShopOwnerDocument.objects.filter(shop_owner=owner).delete()

        return Response({'message': f'Shop verification {decision_label} successfully.'}, status=status.HTTP_200_OK)

    if target_type == 'specialty_mechanic':
        try:
            entry = MechanicSpecialty.objects.get(pk=target_id)
        except MechanicSpecialty.DoesNotExist:
            return Response({'error': 'Mechanic specialty request not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not is_approve and not rejection_note:
            return Response({'error': 'Rejection reason is required.'}, status=status.HTTP_400_BAD_REQUEST)

        entry.status = MechanicSpecialty.Status.APPROVED if is_approve else MechanicSpecialty.Status.REJECTED
        entry.rejection_reason = '' if is_approve else rejection_note
        entry.approved_at = timezone.now() if is_approve else None
        entry.full_clean()
        entry.save(update_fields=['status', 'rejection_reason', 'approved_at'])

        return Response({'message': f'Mechanic specialty {decision_label} successfully.'}, status=status.HTTP_200_OK)

    if target_type == 'specialty_shop':
        try:
            entry = ShopSpecialty.objects.get(pk=target_id)
        except ShopSpecialty.DoesNotExist:
            return Response({'error': 'Shop specialty request not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not is_approve and not rejection_note:
            return Response({'error': 'Rejection reason is required.'}, status=status.HTTP_400_BAD_REQUEST)

        entry.status = ShopSpecialty.Status.APPROVED if is_approve else ShopSpecialty.Status.REJECTED
        entry.rejection_reason = '' if is_approve else rejection_note
        entry.approved_at = timezone.now() if is_approve else None
        entry.full_clean()
        entry.save(update_fields=['status', 'rejection_reason', 'approved_at'])

        return Response({'message': f'Shop specialty {decision_label} successfully.'}, status=status.HTTP_200_OK)

    return Response({'error': 'Unsupported target_type.'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_list_reports(request):
    queryset = ReportAccount.objects.select_related('reporter', 'reported').order_by('-reported_at')

    q = request.GET.get('q')
    status_filter = request.GET.get('status')

    if q:
        queryset = queryset.filter(
            Q(reason__icontains=q)
            | Q(reporter__username__icontains=q)
            | Q(reported__username__icontains=q)
        )

    if status_filter in {
        ReportAccount.Status.PENDING,
        ReportAccount.Status.REVIEWED,
        ReportAccount.Status.ACTION_TAKEN,
    }:
        queryset = queryset.filter(status=status_filter)

    queryset = queryset[:200]

    results = []
    for report in queryset:
        results.append(
            {
                'id': report.id,
                'reporter_id': report.reporter_id,
                'reporter_username': report.reporter.username,
                'reported_id': report.reported_id,
                'reported_username': report.reported.username,
                'reason': report.reason,
                'status': report.status,
                'reported_at': report.reported_at,
                'reviewed_at': report.reviewed_at,
                'admin_action_notes': report.admin_action_notes,
            }
        )

    return Response({'count': len(results), 'results': results}, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_wallet_overview(request):
    transaction_agg = TokenTransaction.objects.aggregate(total_tokens=Sum('tokens'))
    purchase_agg = TokenPurchase.objects.aggregate(total_purchased=Sum('tokens_amount'))

    data = {
        'token_purchases_total': TokenPurchase.objects.count(),
        'transactions_total': TokenTransaction.objects.count(),
        'pending_purchases': TokenPurchase.objects.filter(status='pending').count(),
        'total_tokens_purchased': purchase_agg.get('total_purchased') or 0,
        'net_tokens_moved': transaction_agg.get('total_tokens') or 0,
    }
    return Response(data, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAdmin])
def admin_list_wallet_transactions(request):
    queryset = TokenTransaction.objects.select_related('account').order_by('-created_at')

    q = request.GET.get('q')
    reason = request.GET.get('reason')
    limit = max(1, min(_to_int(request.GET.get('limit'), 200), 500))

    if q:
        queryset = queryset.filter(
            Q(account__username__icontains=q)
            | Q(reason__icontains=q)
        )

    if reason:
        queryset = queryset.filter(reason__icontains=reason)

    queryset = queryset[:limit]

    results = []
    for transaction in queryset:
        results.append(
            {
                'id': transaction.id,
                'account_id': transaction.account_id,
                'account_username': transaction.account.username,
                'tokens': transaction.tokens,
                'reason': transaction.reason,
                'related_booking_id': transaction.related_booking_id,
                'created_at': transaction.created_at,
            }
        )

    return Response({'count': len(results), 'results': results}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAdmin])
def create_admin(request):
    """
    Create a new admin user (superadmin only).
    Only authenticated superadmins can create new admin accounts.
    """
    # Check if the requesting user is a superadmin
    account_id = request.session.get('account_id')
    if not account_id:
        return Response(
            {'error': 'Authentication required'},
            status=status.HTTP_401_UNAUTHORIZED
        )
    
    try:
        requesting_admin = Admin.objects.get(account_id=account_id)
        if not requesting_admin.is_superadmin:
            return Response(
                {'error': 'Only superadmins can create admin accounts'},
                status=status.HTTP_403_FORBIDDEN
            )
    except Admin.DoesNotExist:
        return Response(
            {'error': 'Admin profile not found'},
            status=status.HTTP_403_FORBIDDEN
        )
    
    # Validate and create the new admin
    from ...serializers import AdminCreationSerializer
    serializer = AdminCreationSerializer(data=request.data)
    if serializer.is_valid():
        account = serializer.save()
        return Response({
            'message': 'Admin created successfully',
            'account_id': account.id,
            'email': account.email,
            'role': account.role,
        }, status=status.HTTP_201_CREATED)
    
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
