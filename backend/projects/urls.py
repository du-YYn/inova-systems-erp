from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ProjectTemplateViewSet, ProjectViewSet, ProjectPhaseViewSet,
    MilestoneViewSet, ProjectTaskViewSet, TimeEntryViewSet, ProjectCommentViewSet
)
from .views_extra import (
    SprintViewSet, ChangeRequestViewSet,
    ProjectEnvironmentViewSet, DeliveryApprovalViewSet,
)
from .views_scheduling import CronogramaSimularView

router = DefaultRouter()
router.register(r'templates', ProjectTemplateViewSet)
router.register(r'projects', ProjectViewSet)
router.register(r'phases', ProjectPhaseViewSet)
router.register(r'milestones', MilestoneViewSet)
router.register(r'tasks', ProjectTaskViewSet)
router.register(r'time-entries', TimeEntryViewSet)
router.register(r'comments', ProjectCommentViewSet)
router.register(r'sprints', SprintViewSet)
router.register(r'change-requests', ChangeRequestViewSet)
router.register(r'environments', ProjectEnvironmentViewSet)
router.register(r'delivery-approvals', DeliveryApprovalViewSet)

urlpatterns = [
    # F1: simulação stateless do Game Plan (antes do router p/ não colidir)
    path('cronograma/simular/', CronogramaSimularView.as_view(),
         name='cronograma-simular'),
    path('', include(router.urls)),
]
