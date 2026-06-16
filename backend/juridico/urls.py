from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import LegalCaseViewSet

router = DefaultRouter()
router.register(r'legal-cases', LegalCaseViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
