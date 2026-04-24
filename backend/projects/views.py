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
from accounts.permissions import IsAdminOrManagerOrOperator, IsAdminOrManager

logger = logging.getLogger('projects')


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
