from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from django.conf import settings as django_settings
from django.db import connection
from django.core.cache import cache


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([])
def health_check(request):
    health = {'status': 'ok', 'services': {}}

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        health['services']['database'] = 'ok'
    except Exception as e:
        health['services']['database'] = 'error' if not django_settings.DEBUG else f'error: {e}'
        health['status'] = 'degraded'

    try:
        cache.set('health_check', 'ok', 10)
        cache.get('health_check')
        health['services']['cache'] = 'ok'
    except Exception as e:
        health['services']['cache'] = 'error' if not django_settings.DEBUG else f'error: {e}'
        health['status'] = 'degraded'

    return Response(health)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def system_info(request):
    return Response({
        'app_name': 'Inova Systems Solutions ERP',
        'version': '1.0.0',
    })
