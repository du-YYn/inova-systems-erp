from django.urls import path
from .views import health_check, system_info, reset_data

urlpatterns = [
    path('health/', health_check, name='health_check'),
    path('info/', system_info, name='system_info'),
    path('reset-data/', reset_data, name='reset_data'),
]
