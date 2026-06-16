"""v32 F5 (Produção) — entidades novas do processo de Produção (doc 04 §3).

Tudo código novo (CONSTRUIR, doc 08 §1): nenhum model existente é alterado
aqui. Importado ao final de projects/models.py para o Django descobrir.

Entidades:
- OnboardingMappingForm  Etapa 4 — roteiro de mapeamento (7 blocos)
- ProjectDocument        Etapa 5 — doc de 12 seções, baseline assinada
- ProjectAudit           Etapa 8 — checklist contra a doc + aprovação
- ReUpdateCycle          Homologação — ciclos de re-update
- WeeklyUpdate           Atualização semanal (paralela ao dev)
- ScheduleVersion        Histórico do Game Plan (snapshot params + plano)
- RecurrenceContract     Mínimo da Parte 6 — nasce na bifurcação
"""
from django.conf import settings
from django.db import models

# Chaves canônicas das 12 seções da documentação do projeto (Etapa 5).
# `ProjectDocument.content` é um JSON {section_key: texto/estrutura}.
PROJECT_DOCUMENT_SECTIONS = [
    'visao_geral',
    'objetivos',
    'escopo_funcional',
    'fora_de_escopo',
    'fluxos_de_processo',
    'modelo_de_dados',
    'integracoes',
    'requisitos_nao_funcionais',
    'design_wireframes',
    'plano_de_testes',
    'cronograma_macro',
    'criterios_de_aceite',
]

# Blocos canônicos do roteiro de mapeamento do onboarding (Etapa 4).
ONBOARDING_FORM_BLOCKS = [
    'contexto_negocio',
    'processos_atuais',
    'dores_objetivos',
    'sistemas_integracoes',
    'usuarios_acessos',
    'dados_migracao',
    'criterios_sucesso',
]


