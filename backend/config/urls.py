from django.conf import settings as django_settings
from django.contrib import admin
from django.urls import path, include
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView

from presentations.urls import public_urlpatterns as _presentations_public_urls

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/accounts/', include('accounts.urls')),
    path('api/v1/sales/', include('sales.urls')),
    path('api/v1/finance/', include('finance.urls')),
    path('api/v1/projects/', include('projects.urls')),
    path('api/v1/core/', include('core.urls')),
    path('api/v1/support/', include('support.urls')),
    path('api/v1/', include('notifications.urls')),
    path('api/v1/notifications/', include('notifications.urls')),  # compat: frontend build antigo usa path duplo
    path('api/v1/presentations/', include(('presentations.urls', 'presentations'), namespace='presentations')),
    path('api/v1/public-presentations/', include((_presentations_public_urls, 'presentations-public'), namespace='presentations-public')),
]

# Swagger/ReDoc apenas em desenvolvimento — nunca expor em produção
if django_settings.DEBUG:
    urlpatterns += [
        path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
        path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
        path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
    ]
