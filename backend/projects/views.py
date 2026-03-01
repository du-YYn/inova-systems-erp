from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import models
from django.db.models import Sum, Count
from django.utils import timezone

from .models import ProjectTemplate, Project, ProjectPhase, Milestone, ProjectTask, TimeEntry, ProjectComment
from .serializers import (
    ProjectTemplateSerializer, ProjectSerializer, ProjectPhaseSerializer,
    MilestoneSerializer, ProjectTaskSerializer, TimeEntrySerializer, ProjectCommentSerializer
)


class ProjectTemplateViewSet(viewsets.ModelViewSet):
    queryset = ProjectTemplate.objects.all()
    serializer_class = ProjectTemplateSerializer
    permission_classes = [IsAuthenticated]


class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.all()
    serializer_class = ProjectSerializer
    permission_classes = [IsAuthenticated]

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
        total_tasks = ProjectTask.objects.filter(project=project).count()
        completed_tasks = ProjectTask.objects.filter(project=project, status='done').count()
        
        if total_tasks > 0:
            project.progress = int((completed_tasks / total_tasks) * 100)
            if project.progress == 100:
                project.status = 'completed'
            project.save()
        
        return Response(ProjectSerializer(project).data)

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        total_projects = self.queryset.count()
        active_projects = self.queryset.exclude(status__in=['completed', 'cancelled']).count()
        completed_projects = self.queryset.filter(status='completed').count()
        
        total_budget = self.queryset.aggregate(total=Sum('budget_value'))['total'] or 0
        
        by_status = self.queryset.values('status').annotate(count=Count('id'))

        return Response({
            'total_projects': total_projects,
            'active_projects': active_projects,
            'completed_projects': completed_projects,
            'total_budget': float(total_budget),
            'by_status': list(by_status)
        })


class ProjectPhaseViewSet(viewsets.ModelViewSet):
    queryset = ProjectPhase.objects.all()
    serializer_class = ProjectPhaseSerializer
    permission_classes = [IsAuthenticated]

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


class MilestoneViewSet(viewsets.ModelViewSet):
    queryset = Milestone.objects.all()
    serializer_class = MilestoneSerializer
    permission_classes = [IsAuthenticated]

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        milestone = self.get_object()
        milestone.is_completed = True
        milestone.completed_at = timezone.now()
        milestone.save()
        return Response(MilestoneSerializer(milestone).data)


class ProjectTaskViewSet(viewsets.ModelViewSet):
    queryset = ProjectTask.objects.all()
    serializer_class = ProjectTaskSerializer
    permission_classes = [IsAuthenticated]

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
        task.status = 'done'
        task.completed_at = timezone.now()
        task.save()
        
        project = task.project
        total_tasks = ProjectTask.objects.filter(project=project).count()
        completed_tasks = ProjectTask.objects.filter(project=project, status='done').count()
        
        if total_tasks > 0:
            project.progress = int((completed_tasks / total_tasks) * 100)
            project.save()
        
        return Response(ProjectTaskSerializer(task).data)

    @action(detail=False, methods=['get'])
    def my_tasks(self, request):
        tasks = self.queryset.filter(assigned_to=request.user)
        return Response(ProjectTaskSerializer(tasks, many=True).data)


class TimeEntryViewSet(viewsets.ModelViewSet):
    queryset = TimeEntry.objects.all()
    serializer_class = TimeEntrySerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        entry = serializer.save(user=self.request.user)
        if entry.task:
            logged = entry.task.time_entries.aggregate(total=Sum('hours'))['total'] or 0
            entry.task.logged_hours = logged
            entry.task.save()

    @action(detail=False, methods=['get'])
    def my_entries(self, request):
        entries = self.queryset.filter(user=request.user)
        return Response(TimeEntrySerializer(entries, many=True).data)

    @action(detail=False, methods=['get'])
    def report(self, request):
        from_date = request.query_params.get('from')
        to_date = request.query_params.get('to')
        
        queryset = self.queryset.all()
        
        if from_date:
            queryset = queryset.filter(date__gte=from_date)
        if to_date:
            queryset = queryset.filter(date__lte=to_date)
            
        total_hours = queryset.aggregate(total=Sum('hours'))['total'] or 0
        billable_hours = queryset.filter(is_billable=True).aggregate(total=Sum('hours'))['total'] or 0
        
        by_user = queryset.values('user__username').annotate(total=Sum('hours')).order_by('-total')
        by_project = queryset.values('project__name').annotate(total=Sum('hours')).order_by('-total')
        
        return Response({
            'total_hours': float(total_hours),
            'billable_hours': float(billable_hours),
            'by_user': list(by_user),
            'by_project': list(by_project),
            'entries': TimeEntrySerializer(queryset, many=True).data
        })


class ProjectCommentViewSet(viewsets.ModelViewSet):
    queryset = ProjectComment.objects.all()
    serializer_class = ProjectCommentSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
