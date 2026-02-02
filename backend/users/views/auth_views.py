from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

from ..models import Account, AccountRole
from ..serializers import (
    RegisterSerializer, LoginSerializer, AccountSerializer
)


@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    """
    Register a new user account with role (client, mechanic, shop_owner)
    
    Required fields:
    - firstname, lastname, email, username, password, confirm_password
    - role: client, mechanic, or shop_owner
    - street_name, barangay, city_municipality, province, region
    
    Optional fields:
    - middlename, date_of_birth, gender
    - house_building_number, subdivision_village, postal_code
    - contact_number
    """
    serializer = RegisterSerializer(data=request.data)
    if serializer.is_valid():
        account = serializer.save()
        return Response({
            'message': 'Account created successfully',
            'account': AccountSerializer(account).data
        }, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    """
    Login with username and password
    
    Returns account details and session
    """
    serializer = LoginSerializer(data=request.data)
    if serializer.is_valid():
        account = serializer.validated_data['account']
        
        # Create session
        request.session['account_id'] = account.id
        request.session['username'] = account.username
        
        # Get user roles
        roles = list(account.accountrole_set.values_list('account_role', flat=True))
        request.session['roles'] = roles
        
        return Response({
            'message': 'Login successful',
            'account': AccountSerializer(account).data
        }, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def logout(request):
    """
    Logout current user
    """
    try:
        request.session.flush()
        return Response({
            'message': 'Logout successful'
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([AllowAny])
def check_session(request):
    """
    Check if session is valid and return user info
    """
    try:
        account_id = request.session.get('account_id')
        if not account_id:
            return Response({
                'authenticated': False
            }, status=status.HTTP_401_UNAUTHORIZED)
        
        account = Account.objects.get(id=account_id)
        return Response({
            'authenticated': True,
            'account': AccountSerializer(account).data
        }, status=status.HTTP_200_OK)
    except Account.DoesNotExist:
        return Response({
            'authenticated': False
        }, status=status.HTTP_401_UNAUTHORIZED)
