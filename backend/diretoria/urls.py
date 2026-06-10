from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import DirectorEscalationViewSet, DirectoryMeetingViewSet

router = DefaultRouter()
router.register(r'escalations', DirectorEscalationViewSet)
router.register(r'meetings', DirectoryMeetingViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
