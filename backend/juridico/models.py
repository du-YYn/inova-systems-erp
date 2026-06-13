"""Models do CRM Jurídico (v32 F3, doc processo-v32/02-juridico.md).

O Jurídico controla o FLUXO das demandas — não é repositório de documento
(o documento real vive no Autentique). O ERP guarda o card + link/status
do Autentique + data de assinatura. Valor fica só no Financeiro.
"""
from django.conf import settings
from django.db import models

from core.validators import validate_file_extension, validate_file_size


class LegalCase(models.Model):
    """Demanda/caso jurídico pendurado num cliente (nível 2 do CRM Jurídico)."""

    PROCESS_TYPE_CHOICES = [
        ('contrato', 'Contrato'),
        ('validacao_documento', 'Validação de Documento'),
        ('aditivo', 'Aditivo'),
        ('encerramento', 'Encerramento'),
    ]

    STATUS_CHOICES = [
        # Macro-etapas originais do Contrato/Validação (doc 02 §2).
        ('preparacao', 'Preparação'),
        ('envio_assinatura', 'Envio p/ Assinatura'),
        ('aguardando_assinatura', 'Aguardando Assinatura'),
        ('assinado', 'Assinado'),
        # ── Aditivos das modalidades v32 (doc 09 itens 06/07) — ADITIVOS ──
        # NUNCA renomear as chaves acima; só adicionar novas (migration aditiva).
        ('nova_solicitacao', 'Nova solicitação'),   # 1ª coluna do Aditivo
        ('recusado', 'Recusado'),                    # desfecho terminal do Aditivo
        ('aprovado_dev', 'Aprovado para Desenvolvimento'),  # 5ª coluna da Validação
    ]

    # Ordem canônica das macro-etapas POR MODALIDADE (doc 09 itens 06/07).
    # Cada modalidade tem seu próprio fluxo de colunas; transições só avançam
    # 1 passo por vez (doc 02 §2). `assinado`/`recusado`/`aprovado_dev` são
    # terminais. O STATUS_ORDER (Contrato) é mantido por retrocompatibilidade.
    STATUS_ORDER = ['preparacao', 'envio_assinatura', 'aguardando_assinatura', 'assinado']

    # Aditivo: Nova solicitação → Preparação → Aguardando → Assinado/Recusado.
    # `preparacao` embute o "Envio" (sobe no Autentique + envia ao cliente).
    STATUS_ORDER_ADITIVO = [
        'nova_solicitacao', 'preparacao', 'aguardando_assinatura', 'assinado',
    ]
    # Validação: Preparação → Envio → Aguardando → Assinado → Aprovado p/ Dev.
    STATUS_ORDER_VALIDACAO = [
        'preparacao', 'envio_assinatura', 'aguardando_assinatura',
        'assinado', 'aprovado_dev',
    ]

    # Estados terminais por modalidade (não admitem nova transição via /transition/).
    TERMINAL_STATUSES = {'assinado', 'recusado', 'aprovado_dev'}

    @classmethod
    def status_order_for(cls, process_type):
        """Ordem de colunas (transições) da modalidade do caso."""
        if process_type == 'aditivo':
            return cls.STATUS_ORDER_ADITIVO
        if process_type == 'validacao_documento':
            return cls.STATUS_ORDER_VALIDACAO
        return cls.STATUS_ORDER

    SOURCE_CHOICES = [
        ('comercial', 'Comercial'),
        ('producao', 'Produção'),
        ('cliente', 'Cliente'),
    ]

    # ── Relacionamentos ──────────────────────────────────────────────────────
    customer = models.ForeignKey(
        'sales.Customer', on_delete=models.PROTECT,
        related_name='legal_cases',
        help_text='Cliente único (nível 1 do CRM Jurídico)',
    )
    project = models.ForeignKey(
        'projects.Project', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='legal_cases',
    )
    # ── Vínculo por referência (doc 09 item 05) — ADITIVOS ───────────────────
    # O caso aponta para a Coleta de Dados (forms imutável após enviado) e para
    # a Proposta aprovada do prospect. Não copiamos snapshot: o dado nasce
    # congelado no onboarding e os termos vêm da proposta por referência.
    onboarding = models.ForeignKey(
        'sales.ClientOnboarding', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='legal_cases',
        help_text='Coleta de Dados que originou o caso (forms do cliente).',
    )
    proposal = models.ForeignKey(
        'sales.Proposal', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='legal_cases',
        help_text='Proposta aprovada vinculada (termos do contrato).',
    )

    # ── Classificação ────────────────────────────────────────────────────────
    process_type = models.CharField(max_length=30, choices=PROCESS_TYPE_CHOICES)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='preparacao')
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='comercial')

    # ── Autentique (preenchidos via /transition/ hoje; webhook HMAC na F7) ───
    autentique_id = models.CharField(max_length=100, blank=True)
    autentique_link = models.URLField(blank=True)
    signed_at = models.DateTimeField(null=True, blank=True)

    # ── Conteúdo ─────────────────────────────────────────────────────────────
    notes = models.TextField(blank=True, help_text='Info coletada p/ montar o documento')
    attachment = models.FileField(
        upload_to='juridico/attachments/', blank=True, null=True,
        validators=[validate_file_extension, validate_file_size],
    )

    # ── Auditoria ────────────────────────────────────────────────────────────
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        null=True, blank=True, related_name='created_legal_cases',
        help_text='Null quando criado por automação (gatilho da Coleta de Dados)',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'legal_cases'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['process_type', 'status']),
            models.Index(fields=['customer', 'process_type']),
        ]

    def __str__(self):
        return (
            f'{self.get_process_type_display()} — {self.customer} '
            f'({self.get_status_display()})'
        )

    def record_event(self, event_type, *, from_status='', to_status='',
                     from_process_type='', to_process_type='',
                     autentique_link='', signed_at=None, description='',
                     created_by=None, metadata=None):
        """Grava um LegalCaseEvent na timeline do caso (doc 09 item 06).

        Centraliza a criação para que transições/mudanças de modalidade e
        assinaturas (link Autentique + data) fiquem no histórico do card único
        que circula entre modalidades. Não levanta — é chamado de signals/views.
        """
        return LegalCaseEvent.objects.create(
            case=self,
            event_type=event_type,
            from_status=from_status or '',
            to_status=to_status or '',
            from_process_type=from_process_type or '',
            to_process_type=to_process_type or '',
            autentique_link=autentique_link or '',
            signed_at=signed_at,
            description=description or '',
            created_by=created_by,
            metadata=metadata or {},
        )


