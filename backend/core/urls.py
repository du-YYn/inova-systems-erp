from django.urls import path
from .views import health_check, system_info, reset_data, auth_debug

urlpatterns = [
    path('health/', health_check, name='health_check'),
    path('info/', system_info, name='system_info'),
    path('reset-data/', reset_data, name='reset_data'),
    path('auth-debug/', auth_debug, name='auth_debug'),
]
