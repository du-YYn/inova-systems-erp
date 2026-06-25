# Design · CRM Jurídico — Card vira workspace por etapa

> **Data:** 2026-06-25 · **Status:** design validado (brainstorming), aguardando revisão do spec
> **Escopo:** app `backend/juridico/` + `frontend/app/(dashboard)/juridico/page.tsx`
> **Origem:** hoje o card do Jurídico só permite *avançar* (e *recusar* no Aditivo); todo o
> detalhe é read-only. Objetivo: cada etapa do processo ter ações concretas que o jurídico
> executa, não só mover o card.

## 1. Problema

A tela `frontend/app/(dashboard)/juridico/page.tsx` é um kanban com abas por modalidade
(Contrato, Validação, Aditivo, Encerramento). Por card só existem duas ações reais: **Avançar**
(1 etapa) e **Recusar** (só Aditivo/Aguardando). O modal de detalhe é 100% leitura
(Dados do Cliente, Proposta, Notas, Histórico). Campos do model `LegalCase` ficam subutilizados:
`attachment` (FileField nunca exposto na UI) e `notes` (editável só na criação). O doc
`docs/processo-v32/02-juridico.md §2` descreve sub-tarefas por etapa (elaborar contrato, anexar
termo, analisar pendências, elaborar distrato) que **não existem como ação** na interface.

## 2. Decisões (brainstorming 2026-06-25)

| # | Pergunta | Decisão |
|---|---|---|
| Q1 | O que falta no card | **Checklist guiado por etapa + ferramentas que executam** (os dois) |
| Q2 | Onde vive o documento | **Rascunho/minuta no ERP (campo `attachment`) + link do Autentique** |
| Q3 | Origem dos itens do checklist | **Modelo fixo por etapa (em código) + itens avulsos por card** (sem tela de admin) |
| Q4 | Checklist bloqueia avançar? | **Não — só orienta, com aviso** ("N tarefas pendentes"). O documento no Autentique é a trava real |
| Q5 | Alcance | **As 4 modalidades** (mesmo mecanismo; muda só o conteúdo do checklist) |
| Abordagem | Onde as ações vivem | **A — Workspace no modal**: mantém kanban + Avançar; o detalhe vira área de trabalho |

## 3. UX — o workspace do card (Abordagem A)

Kanban e botão **Avançar** continuam iguais. O modal de detalhe deixa de ser só-leitura e passa a
ter duas zonas:

**Zona 1 — Etapa atual (topo, destaque dourado `#A6864A`):**
- Cabeçalho com a etapa + progresso `N de M tarefas`.
- **Checklist da etapa atual**: itens marcáveis (cada um com quem/quando concluiu); `＋ adicionar
  tarefa` (item avulso); `✕` para remover um item daquele card.
- **3 ferramentas inline** (abrem ali mesmo, sem sair do modal):
  - 📎 **Anexar documento** — sobe/troca o arquivo no ERP (`attachment`); mostra o atual com download.
  - ✎ **Editar notas** — textarea inline com salvar.
  - 🔗 **Link Autentique** — informar/corrigir `autentique_id` + `autentique_link`.
- **Avançar p/ [próxima etapa]** + aviso `⚠ tarefas pendentes` quando houver (não bloqueia).
  No Aditivo/Aguardando, também o **Recusar**.

**Zona 2 — Contexto (embaixo, seções recolhíveis):** os painéis já existentes — 🏢 Dados do
Cliente, 📄 Proposta Fechada, 🕑 Histórico — agora colapsáveis, para a etapa atual respirar.

**Card no kanban (rosto):** indicador discreto de progresso `✓ N/M` da etapa atual.

Anexo de minuta e mudança de link **geram evento na timeline** (Histórico). As tarefas do checklist
guardam quem/quando concluiu na própria lista (`done_by`/`done_at`) e **não** poluem a timeline.

Mockups de referência: `.superpowers/brainstorm/.../workspace.html` (não versionado).

## 4. Modelo de dados (backend, aditivo)

### 4.1 Nova tabela `legal_case_tasks` (`LegalCaseTask`)

| campo | tipo | papel |
|---|---|---|
| `case` | FK→LegalCase (`related_name='tasks'`, `on_delete=CASCADE`) | dono |
| `stage` | CharField(30) | status/etapa a que a tarefa pertence (`preparacao`, `envio_assinatura`, …) |
| `label` | CharField(255) | texto da tarefa |
| `done` | BooleanField(default=False) | concluída? |
| `done_at` | DateTimeField(null=True, blank=True) | quando concluiu |
| `done_by` | FK→User(null=True, SET_NULL) | quem concluiu |
| `order` | PositiveIntegerField(default=0) | ordenação dentro da etapa |
| `is_custom` | BooleanField(default=False) | `False` = veio do modelo; `True` = avulsa |
| `created_at` / `updated_at` | auto | auditoria |

`Meta`: `db_table='legal_case_tasks'`, `ordering=['stage','order','id']`, índice em `(case, stage)`.

