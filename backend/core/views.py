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



@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([])
def auth_debug(request):
    """Diagnóstico: testa login com email+senha. NÃO altera dados. REMOVER após resolver."""
    from django.contrib.auth import authenticate, get_user_model
    User = get_user_model()

    email = request.data.get('email', '')
    password = request.data.get('password', '')

    if not email or not password:
        # GET — info geral
        partners = User.objects.filter(role='partner').values('id', 'username', 'email', 'is_active')
        return Response({
            'partners': list(partners),
            'usage': 'POST com {"email": "...", "password": "..."} para testar login',
        })

    result = {'email_input': email, 'password_length': len(password)}

    # Passo 1: Buscar user por email
    try:
        user = User.objects.get(email=email)
        result['step1_user_found'] = True
        result['step1_username'] = user.username
        result['step1_is_active'] = user.is_active
        result['step1_has_password'] = user.has_usable_password()
        result['step1_role'] = user.role
    except User.DoesNotExist:
        result['step1_user_found'] = False
        result['step1_error'] = f'Nenhum user com email={email}'
        return Response(result)

    # Passo 2: Testar check_password direto
    result['step2_check_password'] = user.check_password(password)

    # Passo 3: Testar authenticate
    auth_result = authenticate(username=user.username, password=password)
    result['step3_authenticate'] = 'OK' if auth_result else 'FALHOU'

    # Passo 4: Se check_password OK mas authenticate falha, o problema é no backend
    if result['step2_check_password'] and not auth_result:
        result['step4_diagnosis'] = 'check_password OK mas authenticate falhou — possível AUTHENTICATION_BACKENDS customizado'
    elif not result['step2_check_password']:
        result['step4_diagnosis'] = 'Senha INCORRETA — a senha fornecida não bate com o hash no banco'
    else:
        result['step4_diagnosis'] = 'Tudo OK — login deveria funcionar'

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