class LegalCaseEvent(models.Model):
    """Timeline de movimentação de um LegalCase (doc 09 item 06).

    Um único card por cliente circula entre as modalidades; cada passagem
    (mudança de modalidade, mudança de status, documento assinado com link
    Autentique + data) fica registrada aqui — então o contrato assinado não
    se perde, fica no histórico. Entidade nova, somente aditiva.
    """

    EVENT_TYPE_CHOICES = [
        ('created', 'Caso criado'),
        ('status_change', 'Mudança de status'),
        ('modality_change', 'Mudança de modalidade'),
        ('signed', 'Documento assinado'),
        ('rejected', 'Documento recusado'),
        ('linked', 'Vínculo atualizado'),
    ]

    case = models.ForeignKey(
        LegalCase, on_delete=models.CASCADE, related_name='events',
    )
    event_type = models.CharField(max_length=30, choices=EVENT_TYPE_CHOICES)

    # ── Snapshot da transição (texto livre — não FK a choices p/ resiliência) ─
    from_status = models.CharField(max_length=30, blank=True)
    to_status = models.CharField(max_length=30, blank=True)
    from_process_type = models.CharField(max_length=30, blank=True)
    to_process_type = models.CharField(max_length=30, blank=True)

    # ── Assinatura preservada (link Autentique + data) ───────────────────────
    autentique_link = models.URLField(blank=True)
    signed_at = models.DateTimeField(null=True, blank=True)

    description = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='legal_case_events',
        help_text='Null quando gerado por automação.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'legal_case_events'
        ordering = ['created_at', 'id']
        indexes = [
            models.Index(fields=['case', 'created_at']),
        ]

    def __str__(self):
        return f'{self.get_event_type_display()} — caso #{self.case_id}'
