"""v32 F5 (Produção) — ViewSets das entidades novas (doc 04 §3).

RBAC por setor (doc 08 §7.2): recurso de Produção — producao RW; demais
setores R (viewer leitura global, admin bypass). Ações sensíveis registram
log_audit com old/new.
"""
import logging

from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import HasSectorAccess
from core.audit import log_audit

from .models_v32 import (
    OnboardingMappingForm,
    ProjectAudit,
    ProjectDocument,
    RecurrenceContract,
    ReUpdateCycle,
    ScheduleVersion,
    WeeklyUpdate,
)
from .serializers_v32 import (
    OnboardingMappingFormSerializer,
    ProjectAuditSerializer,
    ProjectDocumentSerializer,
    RecurrenceContractSerializer,
    ReUpdateCycleSerializer,
    ScheduleVersionSerializer,
    WeeklyUpdateSerializer,
)

logger = logging.getLogger('projects')

PRODUCAO_PERMS = [HasSectorAccess('producao')]


class _ProjectFilterMixin:
    """Filtro ?project=<id> comum a todas as entidades penduradas no Project."""

    def get_queryset(self):
        queryset = super().get_queryset()
        project_id = self.request.query_params.get('project')
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        return queryset


@extend_schema(tags=['projects'])
class OnboardingMappingFormViewSet(_ProjectFilterMixin, viewsets.ModelViewSet):
    """Etapa 4 — roteiro de mapeamento do onboarding (7 blocos)."""

    queryset = OnboardingMappingForm.objects.select_related(
        'project', 'created_by')
    serializer_class = OnboardingMappingFormSerializer
    permission_classes = PRODUCAO_PERMS

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


@extend_schema(tags=['projects'])
class ProjectDocumentViewSet(_ProjectFilterMixin, viewsets.ModelViewSet):
    """Etapa 5 — documentação versionada (12 seções, baseline assinada)."""

    queryset = ProjectDocument.objects.select_related('project', 'created_by')
    serializer_class = ProjectDocumentSerializer
    permission_classes = PRODUCAO_PERMS

    # Trilho de status editável pela Produção; `signed` só via Jurídico
    # (receiver) — nunca por esta ação (STRIDE Tampering).
    _STATUS_FLOW = {
        'draft': 'pending_validation',
        'pending_validation': 'pending_signature',
    }

    def perform_create(self, serializer):
        project = serializer.validated_data['project']
        last = (
            ProjectDocument.objects.filter(project=project)
            .order_by('-version')
            .first()
        )
        next_version = (last.version + 1) if last else 1
        serializer.save(created_by=self.request.user, version=next_version)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """Avança o status do doc (draft → validação → assinatura)."""
        document = self.get_object()
        new_status = self._STATUS_FLOW.get(document.status)
        if new_status is None:
            return Response(
                {'error': (
                    f'Doc em "{document.get_status_display()}" não pode ser '
                    f'avançada por aqui — assinatura vem do Jurídico.'
                )},
                status=status.HTTP_400_BAD_REQUEST,
            )
        old_status = document.status
        document.status = new_status
        document.save(update_fields=['status', 'updated_at'])
        log_audit(
            request.user, 'project_document_submit', 'project_document',
            document.id,
            details=f'Doc v{document.version}: {old_status} → {new_status}.',
            old_value={'status': old_status},
            new_value={'status': new_status},
            request=request,
        )
        return Response(ProjectDocumentSerializer(document).data)


@extend_schema(tags=['projects'])
class ProjectAuditViewSet(_ProjectFilterMixin, viewsets.ModelViewSet):
    """Etapa 8 — auditoria interna (aprovação destrava a Etapa 9)."""

    queryset = ProjectAudit.objects.select_related(
        'project', 'created_by', 'approved_by')
    serializer_class = ProjectAuditSerializer
    permission_classes = PRODUCAO_PERMS

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Marca a auditoria como aprovada (marco da Etapa 8 → 9)."""
        audit = self.get_object()
        if audit.approved_at:
            return Response(
                {'error': 'Auditoria já aprovada.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        audit.approved_at = timezone.now()
        audit.approved_by = request.user
        audit.save(update_fields=['approved_at', 'approved_by', 'updated_at'])
        log_audit(
            request.user, 'project_audit_approve', 'project_audit', audit.id,
            details=(
                f'Auditoria do projeto {audit.project.name} aprovada — '
                f'destrava a Etapa 9 (apresentação).'
            ),
            old_value={'approved_at': None},
            new_value={'approved_at': str(audit.approved_at)},
            request=request,
        )
        return Response(ProjectAuditSerializer(audit).data)


@extend_schema(tags=['projects'])
class ReUpdateCycleViewSet(_ProjectFilterMixin, viewsets.ModelViewSet):
    """Homologação — ciclos de re-update."""

    queryset = ReUpdateCycle.objects.select_related('project', 'created_by')
    serializer_class = ReUpdateCycleSerializer
    permission_classes = PRODUCAO_PERMS

    def perform_create(self, serializer):
        project = serializer.validated_data['project']
        if 'cycle_number' not in serializer.validated_data:
            last = (
                ReUpdateCycle.objects.filter(project=project)
                .order_by('-cycle_number')
                .first()
            )
            serializer.save(
                created_by=self.request.user,
                cycle_number=(last.cycle_number + 1) if last else 1,
            )
        else:
            serializer.save(created_by=self.request.user)


@extend_schema(tags=['projects'])
class WeeklyUpdateViewSet(_ProjectFilterMixin, viewsets.ModelViewSet):
    """Atualização semanal ao cliente (paralela ao Desenvolvimento)."""

    queryset = WeeklyUpdate.objects.select_related('project', 'created_by')
    serializer_class = WeeklyUpdateSerializer
    permission_classes = PRODUCAO_PERMS

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


@extend_schema(tags=['projects'])
class ScheduleVersionViewSet(_ProjectFilterMixin,
                             viewsets.ReadOnlyModelViewSet):
    """Histórico do Game Plan — somente leitura (nasce no POST cronograma)."""

    queryset = ScheduleVersion.objects.select_related('project', 'created_by')
    serializer_class = ScheduleVersionSerializer
    permission_classes = PRODUCAO_PERMS


@extend_schema(tags=['projects'])
class RecurrenceContractViewSet(_ProjectFilterMixin, viewsets.ModelViewSet):
    """Recorrência mínima (Parte 6) — nasce na bifurcação da Produção."""

    queryset = RecurrenceContract.objects.select_related(
        'customer', 'project', 'created_by')
    serializer_class = RecurrenceContractSerializer
    permission_classes = PRODUCAO_PERMS

    def get_queryset(self):
        queryset = super().get_queryset()
        contract_status = self.request.query_params.get('status')
        if contract_status:
            queryset = queryset.filter(status=contract_status)
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
