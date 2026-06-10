import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from drf_spectacular.utils import extend_schema
from django.db.models import Sum, Count, Q
from django.utils import timezone
from django.utils.dateparse import parse_date

from .models import ProjectTemplate, Project, ProjectPhase, Milestone, ProjectTask, TimeEntry, ProjectComment
from .serializers import (
    ProjectTemplateSerializer, ProjectSerializer, ProjectPhaseSerializer,
    MilestoneSerializer, ProjectTaskSerializer, TimeEntrySerializer, ProjectCommentSerializer
)
from . import transitions
from accounts.permissions import (
    IsAdminOrManagerOrOperator, IsAdminOrManager, HasSectorAccess,
)
from core.audit import log_audit
from rest_framework.permissions import BasePermission

logger = logging.getLogger('projects')


class _TimeEntryOwnerOrManager(BasePermission):
    """S7B.1: object-level — admin/manager veem tudo; operator só objeto próprio.

    Defesa em profundidade junto com TimeEntryViewSet.get_queryset() — caso o
    queryset seja sobrescrito por um custom @action, ainda barra IDOR.
    """
    message = 'Você só pode acessar suas próprias horas.'

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.role in ('admin', 'manager'):
            return True
        return getattr(obj, 'user_id', None) == user.id


@extend_schema(tags=['projects'])
class ProjectTemplateViewSet(viewsets.ModelViewSet):
    """F2.6: Templates sao config compartilhada — leitura para todos
    autenticados, escrita so para admin/manager (antes: IsAuthenticated
    permitia viewer/partner editar)."""
    queryset = ProjectTemplate.objects.all()
    serializer_class = ProjectTemplateSerializer

    def get_permissions(self):
        from rest_framework.permissions import SAFE_METHODS
        if self.request.method in SAFE_METHODS:
            return [IsAuthenticated()]
        return [IsAdminOrManager()]