# Ações padrão por etapa do card de Produção (doc 10 — Kanban principal).
# {etapa_key: [texto, ...]} na ORDEM do checklist. Datas vêm do motor
# (scheduling/substeps.py), não daqui. Chaves = Project.ETAPA_CHOICES.
#
# Etapas SEM ações definidas (deferidas — doc 10 "Pontos a fechar" / instrução):
#   - etapa_9_apresentacao  → label "Reunião de Apresentação" (ações a definir)
#   - implementacao         → label "Concluído" (coluna de controle, sem ações)
#   - recorrencia           → label "Implementado" (coluna de controle, sem ações)
# Elas simplesmente não constam no seed (nenhuma ação é semeada).
ETAPA_ACTIONS_SEED = {
    'agendar': [
        'Agendar a reunião de Onboarding junto ao cliente',
    ],
    'etapa_3_preparacao': [  # Planejamento
        'Revisar material do comercial + a proposta (escopo e prazo)',
        'Montar o Game Plan visual',
        'Preparar o roteiro de mapeamento',
    ],
    'etapa_4_onboarding': [  # Onboarding (Dia 0)
        'Apresentar o Game Plan e confirmar prazo + marcos',
        'Aprofundar o processo (mapeamento completo)',
        'Validar e refinar o escopo',
        'Alinhar o modelo de entrega',
        'Mapear dependências do cliente',
        'Fechamento: agendar a reunião de Documentação',
    ],
    'etapa_5_documentacao': [  # Documentação
        'Revisar o material da onboarding',
        'Preencher a documentação seção por seção (12 seções)',
        'Definir prioridades e fases de entrega',
        'Gerar design e wireframes no branding',
        'Revisão interna (escopo fechado)',
        'Preparar a apresentação da Validação',
        'Agendar a reunião de apresentação da arquitetura',
        'Apresentar a doc seção por seção',
        'Validar escopo e exclusões com o cliente',
        'Validar design, fluxos, prioridades e fases',
        'Explicar o processo de mudança',
    ],
    'etapa_6_validacao_doc': [  # Validação da doc (handshake Jurídico)
        'Ajustar a arquitetura se necessário',
        'Enviar para o Jurídico (abre a modalidade Validação no Jurídico)',
    ],
    'etapa_7_desenvolvimento': [  # Desenvolvimento (gate Regra de Ouro)
        'Aprovado para Desenvolvimento (automático quando o Jurídico libera)',
        'Quebrar a doc em fases e tarefas',
        'Desenvolver fase por fase',
        'Acompanhar o progresso (doc + cronograma)',
        'Pedido fora do escopo → processo de mudança (Solicitação de Mudança)',
        'Concluir cada fase → encaminhar pra Auditoria',
        'Atualização semanal (resumo + pendências, dia fixo)',
    ],
    'etapa_8_auditoria': [  # Auditoria interna (sem cliente)
        'Conferir o desenvolvido contra a doc, item por item',
        'Testar fluxos e casos de uso críticos',
        'Testar regras, exceções, permissões e integrações',
        'Verificar segurança, LGPD e performance',
        'Registrar e corrigir bugs',
        'Agendar a reunião de apresentação',
    ],
    # 'homologacao' = label "Janela de teste" (doc 10 §9)
    'homologacao': [
        'Coletar os apontamentos do cliente durante o teste '
        '(fotos, vídeos, áudios e texto)',
        'Organizar os apontamentos pra o Re-Update',
    ],
    # 'registro_entrega' = label "Re-Update" (doc 10 §10)
    'registro_entrega': [
        'Revisar e analisar os apontamentos do cliente',
        'Fazer os ajustes em lote (dentro do escopo)',
        'Atualizar e devolver pro cliente',
        'Repetir o ciclo até o cliente aprovar',
    ],
    # 'etapa_10_graduacao' = label "Homologação" (doc 10 §11 — entrega oficial)
    'etapa_10_graduacao': [
        'Taguear a versão do código (release)',
        'Guardar a doc aprovada como baseline',
        'Registrar data e ambiente do deploy',
        'Agendar a reunião com o cliente',
        'PROJETO → Reunião de Entrega: passar a estrutura ao cliente '
        '(servidores, domínios, código-fonte) e como manter de pé',
        'AUTOMAÇÃO/IA → Reunião de Implementação: implementação oficial '
        'da automação',
    ],
}


class OnboardingMappingForm(models.Model):
    """Etapa 4 — roteiro de mapeamento preenchido na reunião de onboarding."""

    project = models.OneToOneField(
        'projects.Project', on_delete=models.CASCADE,
        related_name='onboarding_form',
    )

    # 7 blocos preenchíveis (doc 04 §3)
    contexto_negocio = models.TextField(
        blank=True, help_text='Bloco 1 — contexto do negócio do cliente')
    processos_atuais = models.TextField(
        blank=True, help_text='Bloco 2 — processos atuais (como opera hoje)')
    dores_objetivos = models.TextField(
        blank=True, help_text='Bloco 3 — dores e objetivos do projeto')
    sistemas_integracoes = models.TextField(
        blank=True, help_text='Bloco 4 — sistemas em uso e integrações')
    usuarios_acessos = models.TextField(
        blank=True, help_text='Bloco 5 — usuários, papéis e acessos')
    dados_migracao = models.TextField(
        blank=True, help_text='Bloco 6 — dados existentes e migração')
    criterios_sucesso = models.TextField(
        blank=True, help_text='Bloco 7 — critérios de sucesso e medições')

    # Respostas estruturadas adicionais (perguntas dinâmicas do roteiro)
    extra_answers = models.JSONField(default=dict, blank=True)

    completed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        null=True, blank=True, related_name='created_onboarding_forms',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'onboarding_mapping_forms'
        ordering = ['-created_at']

    def __str__(self):
        return f'Roteiro de onboarding — {self.project.name}'


