from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status

from ..models import Mechanic
from ..serializers import MechanicSerializer


@api_view(['GET'])
@permission_classes([AllowAny])
def list_mechanics(request):
    """
    Get list of all available mechanics
    Returns mechanic details including profile, ratings, and services
    """
    try:
        mechanics = Mechanic.objects.select_related('account').all()
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
