import io
import logging

from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.conf import settings as django_settings
from django.db import connection, transaction
from django.core.cache import cache
from django.http import HttpResponse
from django.utils import timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

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


# ─────────────────────────────────────────────────────────────────────────────
# Export de dados (PDF) — admin-only. Read-only snapshot dos dados de negócio
# para o admin re-digitar após um upgrade.
# ─────────────────────────────────────────────────────────────────────────────

def _fmt_date(value):
    """Formata date/datetime para dd/mm/aaaa. Retorna '—' se vazio."""
    if not value:
        return '—'
    return value.strftime('%d/%m/%Y')


def _fmt_money(value):
    """Formata valor decimal como R$ 1.234,56 (separadores pt-BR)."""
    try:
        formatted = f'{float(value):,.2f}'
    except (TypeError, ValueError):
        return 'R$ 0,00'
    # Troca separadores en-US (1,234.56) por pt-BR (1.234,56)
    formatted = formatted.replace(',', '_').replace('.', ',').replace('_', '.')
    return f'R$ {formatted}'


def _build_section(story, styles, heading_style, cell_style, title, headers, rows, col_widths):
    """Adiciona uma seção (título + tabela) ao story do PDF."""
    story.append(Paragraph(title, heading_style))
    if not rows:
        story.append(Paragraph('Nenhum registro encontrado.', styles['Italic']))
        story.append(Spacer(1, 0.5 * cm))
        return

    # Envolve cada célula em Paragraph para permitir quebra de linha automática.
    header_cells = [Paragraph(f'<b>{h}</b>', cell_style) for h in headers]
    data = [header_cells]
    for row in rows:
        data.append([Paragraph(str(c), cell_style) for c in row])

    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#A6864A')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F5F5')]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('PADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(table)
    story.append(Paragraph(f'Total: {len(rows)} registro(s).', styles['Italic']))
    story.append(Spacer(1, 0.6 * cm))