### 4.2 Modelos fixos de checklist

Constante em `backend/juridico/checklists.py`:
`CHECKLIST_TEMPLATES: dict[(process_type, stage)] -> list[str]`. Conteúdo inicial (derivado do
doc 02 §2 e doc 09 §06/07 — facilmente editável; **não** configurável por admin nesta fase):

**Contrato** (`preparacao → envio_assinatura → aguardando_assinatura → assinado`)
- `preparacao`: Elaborar a minuta do contrato · Anexar a minuta no card · Subir o documento no Autentique
- `envio_assinatura`: Enviar ao cliente para assinatura · Confirmar que o cliente recebeu
- `aguardando_assinatura`: Acompanhar a assinatura no Autentique
- `assinado`: Confirmar o documento assinado · Conferir o link do documento assinado

**Validação de Documento** (`preparacao → envio_assinatura → aguardando_assinatura → assinado → aprovado_dev`)
- `preparacao`: Conferir o documento recebido da Produção · Anexar o termo · Subir no Autentique
- `envio_assinatura`: Enviar ao cliente para validação/assinatura
- `aguardando_assinatura`: Acompanhar a assinatura no Autentique
- `assinado`: Confirmar o documento assinado
- `aprovado_dev`: Liberar para Desenvolvimento

**Aditivo** (`nova_solicitacao → preparacao → aguardando_assinatura → assinado` · `recusado` terminal)
- `nova_solicitacao`: Revisar a Solicitação de Mudança (escopo + valor) · Confirmar o valor do aditivo
- `preparacao`: Elaborar o aditivo · Anexar o documento · Subir no Autentique e enviar ao cliente
- `aguardando_assinatura`: Acompanhar a assinatura no Autentique
- `assinado`: Confirmar o documento assinado
- `recusado`: Registrar o motivo da recusa

**Encerramento** (`preparacao`[Análise/Pendências] `→ envio_assinatura → aguardando_assinatura → assinado`)
- `preparacao`: Analisar pendências do cliente · Elaborar o distrato
- `envio_assinatura`: Enviar o distrato para assinatura
- `aguardando_assinatura`: Acompanhar a assinatura no Autentique
- `assinado`: Confirmar o encerramento assinado

> Nota: no backend, Encerramento usa o `STATUS_ORDER` padrão (não há `STATUS_ORDER_ENCERRAMENTO`);
> a UI mapeia a coluna "Análise/Pendências" para o status `preparacao` (`COL.analise.key`). Os
> modelos seguem os **status reais**, não os rótulos de coluna. A coluna "Distrato" do doc é
> absorvida em `preparacao`/`envio_assinatura` — sem status novo.

### 4.3 Semeadura idempotente

Serviço `seed_stage_tasks(case, stage)` (em `juridico/services.py` ou `checklists.py`): cria as
tarefas-modelo de `(case.process_type, stage)` **apenas se não existir nenhuma tarefa** para
aquele `(case, stage)`. Disparado:
- ao **criar** o caso (semeia a etapa inicial) — tanto no `perform_create` (manual) quanto no
  signal de auto-criação (`on_client_onboarding_saved`) e nos produtores de `projects/receivers.py`
  (validação/aditivo). Centralizar a chamada num único helper evita divergência.
- a cada **transição** bem-sucedida (semeia a nova etapa) — no `LegalCaseViewSet.transition`.

**Backfill (cards já em produção):** comando `manage.py seed_legal_case_tasks` semeia a etapa
**atual** de todos os casos não-terminais existentes. Idempotente (seguro reexecutar); roda 1× no
deploy. Sem data-migration que crie linhas de negócio.

### 4.4 Novo tipo de evento

Adicionar `('document', 'Documento')` a `LegalCaseEvent.EVENT_TYPE_CHOICES` (mudança aditiva de
choices, sem migração de dados) — usado por anexo de minuta e atualização de link, para render
bonito na timeline.

## 5. API + comportamentos (backend DRF)

- **`LegalCaseSerializer`**: incluir `tasks` (nested `LegalCaseTaskSerializer`, read-only no
  detalhe, igual ao `events`). O front calcula `done/total` da etapa atual a partir de `tasks`.
- **`LegalCaseTaskViewSet`** (`ModelViewSet`) em `/juridico/legal-case-tasks/`,
  `permission_classes=[HasSectorAccess('juridico')]`:
  - `GET ?case=<id>[&stage=<status>]` — lista as tarefas do caso.
  - `POST` — cria item avulso (`is_custom=True`; `stage` default = status atual do caso; `order`
    no fim).
  - `PATCH {done}|{label}` — marca feito (seta `done_at`/`done_by`) ou edita o texto.
  - `DELETE` — remove o item daquele card.
  - Escopo: só toca tarefas de casos a que o usuário tem acesso (`juridico`).
  - Tarefas **não** geram evento de timeline (rastreio fica em `done_by`/`done_at`); `log_audit`
    opcional só para criação/remoção, se desejado.
