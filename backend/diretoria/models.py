"""Models da Diretoria (v32 F6, doc processo-v32/06-diretoria.md).

A Diretoria não é raia de fluxo: é ponto de decisão e governança transversal.
Recebe os chamados inconclusivos do Suporte (DirectorEscalation) e estrutura
a reunião semanal (DirectoryMeeting).
"""
from django.conf import settings
from django.db import models


class DirectorEscalation(models.Model):
    """Escalação de chamado inconclusivo do Suporte (doc 06 §1).

    01° recebe resumo + evidência · 02° decide · 03° devolve a decisão pro
    fluxo (atualiza SupportTicket.conclusao/status conforme a decisão).
    """

    DECISION_CHOICES = [
        ('absorver', 'Absorver'),    # corrige sem custo → ticket conclusao=garantia
        ('cobrar', 'Cobrar'),        # vira orçamento → ticket conclusao=orcamento
        ('negociar', 'Negociar'),    # vira orçamento negociado → conclusao=orcamento
        ('rejeitar', 'Rejeitar'),    # não procede → ticket fechado
    ]

    originating_ticket = models.ForeignKey(
        'support.SupportTicket', on_delete=models.PROTECT,
        related_name='escalations',
        help_text='Chamado do Suporte com conclusao=inconclusivo',
    )
    raised_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        null=True, blank=True, related_name='raised_escalations',
        help_text='Null quando criada por automação (gatilho da Análise)',
    )
    summary = models.TextField(help_text='Resumo do caso (01°)')
    evidence = models.TextField(blank=True, help_text='Evidência anexada ao resumo (01°)')

    # ── Decisão (02°) — escrita apenas via POST /decide/ ─────────────────────
    decision = models.CharField(
        max_length=10, choices=DECISION_CHOICES, blank=True, default='',
    )
    decision_notes = models.TextField(blank=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        null=True, blank=True, related_name='decided_escalations',
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    resolved = models.BooleanField(
        default=False, help_text='Decisão devolvida ao fluxo do Suporte (03°)',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'director_escalations'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['resolved']),
        ]

    def __str__(self):
        ticket = self.originating_ticket
        return f'Escalação #{self.id} — ticket {ticket.number} ({self.decision or "pendente"})'


class DirectoryMeeting(models.Model):
    """Reunião semanal de diretoria, estruturada (doc 06 §2).

    agenda_review: checklist das 6 áreas (comercial/funil, metas/indicadores,
    carteira, financeiro, produção/projetos, suporte). decisions: decisões e
    prioridades da semana. O painel agrega KPIs dos módulos existentes — sem
    duplicar dado (leitura dos endpoints que já existem; integração F7).
    """

    date = models.DateField()
    week_ref = models.CharField(
        max_length=10, blank=True, default='',
        help_text='Referência da semana, ex: 2026-W24',
    )
    attendees = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name='directory_meetings',
    )
    agenda_review = models.JSONField(
        default=dict, blank=True,
        help_text='Checklist das 6 áreas revisadas na reunião',
    )
    decisions = models.JSONField(
        default=list, blank=True,
        help_text='Decisões e prioridades da semana',
    )
    notes = models.TextField(blank=True, help_text='Ata da reunião')

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        null=True, blank=True, related_name='created_directory_meetings',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'directory_meetings'
        ordering = ['-date']

    def __str__(self):
        return f'Reunião de diretoria — {self.date.isoformat()}'
