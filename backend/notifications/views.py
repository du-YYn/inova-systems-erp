import logging
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from drf_spectacular.utils import extend_schema

from .models import Notification, EmailTemplate
from .serializers import NotificationSerializer, EmailTemplateSerializer

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


@extend_schema(tags=['email-templates'])
class EmailTemplateViewSet(viewsets.ModelViewSet):
    """CRUD de templates de email (somente admin)."""
    queryset = EmailTemplate.objects.all()
    serializer_class = EmailTemplateSerializer
    http_method_names = ['get', 'patch', 'head', 'options']
    pagination_class = None  # Poucos templates — não precisa paginar

    def get_permissions(self):
        from accounts.permissions import IsAdmin
        return [IsAdmin()]

    @action(detail=True, methods=['post'])
    def preview(self, request, pk=None):
        """Renderiza preview com dados fictícios."""
        from .email_renderer import render_template
        template = self.get_object()
        # Gerar variáveis fictícias
        fake_vars = {}
        for var in template.variables:
            key = var.get('key', '')
            if 'link' in key:
                fake_vars[key] = 'https://exemplo.com/link'
            elif 'email' in key:
                fake_vars[key] = 'exemplo@empresa.com'
            elif 'senha' in key:
                fake_vars[key] = '••••••••'
            elif 'valor' in key or 'comissao' in key:
                fake_vars[key] = 'R$ 1.500,00'
            else:
                fake_vars[key] = f'[{var.get("description", key)}]'
        result = render_template(template.slug, fake_vars)
        if not result:
            return Response({'error': 'Template inativo ou não encontrado.'}, status=400)
        return Response(result)

    @action(detail=True, methods=['post'])
    def test(self, request, pk=None):
        """Envia email de teste para um endereço."""
        from .email_renderer import send_template_email_sync
        template = self.get_object()
        email = request.data.get('email', request.user.email)
        if not email:
            return Response({'error': 'Informe um email.'}, status=400)
        # Gerar variáveis fictícias
        fake_vars = {}
        for var in template.variables:
            key = var.get('key', '')
            if 'link' in key:
                fake_vars[key] = 'https://exemplo.com/link-teste'
            elif 'email' in key:
                fake_vars[key] = email
            elif 'senha' in key:
                fake_vars[key] = 'SenhaTest123'
            elif 'valor' in key or 'comissao' in key:
                fake_vars[key] = 'R$ 1.500,00'
            else:
                fake_vars[key] = f'[{var.get("description", key)}]'
        success = send_template_email_sync(template.slug, email, fake_vars)
        if success:
            return Response({'success': True, 'message': f'Email de teste enviado para {email}'})
        return Response({'error': 'Falha ao enviar. Verifique a configuração de email.'}, status=500)
