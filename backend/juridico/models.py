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
        ('preparacao', 'Preparação'),
        ('envio_assinatura', 'Envio p/ Assinatura'),
        ('aguardando_assinatura', 'Aguardando Assinatura'),
        ('assinado', 'Assinado'),
    ]

    # Ordem canônica das macro-etapas — transições só avançam 1 passo por vez
    # (doc 02 §2). Usada pela validação do endpoint /transition/.
    STATUS_ORDER = ['preparacao', 'envio_assinatura', 'aguardando_assinatura', 'assinado']

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