class ProjectDocument(models.Model):
    """Etapa 5 — documentação do projeto (12 seções), versionada.

    A versão assinada vira a BASELINE do escopo (regra de ouro: escopo =
    doc aprovada; adição vira ChangeRequest). No máximo 1 baseline corrente
    por projeto (constraint parcial).
    """

    STATUS_CHOICES = [
        ('draft', 'Rascunho'),
        ('pending_validation', 'Aguardando Validação'),
        ('pending_signature', 'Aguardando Assinatura'),
        ('signed', 'Assinada'),
    ]

    project = models.ForeignKey(
        'projects.Project', on_delete=models.CASCADE, related_name='documents')
    version = models.IntegerField(default=1)
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default='draft')

    # 12 seções (PROJECT_DOCUMENT_SECTIONS) — {section_key: conteúdo}
    content = models.JSONField(default=dict, blank=True)
    content_url = models.URLField(
        blank=True, help_text='Link externo do doc (Drive/Notion/etc)')

    # Assinatura (espelha o LegalCase(validacao_documento) do Jurídico)
    autentique_id = models.CharField(max_length=100, blank=True)
    signed_at = models.DateTimeField(null=True, blank=True)
    is_current_baseline = models.BooleanField(default=False)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        null=True, blank=True, related_name='created_project_documents',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'project_documents'
        ordering = ['-version', '-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['project'],
                condition=models.Q(is_current_baseline=True),
                name='uniq_current_baseline_per_project',
            ),
            models.UniqueConstraint(
                fields=['project', 'version'],
                name='uniq_document_version_per_project',
            ),
        ]

    def __str__(self):
        return f'Doc v{self.version} — {self.project.name} ({self.status})'


class ProjectAudit(models.Model):
    """Etapa 8 — auditoria interna contra a doc (destrava a Etapa 9)."""

    project = models.ForeignKey(
        'projects.Project', on_delete=models.CASCADE, related_name='audits')

    # [{"item": str, "ok": bool, "notes": str}, ...]
    checklist = models.JSONField(default=list, blank=True)
    findings = models.TextField(blank=True)

    started_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='approved_project_audits',
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        null=True, blank=True, related_name='created_project_audits',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'project_audits'
        ordering = ['-created_at']

    def __str__(self):
        return f'Auditoria — {self.project.name}'


class ReUpdateCycle(models.Model):
    """Homologação — um ciclo de re-update (apontamentos do cliente)."""

    project = models.ForeignKey(
        'projects.Project', on_delete=models.CASCADE,
        related_name='reupdate_cycles',
    )
    cycle_number = models.IntegerField(default=1)
    client_notes = models.TextField(
        blank=True, help_text='Apontamentos do cliente na janela de teste')

    started_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    worked_weekends = models.IntegerField(
        default=0, help_text='Dias de fim de semana trabalhados (crunch)')

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        null=True, blank=True, related_name='created_reupdate_cycles',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'reupdate_cycles'
        ordering = ['project', 'cycle_number']
        constraints = [
            models.UniqueConstraint(
                fields=['project', 'cycle_number'],
                name='uniq_reupdate_cycle_per_project',
            ),
        ]

    def __str__(self):
        return f'Re-update #{self.cycle_number} — {self.project.name}'


class WeeklyUpdate(models.Model):
    """Atualização semanal ao cliente (paralela ao Desenvolvimento)."""

    SENT_VIA_CHOICES = [
        ('email', 'E-mail'),
        ('whatsapp', 'WhatsApp'),
        ('reuniao', 'Reunião'),
        ('outro', 'Outro'),
    ]

    project = models.ForeignKey(
        'projects.Project', on_delete=models.CASCADE,
        related_name='weekly_updates',
    )
    week_start = models.DateField(help_text='Segunda-feira da semana')
    summary = models.TextField()
    pending_client_items = models.TextField(
        blank=True, help_text='Pendências que dependem do cliente')
    sent_at = models.DateTimeField(null=True, blank=True)
    sent_via = models.CharField(
        max_length=12, choices=SENT_VIA_CHOICES, blank=True, default='')

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        null=True, blank=True, related_name='created_weekly_updates',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'weekly_updates'
        ordering = ['-week_start', '-created_at']

    def __str__(self):
        return f'Update semanal {self.week_start} — {self.project.name}'


