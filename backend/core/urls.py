from django.urls import path
from .views import health_check, system_info, reset_data, email_debug

urlpatterns = [
    path('health/', health_check, name='health_check'),
    path('info/', system_info, name='system_info'),
    path('reset-data/', reset_data, name='reset_data'),
    path('email-debug/', email_debug, name='email_debug'),
]
