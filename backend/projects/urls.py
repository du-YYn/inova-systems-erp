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
from .views_v32 import (
    OnboardingMappingFormViewSet, ProjectAuditViewSet, ProjectDocumentViewSet,
    ProjectEtapaActionViewSet, RecurrenceContractViewSet, ReUpdateCycleViewSet,
    ScheduleVersionViewSet, WeeklyUpdateViewSet,
)

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
# v32 F5 (Produção) — entidades novas (doc 04 §3)
router.register(r'onboarding-forms', OnboardingMappingFormViewSet)
router.register(r'documents', ProjectDocumentViewSet)
router.register(r'audits', ProjectAuditViewSet)
router.register(r'reupdate-cycles', ReUpdateCycleViewSet)
router.register(r'weekly-updates', WeeklyUpdateViewSet)
router.register(r'schedule-versions', ScheduleVersionViewSet)
router.register(r'recurrence-contracts', RecurrenceContractViewSet)
router.register(r'etapa-actions', ProjectEtapaActionViewSet)

urlpatterns = [
    # F1: simulação stateless do Game Plan (antes do router p/ não colidir)
    path('cronograma/simular/', CronogramaSimularView.as_view(),
         name='cronograma-simular'),
    path('', include(router.urls)),
]