- **Ferramentas** como `@action` no `LegalCaseViewSet`:
  - `POST …/{id}/upload-attachment/` (multipart) — anexa/troca a minuta (`attachment`; validadores
    `validate_file_extension`/`validate_file_size` que já existem no campo). Grava
    `LegalCaseEvent('document')` + `log_audit`.
  - `POST …/{id}/notes/ {notes}` — atualiza `notes` (campo já é gravável; a action centraliza).
    Registra `log_audit` (sem evento de timeline, para não poluir).
  - `POST …/{id}/autentique/ {autentique_id, autentique_link}` — informa/corrige os campos do
    Autentique fora da transição (hoje só dá pra setar em Preparação→Envio). Grava
    `LegalCaseEvent('document')` + `log_audit`; mantém os campos `read_only` no serializer (só
    mudam via action/transition — STRIDE).
- **Aviso de avanço (só UX, frontend):** ao clicar Avançar, se a etapa atual tem tarefas pendentes
  (`done=False`), abre o `ConfirmDialog` ("N tarefas pendentes — avançar mesmo assim?"). O endpoint
  `transition` **não** muda: continua validando ordem por modalidade, sem checar checklist.

## 6. Frontend (`juridico/page.tsx`)

- Reescrever o modal de detalhe como **workspace** (Zona 1 etapa atual + Zona 2 contexto
  recolhível), conforme §3. Mantém `FocusTrap`, `<Sensitive>`, dark mode.
- **Checklist**: lista as `tasks` do caso filtradas por `stage === case.status`; toggle (PATCH),
  adicionar (POST), remover (DELETE) — updates otimistas com rollback + toast (padrão atual).
- **Ferramentas**: 📎 upload (multipart → action), ✎ notas (POST), 🔗 autentique (POST). Após cada
  uma, refetch/merge do caso para refletir o novo evento na timeline.
- **Card do kanban**: badge `✓ N/M` da etapa atual (derivado de `tasks`).
- **Avançar**: intercepta com `ConfirmDialog` se houver pendência; senão segue o fluxo atual
  (inclui o modal de link Autentique na transição Preparação→Envio, que permanece).

## 7. Erros, segurança e prod

- **Migrations só aditivas:** nova tabela `legal_case_tasks` + novo choice de evento. Nenhuma
  alteração em coluna existente (ERP em produção com dados reais).
- **Permissão/PII:** tudo atrás de `HasSectorAccess('juridico')`; viewer só lê. Upload valida
  extensão/tamanho. `log_audit` nas ações de documento, notas e link.
- **UI resiliente:** updates otimistas com rollback + toast; `<Sensitive>` mantido nos dados do
  cliente; isolamento de falhas (uma ação que erra não derruba a tela).
- **Escopo contido:** só o app `juridico` + a página `juridico/page.tsx`. **Não** mexe nas
  automações cross-setor nem nas flags `AUTOMATION_*` (frente separada).

## 8. Testes

- **Backend (pytest, cobertura ≥70%):**
  - `seed_stage_tasks` idempotente (na criação e na transição; reexecução não duplica).
  - `LegalCaseTaskViewSet`: CRUD + permissão (outro setor → 403; viewer → read-only).
  - `upload-attachment`: validação de extensão/tamanho + evento `document` gravado.
  - actions `notes` e `autentique`: persistência + evento + audit.
  - `LegalCaseSerializer` retorna `tasks`.
  - comando `seed_legal_case_tasks` idempotente.
- **Frontend:** `npx tsc --noEmit` limpo; o workspace renderiza tarefas/ferramentas; o aviso de
  avanço dispara com pendência; o badge de progresso aparece no card.

## 9. Arquivos afetados

**Backend:** `juridico/models.py` (LegalCaseTask + choice) · `juridico/checklists.py` (novo) ·
`juridico/services.py` (seed) · `juridico/serializers.py` (LegalCaseTaskSerializer + `tasks`) ·
`juridico/views.py` (task viewset + 3 actions + seed on transition) · `juridico/urls.py` (registrar
viewset) · `juridico/signals.py` (seed on auto-create) · `juridico/migrations/000X_*` (aditiva) ·
`juridico/management/commands/seed_legal_case_tasks.py` (novo) · `juridico/tests/` (novos testes).
**Frontend:** `frontend/app/(dashboard)/juridico/page.tsx`.

## 10. Fora de escopo (não fazer agora)

- Integração real com o Autentique (upload automático + webhook de assinatura) — frente própria.
- Ligar/ajustar as flags `AUTOMATION_*` em produção — frente própria.
- Checklists configuráveis por admin (tela de configuração) — só modelos fixos + avulsos por ora.
- Versionamento de múltiplas minutas — por ora 1 `attachment` corrente + histórico via timeline.
- "Card único circulando entre modalidades" / ação de mudar modalidade — não previsto aqui.
