"""v32 ajustes (doc 09 item 08 + doc 10) — data migration: semeia as ações
padrão de checklist por etapa nos projetos existentes. SOMENTE ADITIVO.

O que faz (doc 10 — Kanban principal):
- Para cada Project não-cancelado SEM nenhuma ProjectEtapaAction, cria as ações
  padrão de TODAS as etapas com ações definidas em ETAPA_ACTIONS_SEED.
  As datas (`data_prevista`) NÃO são preenchidas aqui — vêm do motor de
  cronograma depois; o seed só cria o texto/ordem do checklist.

Etapas sem ações no seed (deferidas — doc 10): etapa_9_apresentacao ("Reunião
de Apresentação"), implementacao ("Concluído"), recorrencia ("Implementado").
Elas não constam em ETAPA_ACTIONS_SEED, logo nenhuma ação é semeada para elas.

Idempotência: pula qualquer projeto que JÁ tenha ações (não duplica). Tabela
projects é pequena em produção (dezenas de linhas) → bulk_create único, sem
backfill em lotes (doc 08 §4.2/§4.3).

Reverse: NOOP documentado. As ações semeadas são dados aditivos; o reverse da
0006 remove a tabela inteira (ProjectEtapaAction), então não há estado a
restaurar manualmente. Re-aplicar é idempotente (pula projetos já semeados).
"""
from django.db import migrations

# Espelha projects.models_v32.ETAPA_ACTIONS_SEED no momento desta migration.
# (Embutido aqui para a migration não depender de import do app em runtime de
# migração — padrão de migrations de dados auto-contidas.)
ETAPA_ACTIONS_SEED = {
    'agendar': [
        'Agendar a reunião de Onboarding junto ao cliente',
    ],
    'etapa_3_preparacao': [
        'Revisar material do comercial + a proposta (escopo e prazo)',
        'Montar o Game Plan visual',
        'Preparar o roteiro de mapeamento',
    ],
    'etapa_4_onboarding': [
        'Apresentar o Game Plan e confirmar prazo + marcos',
        'Aprofundar o processo (mapeamento completo)',
        'Validar e refinar o escopo',
        'Alinhar o modelo de entrega',
        'Mapear dependências do cliente',
        'Fechamento: agendar a reunião de Documentação',
    ],
    'etapa_5_documentacao': [
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
    'etapa_6_validacao_doc': [
        'Ajustar a arquitetura se necessário',
        'Enviar para o Jurídico (abre a modalidade Validação no Jurídico)',
    ],
    'etapa_7_desenvolvimento': [
        'Aprovado para Desenvolvimento (automático quando o Jurídico libera)',
        'Quebrar a doc em fases e tarefas',
        'Desenvolver fase por fase',
        'Acompanhar o progresso (doc + cronograma)',
        'Pedido fora do escopo → processo de mudança (Solicitação de Mudança)',
        'Concluir cada fase → encaminhar pra Auditoria',
        'Atualização semanal (resumo + pendências, dia fixo)',
    ],
    'etapa_8_auditoria': [
        'Conferir o desenvolvido contra a doc, item por item',
        'Testar fluxos e casos de uso críticos',
        'Testar regras, exceções, permissões e integrações',
        'Verificar segurança, LGPD e performance',
        'Registrar e corrigir bugs',
        'Agendar a reunião de apresentação',
    ],
    'homologacao': [
        'Coletar os apontamentos do cliente durante o teste '
        '(fotos, vídeos, áudios e texto)',
        'Organizar os apontamentos pra o Re-Update',
    ],
    'registro_entrega': [
        'Revisar e analisar os apontamentos do cliente',
        'Fazer os ajustes em lote (dentro do escopo)',
        'Atualizar e devolver pro cliente',
        'Repetir o ciclo até o cliente aprovar',
    ],
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


def forward(apps, schema_editor):
    """Semeia as ações padrão nos projetos existentes (idempotente)."""
    Project = apps.get_model('projects', 'Project')
    ProjectEtapaAction = apps.get_model('projects', 'ProjectEtapaAction')

    to_create = []
    for project in Project.objects.exclude(situacao='cancelado').iterator():
        if ProjectEtapaAction.objects.filter(project=project).exists():
            continue  # idempotente: projeto já semeado
        for etapa, textos in ETAPA_ACTIONS_SEED.items():
            for ordem, texto in enumerate(textos, start=1):
                to_create.append(ProjectEtapaAction(
                    project=project, etapa=etapa, ordem=ordem, texto=texto,
                ))
    if to_create:
        ProjectEtapaAction.objects.bulk_create(to_create, batch_size=500)


def backward(apps, schema_editor):
    """NOOP intencional: dados aditivos; reverse da 0006 remove a tabela."""


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0006_project_onboarding_agendado_em_and_more'),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
