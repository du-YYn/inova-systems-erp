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
def email_debug(request):
    """Diagnóstico temporário — remover após resolver."""
    from django.db import connection
    result = {}
    try:
        cursor = connection.cursor()
        cursor.execute("SELECT tablename FROM pg_tables WHERE tablename='email_templates'")
        row = cursor.fetchone()
        result['table_exists'] = bool(row)
    except Exception as e:
        result['table_error'] = str(e)

    try:
        from notifications.models import EmailTemplate
        result['template_count'] = EmailTemplate.objects.count()
        result['templates'] = list(EmailTemplate.objects.values_list('slug', flat=True))
    except Exception as e:
        result['model_error'] = str(e)

    try:
        from notifications.migrations import __path__ as mig_path
        import os
        migs = sorted(os.listdir(mig_path[0]))
        result['migrations_files'] = [m for m in migs if m.endswith('.py') and m != '__init__.py']
    except Exception as e:
        result['migration_list_error'] = str(e)

    try:
        cursor = connection.cursor()
        cursor.execute("SELECT app, name FROM django_migrations WHERE app='notifications' ORDER BY id")
        result['applied_migrations'] = [{'app': r[0], 'name': r[1]} for r in cursor.fetchall()]
    except Exception as e:
        result['applied_migrations_error'] = str(e)

    # Testar a view diretamente
    try:
        from accounts.models import User
        admin = User.objects.filter(role='admin', is_active=True).first()
        result['admin_user'] = admin.username if admin else 'NENHUM ADMIN ENCONTRADO'
        result['admin_role'] = admin.role if admin else None
    except Exception as e:
        result['admin_check_error'] = str(e)

    # Testar a rota do email-templates diretamente
    try:
        from django.urls import reverse
        result['email_templates_url'] = reverse('email-template-list')
    except Exception as e:
        result['reverse_error'] = str(e)

    # Testar o ViewSet diretamente
    try:
        from notifications.views import EmailTemplateViewSet
        from notifications.models import EmailTemplate
        qs = EmailTemplateViewSet.queryset
        result['viewset_queryset_count'] = qs.count()
        result['viewset_class'] = str(EmailTemplateViewSet)
        result['viewset_permissions'] = str(EmailTemplateViewSet.permission_classes)
    except Exception as e:
        result['viewset_error'] = str(e)

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
