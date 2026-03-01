from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/accounts/', include('accounts.urls')),
    path('api/v1/sales/', include('sales.urls')),
    path('api/v1/finance/', include('finance.urls')),
    path('api/v1/projects/', include('projects.urls')),
    path('api/v1/core/', include('core.urls')),
]
