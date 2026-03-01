from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.db import connection
from django.core.cache import cache
import redis


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    status = {'status': 'ok', 'services': {}}
    
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        status['services']['database'] = 'ok'
    except Exception as e:
        status['services']['database'] = f'error: {str(e)}'
        status['status'] = 'degraded'
    
    try:
        cache.set('health_check', 'ok', 10)
        cache.get('health_check')
        status['services']['cache'] = 'ok'
    except Exception as e:
        status['services']['cache'] = f'error: {str(e)}'
        status['status'] = 'degraded'
    
    return Response(status)


@api_view(['GET'])
def system_info(request):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    
    return Response({
        'app_name': 'Inova Systems Solutions ERP',
        'version': '1.0.0',
        'total_users': User.objects.count(),
    })