class ScheduleVersion(models.Model):
    """Histórico do Game Plan (doc 04 §3 / 07 §10).

    Snapshot imutável: parâmetros usados + plano gerado. Permite comparar
    antes/depois de remarcação e regenerar cronogramas (doc 08 §11.1 R1).
    """

    project = models.ForeignKey(
        'projects.Project', on_delete=models.CASCADE,
        related_name='schedule_versions',
    )
    params = models.JSONField(
        help_text='CronogramaParams serializados usados na geração')
    game_plan = models.JSONField(help_text='GamePlan serializado (saída)')

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        null=True, blank=True, related_name='created_schedule_versions',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'schedule_versions'
        ordering = ['-created_at']

    def __str__(self):
        return f'Game Plan {self.created_at:%Y-%m-%d %H:%M} — {self.project.name}'


class RecurrenceContract(models.Model):
    """Mínimo da Parte 6 (MRR) — nasce na bifurcação da Produção (doc 04 §5).

    Garante a regra de ouro "todo entregue entra em recorrência". O modelo
    completo (faturamento, churn, reajuste) vem na F7.
    """

    KIND_CHOICES = [
        ('suporte_basico', 'Suporte Básico'),
        ('operacao_continua', 'Operação Contínua'),
    ]

    STATUS_CHOICES = [
        ('ativo', 'Ativo'),
        ('encerrado', 'Encerrado'),
    ]

    customer = models.ForeignKey(
        'sales.Customer', on_delete=models.PROTECT,
        related_name='recurrence_contracts',
    )
    project = models.ForeignKey(
        'projects.Project', on_delete=models.PROTECT,
        related_name='recurrence_contracts',
    )
    kind = models.CharField(max_length=20, choices=KIND_CHOICES)
    status = models.CharField(
        max_length=12, choices=STATUS_CHOICES, default='ativo')
    monthly_value = models.DecimalField(
        max_digits=12, decimal_places=2, default=0)
    started_at = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        null=True, blank=True, related_name='created_recurrence_contracts',
        help_text='Null quando criado pela automação da bifurcação',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'recurrence_contracts'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['customer', 'status']),
        ]

    def __str__(self):
        return f'{self.get_kind_display()} — {self.customer} ({self.status})'


class ProjectEtapaAction(models.Model):
    """Ação (item de checklist) de uma etapa, exibida no card (doc 09 item 08 /
    doc 10). Cada ação nasce DATADA pelo motor (substeps.py): `data_prevista`
    é preenchida a partir do Dia 0 (ou da âncora provisória) — não se digita
    data na mão. Entidade nova, somente aditiva.
    """

    project = models.ForeignKey(
        'projects.Project', on_delete=models.CASCADE,
        related_name='etapa_actions',
    )
    # Etapa dona da ação (Project.ETAPA_CHOICES). Texto livre p/ resiliência —
    # não FK a choices, igual ao LegalCaseEvent.
    etapa = models.CharField(max_length=30)
    ordem = models.IntegerField(default=0)
    texto = models.CharField(max_length=300)

    feito = models.BooleanField(default=False)
    feito_em = models.DateTimeField(null=True, blank=True)
    feito_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='completed_etapa_actions',
    )

    # Data calculada pelo motor de cronograma (substeps.py) — read-only na API.
    data_prevista = models.DateField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
        null=True, blank=True, related_name='created_etapa_actions',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'project_etapa_actions'
        ordering = ['project', 'etapa', 'ordem', 'id']
        indexes = [
            models.Index(fields=['project', 'etapa']),
        ]

    def __str__(self):
        return f'[{self.etapa}] {self.texto[:40]} — {self.project_id}'
