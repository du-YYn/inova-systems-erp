"""Modelos fixos de checklist por (process_type, stage) + semeadura idempotente.

Conteúdo derivado do doc 02 §2 e doc 09 §06/07. Fixo em código (não configurável
por admin nesta fase). As tarefas semeadas têm is_custom=False; itens avulsos
(is_custom=True) são adicionados pelo jurídico no card.
"""
from .models import LegalCaseTask

CHECKLIST_TEMPLATES = {
    # ── Contrato ──────────────────────────────────────────────────────────────
    ('contrato', 'preparacao'): [
        'Elaborar a minuta do contrato',
        'Anexar o documento no card',
        'Subir o documento no Autentique',
    ],
    ('contrato', 'envio_assinatura'): [
        'Enviar ao cliente para assinatura',
        'Confirmar que o cliente recebeu',
    ],
    ('contrato', 'aguardando_assinatura'): [
        'Acompanhar a assinatura no Autentique',
    ],
    ('contrato', 'assinado'): [
        'Confirmar o documento assinado',
        'Conferir o link do documento assinado',
    ],
    # ── Validação de Documento ────────────────────────────────────────────────
    ('validacao_documento', 'preparacao'): [
        'Conferir o documento recebido da Produção',
        'Anexar o termo no card',
        'Subir o documento no Autentique',
    ],
    ('validacao_documento', 'envio_assinatura'): [
        'Enviar ao cliente para validação/assinatura',
    ],
    ('validacao_documento', 'aguardando_assinatura'): [
        'Acompanhar a assinatura no Autentique',
    ],
    ('validacao_documento', 'assinado'): [
        'Confirmar o documento assinado',
    ],
    ('validacao_documento', 'aprovado_dev'): [
        'Liberar para Desenvolvimento',
    ],
    # ── Aditivo ───────────────────────────────────────────────────────────────
    ('aditivo', 'nova_solicitacao'): [
        'Revisar a Solicitação de Mudança (escopo + valor)',
        'Confirmar o valor do aditivo',
    ],
    ('aditivo', 'preparacao'): [
        'Elaborar o aditivo',
        'Anexar o documento no card',
        'Subir no Autentique e enviar ao cliente',
    ],
    ('aditivo', 'aguardando_assinatura'): [
        'Acompanhar a assinatura no Autentique',
    ],
    ('aditivo', 'assinado'): [
        'Confirmar o documento assinado',
    ],
    ('aditivo', 'recusado'): [
        'Registrar o motivo da recusa',
    ],
    # ── Encerramento ──────────────────────────────────────────────────────────
    ('encerramento', 'preparacao'): [
        'Analisar pendências do cliente',
        'Elaborar o distrato',
    ],
    ('encerramento', 'envio_assinatura'): [
        'Enviar o distrato para assinatura',
    ],
    ('encerramento', 'aguardando_assinatura'): [
        'Acompanhar a assinatura no Autentique',
    ],
    ('encerramento', 'assinado'): [
        'Confirmar o encerramento assinado',
    ],
}


def seed_stage_tasks(case, stage):
    """Cria as tarefas-modelo de (case.process_type, stage) se ainda não existirem.

    Idempotente: se já há QUALQUER tarefa para aquele (case, stage), não faz nada
    (preserva marcações e itens avulsos). Retorna a lista de tarefas criadas.
    """
    if case.tasks.filter(stage=stage).exists():
        return []
    labels = CHECKLIST_TEMPLATES.get((case.process_type, stage), [])
    return [
        LegalCaseTask.objects.create(
            case=case, stage=stage, label=label, order=i, is_custom=False,
        )
        for i, label in enumerate(labels)
    ]
