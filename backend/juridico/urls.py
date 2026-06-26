from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import LegalCaseViewSet, LegalCaseTaskViewSet

router = DefaultRouter()
router.register(r'legal-cases', LegalCaseViewSet)
router.register(r'legal-case-tasks', LegalCaseTaskViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
