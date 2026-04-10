from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from .models import PricingConfiguration
from .serializers import PricingConfigurationSerializer


@api_view(['GET'])
@permission_classes([AllowAny])
def get_pricing_config(request):
    config = PricingConfiguration.get_config()
    serializer = PricingConfigurationSerializer(config)
    return Response(serializer.data)


@api_view(['PUT', 'PATCH'])
@permission_classes([AllowAny])
def update_pricing_config(request):
    config = PricingConfiguration.get_config()
    serializer = PricingConfigurationSerializer(
        config, data=request.data, partial=True
    )
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