@api_view(['GET'])
@permission_classes([IsAdmin])
def export_data(request):
    """Gera um PDF (read-only) com os dados de negócio do ERP.

    Inclui: Clientes, Leads (Prospects), Propostas, Contratos, Projetos e
    Faturas. Destinado ao admin exportar os dados atuais antes de um upgrade.
    """
    from sales.models import Customer, Prospect, Proposal, Contract
    from projects.models import Project
    from finance.models import Invoice
    from core.audit import log_audit

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=landscape(A4),
        rightMargin=1.2 * cm, leftMargin=1.2 * cm,
        topMargin=1.2 * cm, bottomMargin=1.2 * cm,
        title='Inova Systems — Exportação de Dados',
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'export_title', parent=styles['Title'],
        textColor=colors.HexColor('#A6864A'), fontSize=20,
    )
    heading_style = ParagraphStyle(
        'export_heading', parent=styles['Heading2'],
        textColor=colors.HexColor('#1E293B'), spaceBefore=6,
    )
    cell_style = ParagraphStyle(
        'export_cell', parent=styles['Normal'], fontSize=7.5, leading=9,
    )

    story = []
    story.append(Paragraph('INOVA SYSTEMS', title_style))
    story.append(Paragraph('Exportação de Dados', styles['Title']))
    story.append(Paragraph(
        f'Gerado em {timezone.localtime().strftime("%d/%m/%Y %H:%M")} '
        f'por {request.user.username}',
        styles['Normal'],
    ))
    story.append(Spacer(1, 0.6 * cm))

    # ── Clientes ──────────────────────────────────────────────────────────────
    customers = Customer.objects.all().order_by('-created_at')
    _build_section(
        story, styles, heading_style, cell_style,
        'Clientes',
        ['Empresa/Nome', 'Tipo', 'Documento', 'E-mail', 'Telefone',
         'Cidade/UF', 'Valor Contrato', 'Ativo', 'Criado em'],
        [
            [
                c.company_name or c.name or '—',
                c.get_customer_type_display(),
                c.document or '—',
                c.email or '—',
                c.phone or '—',
                f'{c.city}/{c.state}' if c.city or c.state else '—',
                _fmt_money(c.contract_value),
                'Sim' if c.is_active else 'Não',
                _fmt_date(c.created_at),
            ]
            for c in customers
        ],
        col_widths=[5 * cm, 1.5 * cm, 2.5 * cm, 4 * cm, 2.5 * cm,
                    2.5 * cm, 2.5 * cm, 1.2 * cm, 2.3 * cm],
    )

    # ── Leads (Prospects) ─────────────────────────────────────────────────────
    prospects = Prospect.objects.all().order_by('-created_at')
    _build_section(
        story, styles, heading_style, cell_style,
        'Leads (Prospects)',
        ['Empresa', 'Contato', 'E-mail', 'Telefone', 'Origem',
         'Estágio', 'Valor Estimado', 'Criado em'],
        [
            [
                p.company_name or '—',
                p.contact_name or '—',
                p.contact_email or '—',
                p.contact_phone or '—',
                p.get_source_display(),
                p.get_status_display(),
                _fmt_money(p.estimated_value),
                _fmt_date(p.created_at),
            ]
            for p in prospects
        ],
        col_widths=[4.5 * cm, 3.5 * cm, 4 * cm, 2.5 * cm, 2.5 * cm,
                    3.5 * cm, 2.5 * cm, 2.5 * cm],
    )

    # ── Propostas ─────────────────────────────────────────────────────────────
    proposals = Proposal.objects.select_related('customer', 'prospect').order_by('-created_at')
    _build_section(
        story, styles, heading_style, cell_style,
        'Propostas',
        ['Número', 'Título', 'Cliente/Lead', 'Tipo', 'Status',
         'Valor Total', 'Válida até', 'Criada em'],
        [
            [
                p.number or '—',
                p.title or '—',
                (p.customer.company_name or p.customer.name) if p.customer
                else (p.prospect.company_name if p.prospect else '—'),
                p.get_proposal_type_display(),
                p.get_status_display(),
                _fmt_money(p.total_value),
                _fmt_date(p.valid_until),
                _fmt_date(p.created_at),
            ]
            for p in proposals
        ],
        col_widths=[2.3 * cm, 5 * cm, 4 * cm, 3 * cm, 2.5 * cm,
                    2.5 * cm, 2.2 * cm, 2.2 * cm],
    )

    # ── Contratos ─────────────────────────────────────────────────────────────
    contracts = Contract.objects.select_related('customer').order_by('-created_at')
    _build_section(
        story, styles, heading_style, cell_style,
        'Contratos',
        ['Número', 'Título', 'Cliente', 'Status', 'Início', 'Término',
         'Valor Mensal', 'Criado em'],
        [
            [
                c.number or '—',
                c.title or '—',
                (c.customer.company_name or c.customer.name) if c.customer else '—',
                c.get_status_display(),
                _fmt_date(c.start_date),
                _fmt_date(c.end_date),
                _fmt_money(c.monthly_value),
                _fmt_date(c.created_at),
            ]
            for c in contracts
        ],
        col_widths=[2.5 * cm, 5 * cm, 4 * cm, 2.8 * cm, 2.2 * cm,
                    2.2 * cm, 2.5 * cm, 2.3 * cm],
    )

    # ── Projetos ──────────────────────────────────────────────────────────────
    projects = Project.objects.select_related('customer').order_by('-created_at')
    _build_section(
        story, styles, heading_style, cell_style,
        'Projetos',
        ['Nome', 'Cliente', 'Tipo', 'Status', 'Progresso',
         'Início', 'Prazo', 'Orçamento', 'Criado em'],
        [
            [
                pr.name or '—',
                (pr.customer.company_name or pr.customer.name) if pr.customer else '—',
                pr.get_project_type_display(),
                pr.get_status_display(),
                f'{pr.progress}%',
                _fmt_date(pr.start_date),
                _fmt_date(pr.deadline),
                _fmt_money(pr.budget_value),
                _fmt_date(pr.created_at),
            ]
            for pr in projects
        ],
        col_widths=[4.5 * cm, 4 * cm, 3 * cm, 2.5 * cm, 1.8 * cm,
                    2.2 * cm, 2.2 * cm, 2.5 * cm, 2.3 * cm],
    )

    # ── Faturas (Invoices) ────────────────────────────────────────────────────
    invoices = Invoice.objects.select_related('customer').order_by('-issue_date')
    _build_section(
        story, styles, heading_style, cell_style,
        'Faturas',
        ['Número', 'Tipo', 'Cliente', 'Status', 'Emissão',
         'Vencimento', 'Valor', 'Total', 'Criada em'],
        [
            [
                inv.number or '—',
                inv.get_invoice_type_display(),
                (inv.customer.company_name or inv.customer.name) if inv.customer else '—',
                inv.get_status_display(),
                _fmt_date(inv.issue_date),
                _fmt_date(inv.due_date),
                _fmt_money(inv.value),
                _fmt_money(inv.total),
                _fmt_date(inv.created_at),
            ]
            for inv in invoices
        ],
        col_widths=[2.5 * cm, 2.8 * cm, 4 * cm, 2.5 * cm, 2.2 * cm,
                    2.2 * cm, 2.5 * cm, 2.5 * cm, 2.3 * cm],
    )

    doc.build(story)
    buffer.seek(0)

    try:
        log_audit(
            user=request.user,
            action='export_data',
            resource_type='system',
            details='Exportação de dados em PDF',
            request=request,
        )
    except Exception:  # auditoria não deve bloquear o download
        logger.warning('Falha ao registrar auditoria da exportação de dados.', exc_info=True)

    response = HttpResponse(buffer, content_type='application/pdf')
    response['Content-Disposition'] = 'attachment; filename="inova-export-dados.pdf"'
    return response
