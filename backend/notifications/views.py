import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from drf_spectacular.utils import extend_schema

from .models import Notification
from .serializers import NotificationSerializer

logger = logging.getLogger('notifications')


@extend_schema(tags=['notifications'])
class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """Notificações do usuário autenticado."""
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Notification.objects.filter(user=self.request.user)
        if self.request.query_params.get('unread_only') == 'true':
            qs = qs.filter(is_read=False)
        return qs

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.mark_as_read()
        return Response(NotificationSerializer(notification).data)

    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        count = Notification.objects.filter(
            user=request.user, is_read=False
        ).update(is_read=True, read_at=timezone.now())
        return Response({'marked_read': count})

    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        count = Notification.objects.filter(user=request.user, is_read=False).count()
        return Response({'unread_count': count})
