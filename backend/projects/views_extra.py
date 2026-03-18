import secrets
import logging
from datetime import timedelta

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.utils import timezone
from drf_spectacular.utils import extend_schema

from accounts.permissions import IsAdminOrManagerOrOperator
from .models import Sprint, ChangeRequest, ProjectEnvironment, DeliveryApproval
from .serializers_extra import (
    SprintSerializer, ChangeRequestSerializer,
    ProjectEnvironmentSerializer, DeliveryApprovalSerializer,
)

logger = logging.getLogger('projects')


@extend_schema(tags=['projects'])
class SprintViewSet(viewsets.ModelViewSet):
    queryset = Sprint.objects.select_related('project').prefetch_related('tasks')
    serializer_class = SprintSerializer
    permission_classes = [IsAdminOrManagerOrOperator]

    def get_queryset(self):
        queryset = super().get_queryset()
        project_id = self.request.query_params.get('project')
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        return queryset

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        sprint = self.get_object()
        # Close any currently active sprint on the same project
        Sprint.objects.filter(project=sprint.project, status='active').update(status='done')
        sprint.status = 'active'
        sprint.save()
        logger.info(f"Sprint {sprint.id} ativada por {request.user.username}")
        return Response(SprintSerializer(sprint).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        sprint = self.get_object()
        sprint.status = 'done'
        sprint.save()
        logger.info(f"Sprint {sprint.id} concluída por {request.user.username}")
        return Response(SprintSerializer(sprint).data)


@extend_schema(tags=['projects'])
class ChangeRequestViewSet(viewsets.ModelViewSet):
    queryset = ChangeRequest.objects.select_related('project', 'created_by', 'approved_by')
    serializer_class = ChangeRequestSerializer
    permission_classes = [IsAdminOrManagerOrOperator]

    def get_queryset(self):
        queryset = super().get_queryset()
        project_id = self.request.query_params.get('project')
        req_status = self.request.query_params.get('status')
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        if req_status:
            queryset = queryset.filter(status=req_status)
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        change_request = self.get_object()
        change_request.status = 'approved'
        change_request.approved_by = request.user
        change_request.approved_at = timezone.now()
        change_request.save()
        logger.info(f"ChangeRequest {change_request.id} aprovado por {request.user.username}")
        return Response(ChangeRequestSerializer(change_request).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        change_request = self.get_object()
        change_request.status = 'rejected'
        change_request.approved_by = request.user
        change_request.approved_at = timezone.now()
        change_request.save()
        logger.info(f"ChangeRequest {change_request.id} rejeitado por {request.user.username}")
        return Response(ChangeRequestSerializer(change_request).data)


@extend_schema(tags=['projects'])
class ProjectEnvironmentViewSet(viewsets.ModelViewSet):
    queryset = ProjectEnvironment.objects.select_related('project', 'last_deploy_by')
    serializer_class = ProjectEnvironmentSerializer
    permission_classes = [IsAdminOrManagerOrOperator]

    def get_queryset(self):
        queryset = super().get_queryset()
        project_id = self.request.query_params.get('project')
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        return queryset

    @action(detail=True, methods=['post'])
    def deploy(self, request, pk=None):
        environment = self.get_object()
        version = request.data.get('version')
        if not version:
            return Response(
                {'error': 'O campo "version" é obrigatório.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        environment.current_version = version
        environment.last_deploy_at = timezone.now()
        environment.last_deploy_by = request.user
        environment.save()
        logger.info(
            f"Deploy no ambiente {environment.id} ({environment.name}) "
            f"versão {version} por {request.user.username}"
        )
        return Response(ProjectEnvironmentSerializer(environment).data)


@extend_schema(tags=['projects'])
class DeliveryApprovalViewSet(viewsets.ModelViewSet):
    queryset = DeliveryApproval.objects.select_related('milestone', 'project', 'created_by')
    serializer_class = DeliveryApprovalSerializer
    permission_classes = [IsAdminOrManagerOrOperator]
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_queryset(self):
        queryset = super().get_queryset()
        project_id = self.request.query_params.get('project')
        if project_id:
            queryset = queryset.filter(project_id=project_id)
        return queryset

    def perform_create(self, serializer):
        serializer.save(
            created_by=self.request.user,
            token=secrets.token_urlsafe(32),
            expires_at=timezone.now() + timedelta(days=30),
        )

    @action(detail=True, methods=['post'], permission_classes=[AllowAny])
    def respond(self, request, pk=None):
        """Rota pública — cliente responde via token."""
        token = request.data.get('token') or pk
        try:
            approval = DeliveryApproval.objects.get(token=token)
        except DeliveryApproval.DoesNotExist:
            return Response(
                {'error': 'Token de aprovação não encontrado.'},
                status=status.HTTP_404_NOT_FOUND
            )

        if approval.expires_at and approval.expires_at < timezone.now():
            return Response(
                {'error': 'Este link de aprovação expirou.'},
                status=status.HTTP_410_GONE
            )

        new_status = request.data.get('status')
        allowed_statuses = ['approved', 'revision_requested']
        if new_status not in allowed_statuses:
            return Response(
                {'error': f'Status inválido. Use: {allowed_statuses}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        approval.status = new_status
        approval.client_name = request.data.get('client_name', approval.client_name)
        approval.client_email = request.data.get('client_email', approval.client_email)
        approval.feedback = request.data.get('feedback', approval.feedback)

        if new_status == 'approved':
            approval.approved_at = timezone.now()

        approval.save()
        logger.info(f"DeliveryApproval {approval.id} respondida: {new_status}")
        return Response(DeliveryApprovalSerializer(approval).data)
