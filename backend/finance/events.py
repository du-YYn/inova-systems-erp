"""Eventos internos do Financeiro (v32 F4, doc 03 §2 SAÍDA).

EVENTO "entrada paga": quando a Invoice da ENTRADA (1ª parcela do
pré-cadastro) transiciona para `paid`, a Produção é liberada (1 dos 3
critérios do Dia 0). Nesta fase (F4) o evento só loga + audita e chama o
hook `projects.receivers.entrada_paga` SE ele existir (nasce na F5 —
import lazy com try/except). Atrás da flag AUTOMATION_FIN_ENTRADA_PAGA
(off | dry_run | on, default dry_run).

CONVIVÊNCIA (doc 08 §12.1): o caminho legado `_mark_entry_paid`
(sales/views.py, transição para o status deprecado `production`) continua
funcionando por 1 release, com log 'caminho legado'.
"""
import logging

from core.audit import log_audit

from .flags import get_automation_flag
from .services import ROLE_ENTRADA

logger = logging.getLogger('finance')

ENTRADA_PAGA_FLAG = 'AUTOMATION_FIN_ENTRADA_PAGA'
ENTRADA_PAGA_ACTION = 'fin_entrada_paga'
ENTRADA_PAGA_DRY_RUN_ACTION = 'fin_entrada_paga_dry_run'


def is_entrada(invoice) -> bool:
    """True se a invoice é a ENTRADA de um pré-cadastro F4."""
    if not invoice.precadastro_origem_id:
        return False
    details = invoice.payment_details or {}
    return details.get('precadastro_role') == ROLE_ENTRADA


def _call_projects_hook(invoice) -> bool:
    """Chama projects.receivers.entrada_paga se existir (nasce na F5)."""
    try:
        from projects import receivers as projects_receivers
    except ImportError:
        logger.info(
            'Evento entrada_paga: hook projects.receivers ainda nao existe '
            '(esperado ate a F5) — invoice %s.', invoice.id,
        )
        return False
    hook = getattr(projects_receivers, 'entrada_paga', None)
    if not callable(hook):
        return False
    try:
        hook(invoice)
        return True
    except Exception:
        # Falha no consumidor nunca pode quebrar o pagamento da invoice.
        logger.exception(
            'Evento entrada_paga: hook projects.receivers.entrada_paga '
            'falhou para invoice %s.', invoice.id,
        )
        return False


def on_entrada_paga(invoice, old_status: str | None = None):
    """Emite o evento interno 'entrada paga' para a invoice (já `paid`).

    off     -> nada.
    dry_run -> loga + audita o que faria, sem chamar o hook.
    on      -> loga + audita + chama hook projects.receivers.entrada_paga
               se existir (import lazy).
    """
    flag = get_automation_flag(ENTRADA_PAGA_FLAG)
    if flag == 'off':
        return

    payload = {
        'invoice': invoice.id,
        'number': invoice.number,
        'total': str(invoice.total),
        'paid_date': str(invoice.paid_date) if invoice.paid_date else None,
        'customer': invoice.customer_id,
        'prospect': invoice.precadastro_origem_id,
    }

    if flag == 'dry_run':
        logger.info(
            'DRY_RUN %s: emitiria evento entrada_paga para invoice %s '
            '(prospect %s). Sem efeito.',
            ENTRADA_PAGA_FLAG, invoice.id, invoice.precadastro_origem_id,
        )
        log_audit(
            None, ENTRADA_PAGA_DRY_RUN_ACTION, 'invoice', invoice.id,
            details=(
                f'DRY_RUN {ENTRADA_PAGA_FLAG}: emitiria evento entrada_paga '
                f'(gatilho do Dia 0 da Produção) para invoice {invoice.number}.'
            ),
            new_value={**payload, 'dry_run': True},
        )
        return

    hook_called = _call_projects_hook(invoice)
    logger.info(
        'Evento entrada_paga emitido: invoice %s (prospect %s, hook '
        'projects=%s).',
        invoice.id, invoice.precadastro_origem_id,
        'chamado' if hook_called else 'ausente',
    )
    log_audit(
        None, ENTRADA_PAGA_ACTION, 'invoice', invoice.id,
        details=(
            f'Entrada paga — evento emitido para a Produção (Dia 0). '
            f'Invoice {invoice.number}; hook projects '
            f'{"chamado" if hook_called else "ausente (F5)"}.'
        ),
        old_value={'status': old_status} if old_status else None,
        new_value={**payload, 'status': 'paid', 'hook_called': hook_called},
    )
