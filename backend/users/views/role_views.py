from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

from ..models import Account, Mechanic, ShopOwner, AccountRole, ShopEmployee
from ..serializers import MechanicSerializer, ShopOwnerSerializer


@api_view(['POST'])
@permission_classes([AllowAny])
def switch_role(request):
    """
    Switch active role for the user
    User can switch between client, mechanic, or shop_owner if they have multiple roles
    
    Required fields:
    - role: 'client', 'mechanic', or 'shop_owner'
    
    Updates session with new active role
    """
    # Get account_id from session
    account_id = request.session.get('account_id')
    
    if not account_id:
        return Response({
            'error': 'Authentication required'
        }, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        account = Account.objects.get(id=account_id)
        
        from ..serializers import RoleSwitchSerializer
        serializer = RoleSwitchSerializer(
            data=request.data,
            context={'account': account}
        )
        
        if serializer.is_valid():
            new_role = serializer.validated_data['role']

            # Enforce admin approval before allowing privileged role switches.
            if new_role == 'mechanic':
                if not hasattr(account, 'mechanic'):
                    return Response({
                        'error': 'Mechanic profile not found. Please register first.'
                    }, status=status.HTTP_400_BAD_REQUEST)

                verification_status = account.mechanic.verification_status
                if verification_status != Mechanic.VerificationStatus.APPROVED:
                    if verification_status == Mechanic.VerificationStatus.PENDING:
                        message = 'Your mechanic application is pending admin approval.'
                    elif verification_status == Mechanic.VerificationStatus.REJECTED:
                        message = 'Your mechanic application was rejected. Please contact admin.'
                    else:
                        message = 'Mechanic role is not yet approved.'

                    return Response({'error': message}, status=status.HTTP_403_FORBIDDEN)

            if new_role == 'shop_owner':
                if not hasattr(account, 'shopowner'):
                    return Response({
                        'error': 'Shop owner profile not found. Please register first.'
                    }, status=status.HTTP_400_BAD_REQUEST)

                verification_status = account.shopowner.verification_status
                if verification_status != ShopOwner.VerificationStatus.APPROVED:
                    if verification_status == ShopOwner.VerificationStatus.PENDING:
                        message = 'Your shop owner application is pending admin approval.'
                    elif verification_status == ShopOwner.VerificationStatus.REJECTED:
                        message = 'Your shop owner application was rejected. Please contact admin.'
                    else:
                        message = 'Shop owner role is not yet approved.'

                    return Response({'error': message}, status=status.HTTP_403_FORBIDDEN)

            if new_role == 'shop_employee':
                if not hasattr(account, 'shopemployee'):
                    return Response({
                        'error': 'Shop employee profile not found. Please register first.'
                    }, status=status.HTTP_400_BAD_REQUEST)

                # Shop employees don't need admin approval, they can switch immediately
            
            # Update session with new active role
            request.session['active_role'] = new_role
            request.session.modified = True
            
            # Save the active role to the Account model for persistence
            account.last_active_role = new_role
            account.save(update_fields=['last_active_role'])
            
            # Get profile data for new role
            profile_data = None
            if new_role == 'client' and hasattr(account, 'client'):
                from ..serializers import ClientSerializer
                profile_data = ClientSerializer(account.client).data
            elif new_role == 'mechanic' and hasattr(account, 'mechanic'):
                from ..serializers import MechanicSerializer
                profile_data = MechanicSerializer(account.mechanic).data
            elif new_role == 'shop_owner' and hasattr(account, 'shopowner'):
                from ..serializers import ShopOwnerSerializer
                profile_data = ShopOwnerSerializer(account.shopowner).data
            elif new_role == 'shop_employee' and hasattr(account, 'shopemployee'):
                from ..serializers import ShopEmployeeSerializer
                profile_data = ShopEmployeeSerializer(account.shopemployee).data
            
            return Response({
                'message': f'Successfully switched to {new_role} role',
                'active_role': new_role,
                'profile': profile_data
            }, status=status.HTTP_200_OK)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
    except Account.DoesNotExist:
        return Response({
            'error': 'Account not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_active_role(request):
    """
    Get the currently active role from session
    """
    # Get account_id from session
    account_id = request.session.get('account_id')
    
    if not account_id:
        return Response({
            'error': 'Authentication required'
        }, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        active_role = request.session.get('active_role')
        roles = request.session.get('roles', [])
        
        # If no active role is set, use the first available role
        if not active_role and roles:
            active_role = roles[0]
            request.session['active_role'] = active_role
        
        return Response({
            'active_role': active_role,
            'available_roles': roles
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_role_status(request):
    """
    Get role registration status for the current user
    Returns whether the user is registered as mechanic, shop owner, or client
    """
    # Get account_id from session
    account_id = request.session.get('account_id')
    
    if not account_id:
        return Response({
            'error': 'Authentication required'
        }, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        account = Account.objects.get(id=account_id)
        
        # Check if user has profiles for each role
        is_client = hasattr(account, 'client')
        is_mechanic = hasattr(account, 'mechanic')
        is_shop_owner = hasattr(account, 'shopowner')
        is_shop_employee = hasattr(account, 'shopemployee')

        mechanic_verification_status = (
            account.mechanic.verification_status if is_mechanic else None
        )
        mechanic_rejection_note = (
            account.mechanic.rejection_note if is_mechanic else None
        )
        shop_owner_verification_status = (
            account.shopowner.verification_status if is_shop_owner else None
        )
        shop_owner_rejection_note = (
            account.shopowner.rejection_note if is_shop_owner else None
        )

        can_switch_mechanic = bool(
            is_mechanic
            and mechanic_verification_status == Mechanic.VerificationStatus.APPROVED
        )
        can_switch_shop_owner = bool(
            is_shop_owner
            and shop_owner_verification_status == ShopOwner.VerificationStatus.APPROVED
        )
        can_switch_shop_employee = bool(is_shop_employee)

        pending_approvals = []
        if mechanic_verification_status == Mechanic.VerificationStatus.PENDING:
            pending_approvals.append('mechanic')
        if shop_owner_verification_status == ShopOwner.VerificationStatus.PENDING:
            pending_approvals.append('shop_owner')
        
        # Get shop employee shop info
        shop_employee_shop_name = None
        shop_employee_shop_id = None
        if is_shop_employee and account.shopemployee.shop:
            shop_employee_shop_name = account.shopemployee.shop.shop_name
            shop_employee_shop_id = account.shopemployee.shop.id

        # Get active role from session
        active_role = request.session.get('active_role')

        # Get all roles from AccountRole
        roles = list(account.accountrole_set.values_list('account_role', flat=True))
        
        # If no active role is set, use the first available role or default to client
        if not active_role and roles:
            active_role = roles[0]
            request.session['active_role'] = active_role
        elif not active_role:
            active_role = 'client'
        
        return Response({
            'is_client': is_client,
            'is_mechanic': is_mechanic,
            'is_shop_owner': is_shop_owner,
            'is_shop_employee': is_shop_employee,
            'active_role': active_role,
            'registered_roles': roles,
            'mechanic_verification_status': mechanic_verification_status,
            'mechanic_rejection_note': mechanic_rejection_note,
            'shop_owner_verification_status': shop_owner_verification_status,
            'shop_owner_rejection_note': shop_owner_rejection_note,
            'can_switch_mechanic': can_switch_mechanic,
            'can_switch_shop_owner': can_switch_shop_owner,
            'can_switch_shop_employee': can_switch_shop_employee,
            'pending_approvals': pending_approvals,
            'shop_employee_shop_name': shop_employee_shop_name,
            'shop_employee_shop_id': shop_employee_shop_id,
        }, status=status.HTTP_200_OK)
        
    except Account.DoesNotExist:
        return Response({
            'error': 'Account not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def register_mechanic(request):
    """
    Register the current user as a mechanic
    Creates a Mechanic profile and adds mechanic role to AccountRole
    
    Required fields:
    - contact_number: string
    
    Optional fields:
    - bio: text (mechanic's bio/description)
    - profile_photo: image file
    - documents: array of document objects with:
        - document_name: string
        - document_type: string (license, certification, id, others)
        - document_file: file
        - date_issued: date (optional)
        - date_expiry: date (optional)
    """
    # Get account_id from session
    account_id = request.session.get('account_id')
    
    if not account_id:
        return Response({
            'error': 'Authentication required'
        }, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        account = Account.objects.get(id=account_id)
        
        existing_mechanic = account.mechanic if hasattr(account, 'mechanic') else None
        is_reapplication = bool(existing_mechanic)

        if existing_mechanic and existing_mechanic.verification_status != Mechanic.VerificationStatus.REJECTED:
            return Response({
                'error': 'Already registered as mechanic'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate required fields
        contact_number = request.data.get('contact_number')
        if not contact_number:
            return Response({
                'error': 'Contact number is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get optional bio field
        bio = request.data.get('bio')
        
        if existing_mechanic:
            mechanic = existing_mechanic
            mechanic.contact_number = contact_number
            if request.FILES.get('profile_photo'):
                mechanic.profile_photo = request.FILES.get('profile_photo')
            mechanic.bio = bio if bio else None
            mechanic.verification_status = Mechanic.VerificationStatus.PENDING
            mechanic.rejection_note = ''
            mechanic.verified_at = None
            mechanic.save(
                update_fields=[
                    'contact_number',
                    'profile_photo',
                    'bio',
                    'verification_status',
                    'rejection_note',
                    'verified_at',
                ]
            )
        else:
            # Create Mechanic profile
            mechanic = Mechanic.objects.create(
                account=account,
                contact_number=contact_number,
                profile_photo=request.FILES.get('profile_photo'),
                bio=bio if bio else None,
            )
        
        # Handle document uploads
        from ..models import MechanicDocument

        if is_reapplication:
            for existing_doc in MechanicDocument.objects.filter(mechanic=mechanic):
                if existing_doc.document_file:
                    existing_doc.document_file.delete(save=False)
            MechanicDocument.objects.filter(mechanic=mechanic).delete()
        
        # Process documents if provided
        document_count = 0
        for key in request.FILES.keys():
            if key.startswith('document_file_'):
                index = key.replace('document_file_', '')
                document_file = request.FILES.get(key)
                document_name = request.data.get(f'document_name_{index}')
                document_type = request.data.get(f'document_type_{index}')
                date_issued = request.data.get(f'date_issued_{index}')
                date_expiry = request.data.get(f'date_expiry_{index}')
                
                if document_file and document_name and document_type:
                    MechanicDocument.objects.create(
                        mechanic=mechanic,
                        document_name=document_name,
                        document_type=document_type,
                        document_file=document_file,
                        date_issued=date_issued if date_issued else None,
                        date_expiry=date_expiry if date_expiry else None,
                    )
                    document_count += 1
        
        # Add mechanic role to AccountRole if not exists
        AccountRole.objects.get_or_create(
            account=account,
            account_role='mechanic'
        )
        
        return Response({
            'message': 'Mechanic application resubmitted and pending admin approval' if is_reapplication else 'Successfully registered as mechanic',
            'mechanic': MechanicSerializer(mechanic).data,
            'documents_uploaded': document_count
        }, status=status.HTTP_200_OK if is_reapplication else status.HTTP_201_CREATED)
        
    except Account.DoesNotExist:
        return Response({
            'error': 'Account not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def register_shop_owner(request):
    """
    Register the current user as a shop owner
    Creates a ShopOwner profile, Shop, and adds shop_owner role to AccountRole
    
    Required fields:
    - profile_photo: image file (shop owner's profile photo)
    - owner_contact_number: string
    - shop_name: string
    - shop_contact_number: string
    
    Optional fields:
    - shop_email: email
    - website: string
    - description: text
    - service_banner: image file
    - shop_documents: array of document objects with:
        - document_name: string
        - document_type: string
        - document_file: file
        - date_issued: date (optional)
        - date_expiry: date (optional)
    - owner_documents: array of document objects with:
        - document_name: string
        - document_type: string
        - document_file: file
        - date_issued: date (optional)
        - date_expiry: date (optional)
    """
    # Get account_id from session
    account_id = request.session.get('account_id')
    
    if not account_id:
        return Response({
            'error': 'Authentication required'
        }, status=status.HTTP_401_UNAUTHORIZED)
    
    try:
        account = Account.objects.get(id=account_id)
        
        existing_shop_owner = account.shopowner if hasattr(account, 'shopowner') else None
        is_reapplication = bool(existing_shop_owner)

        if existing_shop_owner and existing_shop_owner.verification_status != ShopOwner.VerificationStatus.REJECTED:
            return Response({
                'error': 'Already registered as shop owner'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate required fields
        profile_photo = request.FILES.get('profile_photo')
        owner_contact_number = request.data.get('owner_contact_number')
        shop_name = request.data.get('shop_name')
        shop_contact_number = request.data.get('shop_contact_number')
        
        if not profile_photo:
            return Response({
                'error': 'Profile photo is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if not owner_contact_number:
            return Response({
                'error': 'Owner contact number is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if not shop_name:
            return Response({
                'error': 'Shop name is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if not shop_contact_number:
            return Response({
                'error': 'Shop contact number is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get optional fields
        shop_email = request.data.get('shop_email')
        website = request.data.get('website')
        description = request.data.get('description')
        service_banner = request.FILES.get('service_banner')
        
        from shops.models import Shop

        if existing_shop_owner:
            shop_owner = existing_shop_owner
            if profile_photo:
                shop_owner.profile_photo = profile_photo
            shop_owner.contact_number = owner_contact_number
            shop_owner.verification_status = ShopOwner.VerificationStatus.PENDING
            shop_owner.rejection_note = ''
            shop_owner.verified_at = None
            shop_owner.owns_shop = True
            shop_owner.save(
                update_fields=[
                    'profile_photo',
                    'contact_number',
                    'verification_status',
                    'rejection_note',
                    'verified_at',
                    'owns_shop',
                ]
            )

            shop, _ = Shop.objects.get_or_create(
                shop_owner=shop_owner,
                defaults={
                    'shop_name': shop_name,
                    'contact_number': shop_contact_number,
                    'email': shop_email if shop_email else None,
                    'website': website if website else None,
                    'description': description if description else None,
                    'service_banner': service_banner if service_banner else None,
                },
            )
            shop.shop_name = shop_name
            shop.contact_number = shop_contact_number
            shop.email = shop_email if shop_email else None
            shop.website = website if website else None
            shop.description = description if description else None
            if service_banner:
                shop.service_banner = service_banner
            shop.is_verified = False
            shop.save(
                update_fields=[
                    'shop_name',
                    'contact_number',
                    'email',
                    'website',
                    'description',
                    'service_banner',
                    'is_verified',
                ]
            )
        else:
            # Create ShopOwner profile
            shop_owner = ShopOwner.objects.create(
                account=account,
                profile_photo=profile_photo,
                contact_number=owner_contact_number,
            )

            # Create Shop
            shop = Shop.objects.create(
                shop_owner=shop_owner,
                shop_name=shop_name,
                contact_number=shop_contact_number,
                email=shop_email if shop_email else None,
                website=website if website else None,
                description=description if description else None,
                service_banner=service_banner if service_banner else None,
            )

            # Update shop owner owns_shop flag
            shop_owner.owns_shop = True
            shop_owner.save(update_fields=['owns_shop'])
        
        # Handle shop document uploads
        from shops.models import ShopDocument, ShopOwnerDocument

        if is_reapplication:
            for existing_doc in ShopDocument.objects.filter(shop=shop):
                if existing_doc.document_file:
                    existing_doc.document_file.delete(save=False)
            ShopDocument.objects.filter(shop=shop).delete()

            for existing_doc in ShopOwnerDocument.objects.filter(shop_owner=shop_owner):
                if existing_doc.document_file:
                    existing_doc.document_file.delete(save=False)
            ShopOwnerDocument.objects.filter(shop_owner=shop_owner).delete()
        
        shop_document_count = 0
        owner_document_count = 0
        
        # Process shop documents if provided
        for key in request.FILES.keys():
            if key.startswith('shop_document_file_'):
                index = key.replace('shop_document_file_', '')
                document_file = request.FILES.get(key)
                document_name = request.data.get(f'shop_document_name_{index}')
                document_type = request.data.get(f'shop_document_type_{index}')
                date_issued = request.data.get(f'shop_date_issued_{index}')
                date_expiry = request.data.get(f'shop_date_expiry_{index}')
                
                if document_file and document_name and document_type:
                    ShopDocument.objects.create(
                        shop=shop,
                        document_name=document_name,
                        document_type=document_type,
                        document_file=document_file,
                        date_issued=date_issued if date_issued else None,
                        date_expiry=date_expiry if date_expiry else None,
                    )
                    shop_document_count += 1
        
        # Process owner documents if provided
        for key in request.FILES.keys():
            if key.startswith('owner_document_file_'):
                index = key.replace('owner_document_file_', '')
                document_file = request.FILES.get(key)
                document_name = request.data.get(f'owner_document_name_{index}')
                document_type = request.data.get(f'owner_document_type_{index}')
                date_issued = request.data.get(f'owner_date_issued_{index}')
                date_expiry = request.data.get(f'owner_date_expiry_{index}')
                
                if document_file and document_name and document_type:
                    ShopOwnerDocument.objects.create(
                        shop_owner=shop_owner,
                        document_name=document_name,
                        document_type=document_type,
                        document_file=document_file,
                        date_issued=date_issued if date_issued else None,
                        date_expiry=date_expiry if date_expiry else None,
                    )
                    owner_document_count += 1
        
        # Add shop_owner role to AccountRole if not exists
        AccountRole.objects.get_or_create(
            account=account,
            account_role='shop_owner'
        )
        
        # Import serializers
        from shops.serializers import ShopSerializer
        
        return Response({
            'message': 'Shop owner application resubmitted and pending admin approval' if is_reapplication else 'Successfully registered as shop owner',
            'shop_owner': ShopOwnerSerializer(shop_owner).data,
            'shop': ShopSerializer(shop).data,
            'shop_documents_uploaded': shop_document_count,
            'owner_documents_uploaded': owner_document_count
        }, status=status.HTTP_200_OK if is_reapplication else status.HTTP_201_CREATED)
        
    except Account.DoesNotExist:
        return Response({
            'error': 'Account not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)
