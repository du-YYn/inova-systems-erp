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
    ETAPA_ACTIONS_SEED,
    OnboardingMappingForm,
    ProjectAudit,
    ProjectDocument,
    ProjectEtapaAction,
    RecurrenceContract,
    ReUpdateCycle,
    ScheduleVersion,
    WeeklyUpdate,
)
from .serializers_v32 import (
    OnboardingMappingFormSerializer,
    ProjectAuditSerializer,
    ProjectDocumentSerializer,
    ProjectEtapaActionSerializer,
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
        # PRODUCER (doc 09 item 06 / doc 10 §5): enviar a doc pra validação
        # (vira a baseline a validar) → abre LegalCase(validacao_documento) no
        # Jurídico. Isolado: erro do producer não derruba o submit.
        if new_status == 'pending_validation':
            from .receivers import create_validacao_legal_case
            try:
                create_validacao_legal_case(document, user=request.user)
            except Exception as exc:  # noqa: BLE001 — isolamento do producer
                logger.exception(
                    'Falha no producer Validação→Jurídico (doc %s): %s',
                    document.id, exc,
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


@extend_schema(tags=['projects'])
class ProjectEtapaActionViewSet(_ProjectFilterMixin, viewsets.ModelViewSet):
    """Checklist de ações por etapa no card (doc 09 item 08 / doc 10).

    Filtra por ?project=<id> e opcionalmente ?etapa=<key>. A data de cada ação
    (`data_prevista`) é calculada pelo motor (substeps) — read-only. A ação
    `seed` cria as ações padrão do doc 10 por etapa (idempotente); `toggle`
    marca/desmarca registrando quem/quando.
    """

    queryset = ProjectEtapaAction.objects.select_related(
        'project', 'created_by', 'feito_por')
    serializer_class = ProjectEtapaActionSerializer
    permission_classes = PRODUCAO_PERMS

    def get_queryset(self):
        queryset = super().get_queryset()
        etapa = self.request.query_params.get('etapa')
        if etapa:
            queryset = queryset.filter(etapa=etapa)
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def toggle(self, request, pk=None):
        """Marca/desmarca a ação como feita (registra quem/quando)."""
        action_obj = self.get_object()
        action_obj.feito = not action_obj.feito
        if action_obj.feito:
            action_obj.feito_em = timezone.now()
            action_obj.feito_por = request.user
        else:
            action_obj.feito_em = None
            action_obj.feito_por = None
        action_obj.save(update_fields=[
            'feito', 'feito_em', 'feito_por', 'updated_at'])
        log_audit(
            request.user, 'project_etapa_action_toggle',
            'project_etapa_action', action_obj.id,
            details=(
                f'Ação "{action_obj.texto[:60]}" ({action_obj.etapa}) '
                f'marcada como {"feita" if action_obj.feito else "pendente"}.'
            ),
            new_value={'feito': action_obj.feito},
            request=request,
        )
        return Response(ProjectEtapaActionSerializer(action_obj).data)

    @action(detail=False, methods=['post'])
    def seed(self, request):
        """Semeia as ações padrão do doc 10 num projeto (idempotente).

        Body: {"project": <id>, "etapa"?: "<key>"}. Sem `etapa`, semeia todas
        as etapas com ações definidas. Não duplica: pula (project, etapa) que
        já tem ações. Etapas sem ações no seed (9/12/13 — a definir) são
        ignoradas.
        """
        project_id = request.data.get('project')
        if not project_id:
            return Response(
                {'error': 'O campo "project" é obrigatório.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from .models import Project
        try:
            project = Project.objects.get(pk=project_id)
        except Project.DoesNotExist:
            return Response(
                {'error': 'Projeto não encontrado.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        only_etapa = request.data.get('etapa')
        etapas = [only_etapa] if only_etapa else list(ETAPA_ACTIONS_SEED.keys())

        created = []
        for etapa in etapas:
            textos = ETAPA_ACTIONS_SEED.get(etapa)
            if not textos:
                continue
            if ProjectEtapaAction.objects.filter(
                project=project, etapa=etapa,
            ).exists():
                continue  # idempotente: já semeado
            for ordem, texto in enumerate(textos, start=1):
                created.append(ProjectEtapaAction(
                    project=project, etapa=etapa, ordem=ordem, texto=texto,
                    created_by=request.user,
                ))
        if created:
            ProjectEtapaAction.objects.bulk_create(created)
            log_audit(
                request.user, 'project_etapa_actions_seed',
                'project', project.id,
                details=(
                    f'Semeadas {len(created)} ações padrão (doc 10) no projeto '
                    f'{project.name}'
                    + (f' (etapa {only_etapa})' if only_etapa else '') + '.'
                ),
                new_value={'project': project.id, 'count': len(created),
                           'etapa': only_etapa},
                request=request,
            )
        actions = self.get_queryset().filter(project=project)
        if only_etapa:
            actions = actions.filter(etapa=only_etapa)
        return Response(
            {
                'seeded': len(created),
                'actions': ProjectEtapaActionSerializer(actions, many=True).data,
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )
