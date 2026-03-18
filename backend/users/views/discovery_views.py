from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

from ..models import Mechanic
from ..serializers import MechanicSerializer, MechanicProfileSerializer


@api_view(['GET'])
@permission_classes([AllowAny])
def list_mechanics(request):
    """
    Get list of all available mechanics
    Returns mechanic details including profile, ratings, and services
    """
    try:
        account_id = request.session.get('account_id')

        mechanics = Mechanic.objects.select_related('account').filter(
            verification_status=Mechanic.VerificationStatus.APPROVED,
            account__is_active=True,
        )
        if account_id:
            mechanics = mechanics.exclude(account_id=account_id)

        mechanics_data = []
        
        for mechanic in mechanics:
            mechanic_info = {
                'id': mechanic.id,
                'account_id': mechanic.account.id,
                'name': f"{mechanic.account.firstname} {mechanic.account.lastname}",
                'profile_photo': mechanic.profile_photo.url if mechanic.profile_photo else None,
                'contact_number': mechanic.contact_number,
                'average_rating': float(mechanic.average_rating),
                'status': mechanic.status,
                'is_working_for_shop': mechanic.is_working_for_shop,
            }
            mechanics_data.append(mechanic_info)
        
        return Response({
            'mechanics': mechanics_data,
            'count': len(mechanics_data)
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([AllowAny])
def get_mechanic_profile(request, mechanic_id):
    """
    Get detailed mechanic profile by mechanic ID
    
    Returns comprehensive profile including:
    - Basic info (name, photo, contact)
    - Ratings and reviews
    - Years active
    - Bio
    - Specialties
    - Services offered with prices
    - Shop affiliation
    """
    try:
        mechanic = Mechanic.objects.select_related(
            'account', 'shop'
        ).prefetch_related(
            'reviews', 'reviews__reviewer'
        ).get(id=mechanic_id)
        
        serializer = MechanicProfileSerializer(mechanic, context={'request': request})
        
        return Response({
            'mechanic': serializer.data
        }, status=status.HTTP_200_OK)
        
    except Mechanic.DoesNotExist:
        return Response({
            'error': 'Mechanic not found'
        }, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({
            'error': str(e)
        }, status=status.HTTP_400_BAD_REQUEST)

