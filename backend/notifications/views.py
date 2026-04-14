import logging
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from accounts.permissions import IsAdmin
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
    http_method_names = ['get', 'patch', 'post', 'head', 'options']
    pagination_class = None  # Poucos templates — não precisa paginar

    permission_classes = [IsAdmin]

    def list(self, request, *args, **kwargs):
        # Se não há templates, criar os padrão
        if not EmailTemplate.objects.exists():
            self._create_defaults()
        return super().list(request, *args, **kwargs)

    @staticmethod
    def _create_defaults():
        """Cria templates padrão se a tabela estiver vazia."""
        BASE = (
            '<div style="background:#0a0a0a;padding:40px 20px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">'
            '<div style="max-width:560px;margin:0 auto;background:#111;border-radius:16px;border:1px solid #1a1a1a;overflow:hidden;">'
            '<div style="padding:24px 32px;border-bottom:1px solid #1a1a1a;text-align:center;">'
            '<h1 style="color:#A6864A;font-size:24px;margin:0;">Inova.</h1>'
            '<p style="color:#666;font-size:12px;margin:4px 0 0;">Systems Solutions</p></div>'
            '<div style="padding:32px;">{body}</div>'
            '<div style="padding:16px 32px;border-top:1px solid #1a1a1a;text-align:center;">'
            '<p style="color:#555;font-size:11px;margin:0;">Inova Systems Solutions</p></div></div></div>'
        )
        def w(body):
            return BASE.replace('{body}', body)

        defaults = [
            ('welcome_partner', 'Boas-vindas Parceiro', 'Bem-vindo ao programa de parceiros — Inova Systems', 'partner',
             [{'key': 'nome', 'description': 'Nome do parceiro'}, {'key': 'email', 'description': 'Email'}, {'key': 'senha', 'description': 'Senha'}, {'key': 'link_portal', 'description': 'Link do portal'}],
             w('<h2 style="color:#fff;font-size:20px;margin:0 0 8px;">Bem-vindo, {{nome}}!</h2>'
               '<p style="color:#999;font-size:14px;line-height:1.6;">Você foi cadastrado como parceiro de indicação da Inova Systems. Abaixo estão seus dados de acesso:</p>'
               '<div style="background:#0a0a0a;border-radius:12px;padding:20px;margin:20px 0;">'
               '<p style="color:#999;font-size:13px;margin:0 0 8px;"><strong style="color:#ccc;">Email:</strong> {{email}}</p>'
               '<p style="color:#999;font-size:13px;margin:0;"><strong style="color:#ccc;">Senha:</strong> {{senha}}</p>'
               '</div>'
               '<p style="color:#999;font-size:14px;">Recomendamos alterar sua senha no primeiro acesso.</p>'
               '<div style="text-align:center;margin:28px 0 0;">'
               '<a href="{{link_portal}}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#A6864A,#c9a75e);color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:12px;">Acessar Portal do Parceiro</a>'
               '</div>'
               '<p style="color:#666;font-size:12px;margin:16px 0 0;text-align:center;">Ou copie e cole este link no navegador:<br><span style="color:#A6864A;">{{link_portal}}</span></p>')),
            ('password_reset', 'Redefinição de Senha', 'Redefinição de senha — Inova Systems', 'requester',
             [{'key': 'nome', 'description': 'Nome'}, {'key': 'link_reset', 'description': 'Link de reset'}],
             w('<h2 style="color:#fff;font-size:20px;margin:0 0 8px;">Redefinição de Senha</h2><p style="color:#999;font-size:14px;">Olá, {{nome}}. Clique abaixo para redefinir sua senha (válido por 24h).</p><div style="text-align:center;margin:20px 0;"><a href="{{link_reset}}" style="padding:14px 32px;background:#A6864A;color:#fff;text-decoration:none;border-radius:12px;font-weight:600;">Redefinir Senha</a></div>')),
            ('lead_received', 'Novo Lead de Parceiro', 'Novo lead indicado: {{empresa_lead}}', 'team',
             [{'key': 'nome_parceiro', 'description': 'Parceiro'}, {'key': 'partner_id', 'description': 'ID'}, {'key': 'empresa_lead', 'description': 'Empresa'}],
             w('<h2 style="color:#fff;font-size:20px;margin:0 0 8px;">Novo Lead</h2><p style="color:#999;font-size:14px;">Parceiro <strong style="color:#A6864A;">{{nome_parceiro}}</strong> ({{partner_id}}) indicou: <strong style="color:#fff;">{{empresa_lead}}</strong></p>')),
            ('lead_closed', 'Lead Fechado — Comissão', 'Seu lead {{empresa_lead}} foi fechado!', 'partner',
             [{'key': 'nome_parceiro', 'description': 'Parceiro'}, {'key': 'empresa_lead', 'description': 'Empresa'}, {'key': 'valor_projeto', 'description': 'Valor'}, {'key': 'valor_comissao', 'description': 'Comissão'}],
             w('<h2 style="color:#fff;font-size:20px;margin:0 0 8px;">Lead Fechado!</h2><p style="color:#999;">{{nome_parceiro}}, seu lead <strong style="color:#fff;">{{empresa_lead}}</strong> fechou!</p><p style="color:#999;">Projeto: {{valor_projeto}}</p><p style="color:#A6864A;font-size:18px;font-weight:700;">Comissão: {{valor_comissao}}</p>')),
            ('onboarding_submitted_client', 'Cadastro Recebido — Cliente', 'Cadastro recebido — Inova Systems', 'client',
             [{'key': 'nome_representante', 'description': 'Representante'}, {'key': 'empresa', 'description': 'Empresa'}],
             w('<h2 style="color:#fff;font-size:20px;margin:0 0 8px;">Cadastro Recebido!</h2><p style="color:#999;font-size:14px;">Olá, {{nome_representante}}. Os dados de <strong style="color:#fff;">{{empresa}}</strong> foram recebidos. O projeto está em andamento!</p>')),
            ('onboarding_submitted_team', 'Cadastro Recebido — Equipe', 'Cadastro preenchido: {{empresa}}', 'team',
             [{'key': 'empresa', 'description': 'Empresa'}, {'key': 'nome_representante', 'description': 'Representante'}, {'key': 'cnpj', 'description': 'CNPJ'}],
             w('<h2 style="color:#fff;font-size:20px;margin:0 0 8px;">Cadastro Preenchido</h2><p style="color:#999;">Empresa: <strong style="color:#fff;">{{empresa}}</strong><br>Representante: {{nome_representante}}<br>CNPJ: {{cnpj}}</p>')),
        ]
        for slug, name, subject, rtype, variables, body_html in defaults:
            obj, created = EmailTemplate.objects.get_or_create(slug=slug, defaults={
                'name': name, 'subject': subject, 'recipient_type': rtype,
                'variables': variables, 'body_html': body_html,
            })
            if not created:
                # Atualizar template existente se body estiver diferente
                obj.body_html = body_html
                obj.variables = variables
                obj.save(update_fields=['body_html', 'variables'])

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
