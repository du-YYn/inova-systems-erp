import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from drf_spectacular.utils import extend_schema

from accounts.permissions import IsAdminOrManagerOrOperator
from .models import SLAPolicy, SupportCategory, SupportTicket, TicketComment, TicketAttachment, KnowledgeBaseArticle
from .serializers import (
    SLAPolicySerializer, SupportCategorySerializer, SupportTicketSerializer,
    TicketCommentSerializer, TicketAttachmentSerializer, KnowledgeBaseArticleSerializer,
)

logger = logging.getLogger('support')


def _generate_ticket_number():
    """Gera número sequencial TKT-00001."""
    from django.db import transaction
    with transaction.atomic():
        last = SupportTicket.objects.select_for_update().order_by('-id').first()
        seq = (last.id if last else 0) + 1
        return f"TKT-{seq:05d}"


def _calculate_sla_deadlines(ticket):
    """Calcula deadlines de SLA baseado na política e prioridade."""
    if not ticket.sla_policy:
        return
    policy = ticket.sla_policy
    now = timezone.now()
    priority = ticket.priority

    response_hours = float(getattr(policy, f'response_time_{priority}', 8))
    resolution_hours = float(getattr(policy, f'resolution_time_{priority}', 24))

    from datetime import timedelta
    ticket.sla_response_deadline = now + timedelta(hours=response_hours)
    ticket.sla_resolution_deadline = now + timedelta(hours=resolution_hours)


@extend_schema(tags=['support'])
class SLAPolicyViewSet(viewsets.ModelViewSet):
    queryset = SLAPolicy.objects.all()
    serializer_class = SLAPolicySerializer
    permission_classes = [IsAdminOrManagerOrOperator]


@extend_schema(tags=['support'])
class SupportCategoryViewSet(viewsets.ModelViewSet):
    queryset = SupportCategory.objects.all()
    serializer_class = SupportCategorySerializer
    permission_classes = [IsAdminOrManagerOrOperator]


@extend_schema(tags=['support'])
class SupportTicketViewSet(viewsets.ModelViewSet):
    queryset = SupportTicket.objects.select_related(
        'customer', 'contract', 'project', 'category', 'sla_policy', 'assigned_to', 'created_by'
    ).prefetch_related('comments')
    serializer_class = SupportTicketSerializer
    permission_classes = [IsAdminOrManagerOrOperator]

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('priority'):
            qs = qs.filter(priority=params['priority'])
        if params.get('customer'):
            qs = qs.filter(customer_id=params['customer'])
        if params.get('assigned_to'):
            qs = qs.filter(assigned_to_id=params['assigned_to'])
        if params.get('search'):
            from django.db.models import Q
            q = params['search']
            qs = qs.filter(Q(title__icontains=q) | Q(number__icontains=q) | Q(description__icontains=q))
        return qs

    def perform_create(self, serializer):
        ticket = serializer.save(
            created_by=self.request.user,
            number=_generate_ticket_number(),
        )
        _calculate_sla_deadlines(ticket)
        ticket.save(update_fields=['sla_response_deadline', 'sla_resolution_deadline'])
        logger.info(f"Ticket criado: #{ticket.number}")

    @action(detail=True, methods=['post'])
    def assign(self, request, pk=None):
        ticket = self.get_object()
        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'error': 'user_id é obrigatório'}, status=status.HTTP_400_BAD_REQUEST)
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'error': 'Usuário não encontrado'}, status=status.HTTP_404_NOT_FOUND)
        ticket.assigned_to = user
        if ticket.status == 'open':
            ticket.status = 'in_progress'
        ticket.save(update_fields=['assigned_to', 'status'])
        return Response(SupportTicketSerializer(ticket).data)

    @action(detail=True, methods=['post'])
    def resolve(self, request, pk=None):
        ticket = self.get_object()
        ticket.status = 'resolved'
        ticket.resolved_at = timezone.now()
        ticket.save(update_fields=['status', 'resolved_at'])
        return Response(SupportTicketSerializer(ticket).data)

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        ticket = self.get_object()
        ticket.status = 'closed'
        ticket.closed_at = timezone.now()
        ticket.save(update_fields=['status', 'closed_at'])
        return Response(SupportTicketSerializer(ticket).data)

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        from django.db.models import Count
        qs = self.get_queryset()
        now = timezone.now()
        return Response({
            'total': qs.count(),
            'open': qs.filter(status='open').count(),
            'in_progress': qs.filter(status='in_progress').count(),
            'pending_client': qs.filter(status='pending_client').count(),
            'resolved': qs.filter(status='resolved').count(),
            'sla_breached': qs.filter(
                sla_resolution_deadline__lt=now,
                status__in=['open', 'in_progress', 'pending_client']
            ).count(),
            'by_priority': list(qs.values('priority').annotate(count=Count('id'))),
            'by_type': list(qs.values('ticket_type').annotate(count=Count('id'))),
        })


@extend_schema(tags=['support'])
class TicketCommentViewSet(viewsets.ModelViewSet):
    queryset = TicketComment.objects.select_related('user', 'ticket')
    serializer_class = TicketCommentSerializer
    permission_classes = [IsAdminOrManagerOrOperator]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = super().get_queryset()
        if ticket_id := self.request.query_params.get('ticket'):
            qs = qs.filter(ticket_id=ticket_id)
        # Viewers só veem comentários não-internos
        if self.request.user.role == 'viewer':
            qs = qs.filter(is_internal=False)
        return qs

    def perform_create(self, serializer):
        comment = serializer.save(user=self.request.user)
        # Marca primeira resposta do ticket
        ticket = comment.ticket
        if not ticket.first_response_at and self.request.user != ticket.created_by:
            ticket.first_response_at = timezone.now()
            ticket.save(update_fields=['first_response_at'])


@extend_schema(tags=['support'])
class KnowledgeBaseArticleViewSet(viewsets.ModelViewSet):
    queryset = KnowledgeBaseArticle.objects.select_related('category', 'project', 'created_by')
    serializer_class = KnowledgeBaseArticleSerializer
    permission_classes = [IsAdminOrManagerOrOperator]

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('category'):
            qs = qs.filter(category_id=params['category'])
        if params.get('search'):
            from django.db.models import Q
            qs = qs.filter(Q(title__icontains=params['search']) | Q(content__icontains=params['search']))
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def publish(self, request, pk=None):
        article = self.get_object()
        article.status = 'published'
        article.save(update_fields=['status'])
        return Response(KnowledgeBaseArticleSerializer(article).data)

    @action(detail=True, methods=['post'])
    def helpful(self, request, pk=None):
        article = self.get_object()
        vote = request.data.get('vote')  # 'helpful' or 'not_helpful'
        if vote == 'helpful':
            article.helpful_count += 1
        elif vote == 'not_helpful':
            article.not_helpful_count += 1
        article.save(update_fields=['helpful_count', 'not_helpful_count'])
        return Response({'helpful': article.helpful_count, 'not_helpful': article.not_helpful_count})
