import logging

from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings as django_settings
from django.db import connection, transaction
from django.core.cache import cache

from accounts.permissions import IsAdmin

logger = logging.getLogger('core')


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([])
def health_check(request):
    health = {'status': 'ok', 'services': {}}

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        health['services']['database'] = 'ok'
    except Exception as e:
        health['services']['database'] = 'error' if not django_settings.DEBUG else f'error: {e}'
        health['status'] = 'degraded'

    try:
        cache.set('health_check', 'ok', 10)
        cache.get('health_check')
        health['services']['cache'] = 'ok'
    except Exception as e:
        health['services']['cache'] = 'error' if not django_settings.DEBUG else f'error: {e}'
        health['status'] = 'degraded'

    return Response(health)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def system_info(request):
    return Response({
        'app_name': 'Inova Systems Solutions ERP',
        'version': '1.0.0',
    })



@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([])
def auth_debug(request):
    """Diagnóstico temporário de autenticação — REMOVER após resolver."""
    from django.contrib.auth import authenticate, get_user_model
    User = get_user_model()
    result = {}

    # Listar parceiros
    partners = User.objects.filter(role='partner')
    result['partner_count'] = partners.count()
    result['partners'] = []
    for p in partners:
        result['partners'].append({
            'id': p.id,
            'username': p.username,
            'email': p.email,
            'is_active': p.is_active,
            'has_usable_password': p.has_usable_password(),
        })

    # Testar autenticação do último parceiro
    last = partners.order_by('-id').first()
    if last:
        # Testar com username
        test1 = authenticate(username=last.username, password='test')
        result['auth_test_username'] = {
            'username_used': last.username,
            'result': 'user_found_wrong_pass' if test1 is None else 'OK',
        }
        # Verificar se email == username
        result['email_equals_username'] = last.email == last.username

    # Settings de email
    from django.conf import settings
    result['email_backend'] = settings.EMAIL_BACKEND
    result['cookie_domain'] = getattr(settings, 'JWT_COOKIE_DOMAIN', 'NOT_SET')

    # Testar autenticação com a senha real salva no último registro
    # Buscar a senha enviada no email (está no log ou podemos recuperar do template renderizado)
    if last:
        # Criar uma senha de teste, setar no user, e autenticar
        test_password = 'TestSenha123!'
        last.set_password(test_password)
        last.save(update_fields=['password'])
        test_result = authenticate(username=last.username, password=test_password)
        result['force_password_test'] = 'OK' if test_result else 'FALHOU'
        result['test_password'] = test_password
        result['note'] = f'Senha do parceiro {last.email} resetada para {test_password} para teste. Use essa para logar.'

    # Testar login endpoint internamente
    try:
        from django.test import RequestFactory
        factory = RequestFactory()
        login_request = factory.post(
            '/api/v1/accounts/login/',
            data={'username': last.username, 'password': 'test_wrong'},
            content_type='application/json',
        )
        from accounts.views import LoginView
        login_view = LoginView.as_view()
        login_response = login_view(login_request)
        result['login_endpoint_status'] = login_response.status_code
        result['login_endpoint_response'] = str(login_response.data)[:200]
    except Exception as e:
        result['login_endpoint_error'] = str(e)

    # Verificar CORS
    result['cors_origins'] = [o for o in getattr(settings, 'CORS_ALLOWED_ORIGINS', []) if 'parceiro' in o or 'cadastro' in o]

    # Testar login completo com a senha de teste
    if last:
        try:
            from django.test import Client
            client = Client()
            login_response = client.post(
                '/api/v1/accounts/login/',
                data={'username': last.username, 'password': 'TestSenha123!'},
                content_type='application/json',
            )
            result['full_login_test'] = {
                'status': login_response.status_code,
                'body': str(login_response.json())[:300] if login_response.status_code < 500 else 'SERVER ERROR',
            }
        except Exception as e:
            result['full_login_test_error'] = str(e)

    return Response(result)


@api_view(['POST'])
@permission_classes([IsAdmin])
def reset_data(request):
    """Reseta todos os dados de teste. Mantém config do sistema e usuários."""
    confirm = request.data.get('confirm', '')
    if confirm != 'RESETAR':
        return Response(
            {'error': 'Envie {"confirm": "RESETAR"} para confirmar.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from notifications.models import Notification
    from support.models import TicketAttachment, TicketComment, SupportTicket
    from projects.models import (
        ProjectComment, TimeEntry, ProjectTask, DeliveryApproval,
        Milestone, ProjectEnvironment, ChangeRequest, Sprint,
        ProjectPhase, Project,
    )
    from finance.models import Transaction, Invoice, ClientCost, Budget
    from sales.models import (
        ProposalView, WinLossReason, ProspectMessage, ProspectActivity,
        ClientOnboarding, Proposal, Contract, Prospect, Customer,
    )
    from core.audit import log_audit

    results = {}

    try:
        with transaction.atomic():
            # 1. Notificações
            results['notificacoes'] = Notification.objects.all().delete()[0]

            # 2. Suporte
            results['ticket_anexos'] = TicketAttachment.objects.all().delete()[0]
            results['ticket_comentarios'] = TicketComment.objects.all().delete()[0]
            results['tickets'] = SupportTicket.objects.all().delete()[0]

            # 3. Projetos
            results['projeto_comentarios'] = ProjectComment.objects.all().delete()[0]
            results['horas_lancadas'] = TimeEntry.objects.all().delete()[0]
            results['tarefas'] = ProjectTask.objects.all().delete()[0]
            results['aprovacoes_entrega'] = DeliveryApproval.objects.all().delete()[0]
            results['marcos'] = Milestone.objects.all().delete()[0]
            results['ambientes'] = ProjectEnvironment.objects.all().delete()[0]
            results['change_requests'] = ChangeRequest.objects.all().delete()[0]
            results['sprints'] = Sprint.objects.all().delete()[0]
            results['fases'] = ProjectPhase.objects.all().delete()[0]
            results['projetos'] = Project.objects.all().delete()[0]

            # 4. Financeiro
            results['transacoes'] = Transaction.objects.all().delete()[0]
            results['faturas'] = Invoice.objects.all().delete()[0]
            results['custos_cliente'] = ClientCost.objects.all().delete()[0]

            # 5. Vendas/CRM
            results['visualizacoes_proposta'] = ProposalView.objects.all().delete()[0]
            results['win_loss'] = WinLossReason.objects.all().delete()[0]
            results['mensagens'] = ProspectMessage.objects.all().delete()[0]
            results['atividades'] = ProspectActivity.objects.all().delete()[0]
            results['onboardings'] = ClientOnboarding.objects.all().delete()[0]
            results['propostas'] = Proposal.objects.all().delete()[0]
            results['contratos'] = Contract.objects.all().delete()[0]
            results['prospects'] = Prospect.objects.all().delete()[0]
            results['clientes'] = Customer.objects.all().delete()[0]

            # 6. Recalcular Budget.actual
            Budget.objects.all().update(actual=0)

        # Log de auditoria
        total = sum(results.values())
        log_audit(
            user=request.user,
            action='reset_data',
            resource_type='system',
            details=f'Reset completo: {total} registros removidos',
        )
        logger.warning(
            f"RESET DE DADOS executado por {request.user.username}. "
            f"Total: {total} registros removidos. Detalhes: {results}"
        )

        return Response({
            'success': True,
            'message': f'{total} registros removidos.',
            'detalhes': results,
        })

    except Exception as e:
        logger.error(f"Erro no reset de dados: {e}", exc_info=True)
        return Response(
            {'error': f'Erro ao resetar dados: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