@extend_schema(tags=['projects'])
class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.select_related('customer', 'manager', 'created_by')
    serializer_class = ProjectSerializer
    permission_classes = [IsAdminOrManagerOrOperator]

    def get_queryset(self):
        queryset = super().get_queryset()
        project_status = self.request.query_params.get('status', None)
        customer_id = self.request.query_params.get('customer', None)

        if project_status:
            queryset = queryset.filter(status=project_status)
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)
        return queryset

    def perform_create(self, serializer):
        project = serializer.save(created_by=self.request.user)

        if project.template:
            for phase_data in project.template.phases:
                ProjectPhase.objects.create(
                    project=project,
                    name=phase_data.get('name'),
                    description=phase_data.get('description', ''),
                    order=phase_data.get('order', 0)
                )

    @action(detail=True, methods=['post'])
    def update_progress(self, request, pk=None):
        project = self.get_object()
        stats = ProjectTask.objects.filter(project=project).aggregate(
            total=Count('id'),
            completed=Count('id', filter=Q(status='done'))
        )
        if stats['total'] > 0:
            project.progress = int((stats['completed'] / stats['total']) * 100)
            if project.progress == 100:
                project.status = 'completed'
            project.save()

        return Response(ProjectSerializer(project).data)

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        qs = self.get_queryset()
        total_projects = qs.count()
        active_projects = qs.exclude(status__in=['completed', 'cancelled']).count()
        completed_projects = qs.filter(status='completed').count()

        total_budget = qs.aggregate(total=Sum('budget_value'))['total'] or 0

        by_status = qs.values('status').annotate(count=Count('id'))

        return Response({
            'total_projects': total_projects,
            'active_projects': active_projects,
            'completed_projects': completed_projects,
            'total_budget': float(total_budget),
            'by_status': list(by_status)
        })

    # ─── v32 F5: transições de etapa + gate Dia 0 (doc 04 §1/§6) ─────────────

    @action(detail=True, methods=['post'], url_path='set-etapa',
            permission_classes=[HasSectorAccess('producao')])
    def set_etapa(self, request, pk=None):
        """Transição de etapa (valida ordem + REGRA OURO da Etapa 7)."""
        project = self.get_object()
        nova = str(request.data.get('etapa') or '')
        transitions.set_etapa(project, nova, user=request.user, request=request)
        return Response(ProjectSerializer(project).data)

    @action(detail=True, methods=['post'], url_path='set-situacao',
            permission_classes=[HasSectorAccess('producao')])
    def set_situacao(self, request, pk=None):
        """Situação ortogonal: ativo | em_espera | cancelado."""
        project = self.get_object()
        nova = str(request.data.get('situacao') or '')
        transitions.set_situacao(project, nova, user=request.user, request=request)
        return Response(ProjectSerializer(project).data)

    @action(detail=True, methods=['post'], url_path='marcar-onboarding-realizado',
            permission_classes=[HasSectorAccess('producao')])
    def marcar_onboarding_realizado(self, request, pk=None):
        """Etapa 4 realizada — seta onboarding_realizado_at (+ Dia 0 se ok)."""
        project = self.get_object()
        data_raw = request.data.get('data')
        data = None
        if data_raw:
            data = parse_date(str(data_raw))
            if not data:
                return Response(
                    {'error': 'Formato de data inválido. Use YYYY-MM-DD.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        transitions.marcar_onboarding_realizado(
            project, user=request.user, data=data, request=request)
        return Response(ProjectSerializer(project).data)

    # ─── v32 F5: Game Plan persistente (doc 07 §10) ──────────────────────────

    @action(detail=True, methods=['get', 'post'], url_path='cronograma',
            permission_classes=[HasSectorAccess('producao')])
    def cronograma(self, request, pk=None):
        """GET: histórico de ScheduleVersion. POST: gera e persiste."""
        from .serializers_v32 import ScheduleVersionSerializer
        project = self.get_object()
        if request.method == 'GET':
            versions = project.schedule_versions.select_related('created_by')
            return Response(
                ScheduleVersionSerializer(versions, many=True).data)
        return self._generate_cronograma(project, request)

    def _generate_cronograma(self, project, request):
        """Gera o Game Plan dos params do Project, salva ScheduleVersion e
        cria/atualiza os 6 ProjectPhase datados (doc 04 §7)."""
        from .models import ScheduleVersion
        from .scheduling import gerar_game_plan
        from .serializers_scheduling import (
            CronogramaParamsSerializer, serialize_game_plan,
        )
        from .serializers_v32 import ScheduleVersionSerializer

        data_onboarding = request.data.get('data_onboarding') or project.dia_zero
        if not data_onboarding:
            return Response(
                {'error': (
                    'Cronograma exige o Dia 0 definido (Etapa 4) ou '
                    'data_onboarding informada no corpo.'
                )},
                status=status.HTTP_400_BAD_REQUEST,
            )

        params_serializer = CronogramaParamsSerializer(data={
            'prazo_total': project.prazo_total,
            'modo': project.modo,
            'data_onboarding': data_onboarding,
            'pct_doc': project.pct_doc,
            'pct_dev': project.pct_dev,
            'pct_aud': project.pct_aud,
            'peso_val': project.peso_val,
            'peso_hom': project.peso_hom,
            'peso_ent': project.peso_ent,
            'reupd_fds': project.reupd_fds,
            'considerar_carnaval': project.considerar_carnaval,
            'considerar_corpus': project.considerar_corpus,
            'data_reuniao_validacao': project.data_reuniao_validacao,
            'data_reuniao_apresentacao': project.data_reuniao_apresentacao,
            'data_reuniao_graduacao': project.data_reuniao_graduacao,
        })
        params_serializer.is_valid(raise_exception=True)
        try:
            plan = gerar_game_plan(params_serializer.to_params())
        except ValueError as exc:
            return Response({'error': str(exc)},
                            status=status.HTTP_400_BAD_REQUEST)

        game_plan = serialize_game_plan(plan)
        params_json = {
            key: (value.isoformat() if hasattr(value, 'isoformat') else value)
            for key, value in params_serializer.validated_data.items()
        }

        version = ScheduleVersion.objects.create(
            project=project,
            params=params_json,
            game_plan=game_plan,
            created_by=request.user,
        )

        # 6 fases datadas (name/order/start/end) — upsert por nome canônico
        phases = []
        for order, fase in enumerate(plan.fases, start=1):
            phase, _created = ProjectPhase.objects.update_or_create(
                project=project,
                name=fase.label,
                defaults={
                    'order': order,
                    'start_date': fase.inicio,
                    'end_date': fase.fim,
                },
            )
            phases.append(phase)

        log_audit(
            request.user, 'project_cronograma_generate', 'project', project.id,
            details=(
                f'Game Plan gerado (ScheduleVersion {version.id}): '
                f'entrega {game_plan["entrega"]} '
                f'({plan.params.prazo_total} dias, modo {plan.params.modo}).'
            ),
            new_value={
                'schedule_version': version.id,
                'params': params_json,
                'entrega': game_plan['entrega'],
                'entrega_base': game_plan['entrega_base'],
            },
            request=request,
        )
        logger.info(
            'Project %s: Game Plan gerado (version %s) por %s.',
            project.id, version.id, request.user.username,
        )
        return Response(
            {
                'schedule_version': ScheduleVersionSerializer(version).data,
                'phases': ProjectPhaseSerializer(phases, many=True).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['get'], url_path='profitability')
    def profitability(self, request, pk=None):
        """Calcula rentabilidade do projeto: receita - custo de horas."""
        project = self.get_object()

        # Receita: invoices pagas ligadas ao contrato do projeto
        from finance.models import Invoice
        revenue = Invoice.objects.filter(
            contract=project.contract,
            invoice_type='receivable',
            status='paid'
        ).aggregate(total=Sum('total'))['total'] or 0

        # Custo de horas: TimeEntry × custo/hora do colaborador
        time_entries = project.time_entries.select_related('user__employee_profile')

        labor_cost = 0
        for entry in time_entries:
            try:
                hourly_cost = float(entry.user.employee_profile.hourly_cost)
            except Exception:
                hourly_cost = 0
            labor_cost += float(entry.hours) * hourly_cost

        total_hours = time_entries.aggregate(total=Sum('hours'))['total'] or 0
        billable_hours = time_entries.filter(is_billable=True).aggregate(total=Sum('hours'))['total'] or 0

        # Despesas diretas do projeto (se Transaction tiver FK para project)
        direct_expenses = 0
        try:
            from finance.models import Transaction
            direct_expenses = Transaction.objects.filter(
                project=project,
                transaction_type='expense'
            ).aggregate(total=Sum('amount'))['total'] or 0
        except Exception:  # noqa: S110
            pass

        total_cost = float(labor_cost) + float(direct_expenses)
        gross_margin = float(revenue) - total_cost
        margin_pct = (gross_margin / float(revenue) * 100) if float(revenue) > 0 else 0

        return Response({
            'project_id': project.id,
            'project_name': project.name,
            'revenue': float(revenue),
            'labor_cost': float(labor_cost),
            'direct_expenses': float(direct_expenses),
            'total_cost': total_cost,
            'gross_margin': gross_margin,
            'margin_pct': round(margin_pct, 2),
            'total_hours': float(total_hours),
            'billable_hours': float(billable_hours),
            'budget_value': float(project.budget_value),
            'budget_hours': float(project.budget_hours),
            'budget_variance': float(project.budget_value) - float(revenue),
        })


@extend_schema(tags=['projects'])
class ProjectPhaseViewSet(viewsets.ModelViewSet):
    queryset = ProjectPhase.objects.select_related('project')
    serializer_class = ProjectPhaseSerializer
    permission_classes = [IsAdminOrManagerOrOperator]

    @action(detail=True, methods=['post'])
    def toggle_complete(self, request, pk=None):
        phase = self.get_object()
        phase.is_completed = not phase.is_completed
        phase.save()

        project = phase.project
        total_phases = project.phases.count()
        completed_phases = project.phases.filter(is_completed=True).count()

        if total_phases > 0:
            project.progress = int((completed_phases / total_phases) * 100)
            project.save()

        return Response(ProjectPhaseSerializer(phase).data)


@extend_schema(tags=['projects'])
class MilestoneViewSet(viewsets.ModelViewSet):
    queryset = Milestone.objects.select_related('project')
    serializer_class = MilestoneSerializer
    permission_classes = [IsAdminOrManagerOrOperator]

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        milestone = self.get_object()
        if milestone.is_completed:
            return Response(
                {'error': 'Este marco já foi concluído'},
                status=status.HTTP_400_BAD_REQUEST
            )
        milestone.is_completed = True
        milestone.completed_at = timezone.now()
        milestone.save()
        logger.info(f"Milestone {milestone.id} concluído por {request.user.username}")
        return Response(MilestoneSerializer(milestone).data)


@extend_schema(tags=['projects'])
class ProjectTaskViewSet(viewsets.ModelViewSet):
    queryset = ProjectTask.objects.select_related('project', 'phase', 'assigned_to')
    serializer_class = ProjectTaskSerializer
    permission_classes = [IsAdminOrManagerOrOperator]

    def get_queryset(self):
        queryset = super().get_queryset()
        project_id = self.request.query_params.get('project', None)
        task_status = self.request.query_params.get('status', None)

        if project_id:
            queryset = queryset.filter(project_id=project_id)
        if task_status:
            queryset = queryset.filter(status=task_status)
        return queryset

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        task = self.get_object()
        if task.status == 'done':
            return Response(
                {'error': 'Tarefa já foi marcada como concluída'},
                status=status.HTTP_400_BAD_REQUEST
            )
        task.status = 'done'
        task.completed_at = timezone.now()
        task.save()

        project = task.project
        total_tasks = ProjectTask.objects.filter(project=project).count()
        completed_tasks = ProjectTask.objects.filter(project=project, status='done').count()

        if total_tasks > 0:
            project.progress = int((completed_tasks / total_tasks) * 100)
            project.save()

        logger.info(f"Tarefa {task.id} concluída por {request.user.username}")
        return Response(ProjectTaskSerializer(task).data)

    @action(detail=False, methods=['get'])
    def my_tasks(self, request):
        tasks = self.get_queryset().filter(assigned_to=request.user)
        page = self.paginate_queryset(tasks)
        if page is not None:
            return self.get_paginated_response(ProjectTaskSerializer(page, many=True).data)
        return Response(ProjectTaskSerializer(tasks, many=True).data)


@extend_schema(tags=['projects'])
class TimeEntryViewSet(viewsets.ModelViewSet):
    queryset = TimeEntry.objects.select_related('project', 'task', 'user')
    serializer_class = TimeEntrySerializer
    permission_classes = [IsAdminOrManagerOrOperator]

    def get_queryset(self):
        """S7B.1: IDOR — operator só vê/edita as próprias horas.

        Antes do fix, qualquer operator podia listar/editar/deletar TimeEntry
        de colegas via PK direto (CRUD aberto pelo IsAdminOrManagerOrOperator).
        Admin/manager continuam vendo tudo (precisam fechar folhas).
        """
        qs = super().get_queryset()
        user = self.request.user
        if not user.is_authenticated:
            return qs.none()
        if user.role in ('admin', 'manager'):
            return qs
        # operator/viewer: só as próprias entradas
        return qs.filter(user=user)

    def get_permissions(self):
        """S7B.1: object-level — admin/manager livre, operator dono apenas."""
        perms = super().get_permissions()
        return perms + [_TimeEntryOwnerOrManager()]

    def _recalculate_task_hours(self, task):
        if task:
            logged = task.time_entries.aggregate(total=Sum('hours'))['total'] or 0
            task.logged_hours = logged
            task.save(update_fields=['logged_hours'])

    def perform_create(self, serializer):
        entry = serializer.save(user=self.request.user)
        self._recalculate_task_hours(entry.task)

    def perform_update(self, serializer):
        old_task = serializer.instance.task
        entry = serializer.save()
        self._recalculate_task_hours(entry.task)
        # If task changed, also recalculate the old task
        if old_task and old_task != entry.task:
            self._recalculate_task_hours(old_task)

    def perform_destroy(self, instance):
        task = instance.task
        instance.delete()
        self._recalculate_task_hours(task)

    @action(detail=False, methods=['get'])
    def my_entries(self, request):
        entries = self.get_queryset().filter(user=request.user)
        page = self.paginate_queryset(entries)
        if page is not None:
            return self.get_paginated_response(TimeEntrySerializer(page, many=True).data)
        return Response(TimeEntrySerializer(entries, many=True).data)

    @action(detail=False, methods=['get'])
    def report(self, request):
        from_date = request.query_params.get('from')
        to_date = request.query_params.get('to')

        queryset = self.get_queryset()

        if from_date:
            parsed = parse_date(from_date)
            if not parsed:
                return Response({'error': 'Formato de data inválido (from). Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)
            queryset = queryset.filter(date__gte=parsed)
        if to_date:
            parsed = parse_date(to_date)
            if not parsed:
                return Response({'error': 'Formato de data inválido (to). Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)
            queryset = queryset.filter(date__lte=parsed)

        total_hours = queryset.aggregate(total=Sum('hours'))['total'] or 0
        billable_hours = queryset.filter(is_billable=True).aggregate(total=Sum('hours'))['total'] or 0

        by_user = queryset.values('user__username').annotate(total=Sum('hours')).order_by('-total')
        by_project = queryset.values('project__name').annotate(total=Sum('hours')).order_by('-total')

        # Paginação para o detalhe das entradas
        paginator = PageNumberPagination()
        paginator.page_size = 100
        page = paginator.paginate_queryset(queryset, request)

        return Response({
            'total_hours': float(total_hours),
            'billable_hours': float(billable_hours),
            'by_user': list(by_user),
            'by_project': list(by_project),
            'entries': TimeEntrySerializer(page, many=True).data,
            'entries_count': queryset.count(),
        })


@extend_schema(tags=['projects'])
class ProjectCommentViewSet(viewsets.ModelViewSet):
    queryset = ProjectComment.objects.select_related('project', 'user')
    serializer_class = ProjectCommentSerializer
    permission_classes = [IsAdminOrManagerOrOperator]

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
