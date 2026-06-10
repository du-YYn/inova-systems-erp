# Parte 8 · Arquitetura de Desenvolvimento

> Plano de implementação da arquitetura v32 no ERP em produção. Produzido em 2026-06-10 após
> reconhecimento completo do código e diagnóstico de segurança. **Nenhum código de produção
> foi escrito.** Este documento é a base de validação antes de qualquer linha de código.

## Sumário executivo

01° O ERP atual cobre ~60% do que a v32 pede: o trabalho é 40% alteração segura de código vivo e 60% construção nova (2 apps, 10 entidades, 1 motor de cálculo).
02° A implementação sai em **9 fases (F0 a F8)**, cada uma com 1 a 3 PRs pequenos, backend primeiro e tela logo depois, validada em localhost com John antes de merge.
03° **F0 é obrigatória antes de qualquer feature**: corrige 2 achados HIGH (CVE no Next.js e o endpoint reset-data vivo em produção) e adiciona backup automático pré-migration no deploy.
04° Toda migration desta entrega é **aditiva (expand)**; remoções (contract) só na F8, com data marcada e 2 ciclos de estabilidade antes.
05° O motor de cronograma nasce por **TDD estrito com golden tests extraídos do simulador v34**: as datas do Python têm que bater 100% com o HTML, senão é bug do port.
06° O gatilho atual de "entrada paga" (transição para o status legado `production`) será substituído pela automação do Financeiro com período de convivência: o código aceita os dois caminhos por uma release inteira.
07° Segurança entra por camada: threat model STRIDE por setor, RBAC por setor sobre o role atual, trilha de auditoria com imutabilidade reforçada no banco, webhooks com HMAC e replay protection, e checklist de segurança bloqueante em todo PR.
08° Pipeline: localhost → PR → CI (gates já existentes + 2 novos) → deploy com backup prévio, smoke test e rollback automático (já existentes). Staging mínimo proposto no mesmo VPS com dados anonimizados, custo ~zero.
09° Os 3 maiores riscos: divergência do motor vs simulador, automação cross-setor disparando errado em produção, e drift de enum durante deploy. Cada um tem mitigação e plano B na seção 11.
10° Há 6 decisões pendentes do John listadas na seção 12 (nenhuma bloqueia a F0).

---

## Passo 0 · Reconhecimento do terreno (resultado)

### 0.1 Estado do código (verificado em 2026-06-10)

| Item | Estado |
|---|---|
| Apps locais | accounts, sales, finance, projects, core, support, notifications. **Não existem** juridico/ nem diretoria/ |
| Migrations (última por app) | accounts 0008 · sales 0031 · finance 0013 · projects 0003 · core 0001 · support 0002 · notifications 0003 |
| Testes | ~495 funções de teste; gate de cobertura 70% no CI (não no pytest.ini) |
| Auditoria | `core.AuditLog` já existe (append-only por convenção) + `log_audit()` grava em DB e stdout |
| Roles | admin, manager, operator, viewer, **partner** (role global, sem escopo por setor) |
| Automações hoje | Única signal: finance (budget recalc). Geração de faturas/comissões dispara em `ProspectViewSet.perform_update` (won) e `ProposalViewSet.approve`, com idempotência por timestamp |
| Celery beat | 6 tasks (renewals, deadlines, invoice_overdue, recurring_invoices mensal, budgets, sla_warnings) |
| Frontend | Next 15 standalone, cookies httpOnly + CSRF double-submit, CSP nonce no middleware, subdomínios cadastro.* e parceiro.* |
| Higiene | Diretório anômalo `backend;C` na raiz do repo (artefato de comando Windows): remover na F0 |

### 0.2 Diagnóstico de segurança (achados priorizados)

| # | Sev | Achado | Onde | Tratamento |
|---|---|---|---|---|
| 1 | HIGH | `next` 15.5.15 com CVEs (DoS, middleware bypass, XSS com CSP nonce) | frontend/package.json | F0: atualizar next |
| 2 | HIGH | `/api/v1/core/reset-data/` apaga toda a base; vivo em produção com dados reais | core/views.py:52 | F0: retornar 404 em produção (gate por env) |
| 3 | MEDIUM | Deploy roda `migrate` sem backup imediato pré-migration | .github/workflows/cd.yml:118 | F0: pg_dump no cd.yml antes do migrate |
| 4 | MEDIUM | 2FA é opt-in; admins podem operar sem MFA | accounts/models.py:17 | F0: enforcement para role admin (decisão 12.5) |
| 5 | MEDIUM | Senha: só validadores default do Django (min 8, sem complexidade) | settings.py:143 | F0: validador de complexidade (min 12 + classes) |
| 6 | MEDIUM (latente) | Template nginx serve `/media/` público sem auth e geo allow-list do /admin/ em default-allow. Inativo hoje (Traefik faz o proxy), mas é uma arma engatilhada | nginx.conf.template:117 | F0: corrigir o template mesmo inativo |
| 7 | LOW | Upload valida só extensão (sem magic bytes); áudio não permitido (Suporte vai exigir) | core/validators.py:9 | F6: magic bytes + extensões de áudio |
| 8 | LOW | AuditLog imutável só por convenção (UPDATE/DELETE possíveis via ORM/SQL) | core/models.py:6 | F3: trigger Postgres bloqueando UPDATE/DELETE |
| 9 | LOW | Access token 60min (longo para ERP financeiro); health sem throttle; node:18 EOL; postgres tag major flutuante | settings.py:233 e infra | F0/F7 conforme tabela da seção 8 |

Pontos fortes confirmados: sem secrets versionados (trufflehog no CI cobre histórico), sem csrf_exempt, cookies JWT httpOnly/Secure/Strict, throttling abrangente, lockout exponencial, containers non-root, nenhuma porta publicada no compose, rollback automático no CD. O hardening S7 (auditoria de 2026-06-05) está mergeado e ativo.

### 0.3 Contradições docs vs código (não decidi sozinho; ver seção 12)

01° **Gatilho de entrada paga**: o doc 01 deprecia o status `production`, mas hoje `_mark_entry_paid` dispara exatamente na transição para `production` (sales/views.py:359). O plano substitui pelo evento do Financeiro (Invoice da entrada paga), com convivência dos dois caminhos durante a F4. Confirmação na seção 12.1.
02° **Status `lost` vs WinLossReason**: o doc 01 deprecia `lost`, mas o model `WinLossReason` (analytics de ganho/perda) usa result won/lost. Proposta: WinLossReason permanece intocado para histórico e análise; o funil novo usa disqualified/follow_up. Seção 12.2.
03° **Áudio em anexos**: doc 05 exige áudio no chamado; validators atuais não permitem. Entra na F6 (sem contradição, só gap confirmado).

---

## 1. Inventário de impacto por setor

Legenda: ALTERAR = mexe em código/dado existente (risco em produção). CONSTRUIR = código novo (risco baixo).

| Setor | ALTERAR | CONSTRUIR |
|---|---|---|
| **Comercial** (sales/) | Enum `Prospect.status` (+4 valores), data migration `meeting_done → meeting_1_done`, UI do funil (FunilTab) | Campos: `project_type`, `meeting_2_*` (3), `tech_analysis_notes`, `estimated_deadline_days` |
| **Jurídico** | Gatilho a partir de `ClientOnboarding.submitted` (já existe o model) | App `juridico/` completo: `LegalCase`, kanban 4 process_types, serializers, views, RBAC, tela |
| **Financeiro** (finance/) | Substituir `_mark_entry_paid` (production) pelo evento Invoice paga; estender `check_invoice_overdue` para régua | Service de pré-cadastro (Coleta → Invoice pendente), liberação por LegalCase assinado, evento `entrada_paga` |
| **Produção** (projects/) | Data migration `status → etapa_atual`, gate de transição em serializer/view, UI kanban | Campos: `tipo`, `etapa_atual`, `situacao`, `recorrencia_tipo`, datas do Dia 0, 14 parâmetros do Game Plan. Entidades: OnboardingMappingForm, ProjectDocument, ProjectAudit, ReUpdateCycle, WeeklyUpdate, ScheduleVersion, RecurrenceContract |
| **Suporte** (support/) | Data migrations `ticket_type` e `status` (mapeamentos da Parte 5), validators de upload (áudio + magic bytes) | Campos `conclusao` e `contexto`; entidade `PedidoUpdate`; canal público com token; task de auto-fechamento |
| **Diretoria** | Nada existente | App `diretoria/`: DirectorEscalation, DirectoryMeeting, painel agregador de KPIs |
| **Motor de Cronograma** | Nada existente | Submódulo `projects/scheduling/` (4 arquivos), endpoint simulate, endpoint persistente, golden tests, mini-tela |
| **Transversal** | cd.yml (backup pré-migrate), settings (2FA enforcement, senha), validators | Permission `HasSectorAccess`, trigger de imutabilidade do AuditLog, webhooks (F7) |

---

## 2. Ordem de implementação (fases e dependências)

```
F0 ──► F1 (motor, independente)
 └───► F2 (Comercial) ──► F3 (Jurídico) ──► F4 (Financeiro)
                                                  │
                              F1 ─────────────────┤
                                                  ▼
                                            F5 (Produção) ──► F6 (Suporte + Diretoria)
                                                  │                   │
                                                  └───────► F7 (Integrações externas)
                                                                      │
                                                            F8 (contract: remoções)
```

| Fase | Conteúdo | Depende de | Por quê |
|---|---|---|---|
| **F0** Hardening base | Itens 1 a 6 do diagnóstico + higiene do repo + staging | nada | Itens HIGH não podem conviver com novas features; backup pré-migrate é pré-requisito de TODAS as fases seguintes |
| **F1** Motor de cronograma | `scheduling/` puro + golden tests + `POST /cronograma/simular/` + mini-tela /tools/cronograma | F0 (só deploy) | Zero dependência de modelo; é a peça de maior incerteza, então entra cedo para validar com John no localhost |
| **F2** Comercial | Status novos + campos + data migration rename + funil novo na UI | F0 | É a origem dos gatilhos: `data_collection` alimenta Jurídico e Financeiro; `tech_analysis` recebe o PedidoUpdate do Suporte |
| **F3** Jurídico | App juridico/ + LegalCase + gatilho da Coleta + kanban + trigger de imutabilidade do AuditLog | F2 | O gatilho de entrada é o status `data_collection` + ClientOnboarding submitted criados na F2 |
| **F4** Financeiro | Pré-cadastro paralelo, liberação por assinatura, evento entrada paga (substitui o caminho `production`), régua | F3 | A liberação de cobrança depende de `LegalCase(contrato).assinado` existir |
| **F5** Produção | Campos + entidades novas + gate Dia 0 + persistência do Game Plan (ScheduleVersion + ProjectPhase) + data migration + kanban + tela Game Plan | F1 e F4 | O Dia 0 precisa do evento `entrada_paga` (F4) e a tela Game Plan precisa do motor (F1). 3 PRs |
| **F6** Suporte + Diretoria | Realinhamentos + conclusao/contexto + PedidoUpdate + canal público + áudio + auto-close + app diretoria/ | F2 e F5 | A conclusão da análise depende de `Project.tipo` (F5); o PedidoUpdate entra em `tech_analysis` (F2) |
| **F7** Integrações externas | Autentique (webhook HMAC), Asaas (webhook), NFS-e, fluxos n8n, MRR/conciliação, painel DirectoryMeeting | F3, F4, F5 | Integrações só fazem sentido com as entidades-alvo no ar; isoladas por risco de credencial/sandbox |
| **F8** Contract | Remoção dos campos/status deprecados (Project.status antigo, statuses legados na API) | 2 ciclos estáveis pós-F6 | Regra expand-contract: remover só com data marcada (seção 12.4) |

Trade-off da ordem: Jurídico antes do Financeiro encadeia o caminho crítico do dinheiro (coleta → contrato → cobrança → produção) o mais cedo possível, ao custo de o Suporte (que tem realinhamento de dados em produção) ficar para o fim. Aceitável porque o Suporte atual continua funcionando até lá.

---

## 3. Estratégia de branches e PRs

**Convenção de nomes**
- `feat/v32-f{N}-{slug}` (ex: `feat/v32-f2-comercial-status`)
- `chore/v32-f0-hardening` para a F0; `fix/v32-...` para correções de fase já mergeada
- Base sempre `origin/main` atualizado; nunca commit direto em main (regra já vigente)

**Escopo máximo de um PR**
- Backend: 1 preocupação por PR, máx ~600 linhas líquidas de código de produção (testes não contam), máx 2 migrations
- Frontend: 1 tela ou 1 fluxo por PR
- Migrations de dados SEMPRE em PR separado do PR de schema quando o backfill tocar mais de ~1000 linhas de dados

**Critério objetivo de "pronto para merge" (todos obrigatórios)**
01° CI verde: pytest com cobertura ≥70%, ruff, bandit, pip-audit, tsc, eslint, next build, npm audit, trufflehog
02° Migrations: só aditivas, com reverse documentado no docstring da migration
03° Checklist de segurança do PR (seção 8.7) preenchido na descrição
04° Testes novos cobrindo a regra de negócio introduzida + teste de regressão do fluxo vizinho (seção 6)
05° Quando há UI ou mudança de comportamento visível: validação manual de John em localhost registrada no PR (comentário "validado em localhost")
06° Sem TODO/FIXME sem issue vinculada; sem secret; sem print/console.log de debug

---

## 4. Estratégia de migrations para produção com dados reais

### 4.1 Regras gerais (todas as fases)

- **Expand only**: adicionar coluna (nullable ou com default), adicionar tabela, adicionar valor de choice. Proibido nesta entrega: remover/renomear coluna, alterar tipo com rewrite, remover choice
- Choices em Django não geram constraint no Postgres: adicionar valores é seguro por natureza. O risco real é o **drift durante deploy** (código velho rodando contra dado novo); tratado com convivência de uma release (seção 11.3)
- Índices novos em tabelas grandes: `AddIndexConcurrently` com `atomic = False` na migration (sem lock de escrita)
- Toda migration tem no docstring: o que faz, reverse (comando ou SQL), e se exige backfill

### 4.2 Backfill em lotes

Backfills nunca dentro da migration quando a tabela for grande; usam management command padrão:

```
python manage.py backfill_<nome> --dry-run          # relata contagens, não escreve
python manage.py backfill_<nome> --batch-size=500   # escreve em lotes com pausa
```

Esqueleto: itera por PK em lotes de 500, `update()` por lote, sleep de 100ms entre lotes, log de progresso, idempotente (where clause exclui já migrados). Dry-run obrigatório em produção antes da execução real.

### 4.3 Migração dos leads nos status legados do Comercial

| Status atual | Ação | Mecanismo |
|---|---|---|
| `meeting_done` | Renomear para `meeting_1_done` | Data migration na F2 (tabela prospects é pequena; UPDATE único dentro da migration, com reverse UPDATE invertido) |
| `not_closed`, `production`, `concluded`, `lost` | **Permanecem no banco** (decisão validada na Parte 1): somem do funil novo, registros antigos seguem até fecharem | Nenhuma migração de dados; a UI nova filtra; relatório pré-deploy com `count` por status para John saber o volume |
| `production` (especial) | Continua disparando `_mark_entry_paid` até a F4; na F4 o caminho novo assume e o velho vira no-op logado | Código tolerante aos dois caminhos por 1 release |

### 4.4 Backup e rollback por migration

- **Backup obrigatório**: a F0 adiciona ao cd.yml, antes do `migrate`, um `pg_dump -Fc` para arquivo timestampado + verificação de tamanho > 0; deploy aborta se o dump falhar. O backup diário existente (rotação 7 dias) continua
- **Rollback documentado**: cada migration declara seu reverse. Para data migrations, o reverse restaura pelo snapshot: antes de cada data migration em produção, o comando de backfill grava um CSV de (pk, valor_antigo) em /backups
- Limitação assumida: rollback de imagem (já automático no CD) não desfaz migration aplicada; como tudo é aditivo, código antigo + schema novo convivem sem quebra, que é exatamente o motivo da regra expand-only

---

## 5. Plano TDD do motor de cronograma

### 5.1 Ordem dos testes (cada item: teste primeiro, implementação depois)

01° `types.py`: validação de faixas dos parâmetros (5..400, 0..40, 20..80, 0..30, 1..60, 0..8)
02° `calendar.py`: easter() para 2024..2030 (datas conhecidas), feriados fixos + SP (9 de julho), móveis com toggles, is_business_day, add_business_days cruzando fim de semana/feriado/ano
03° `engine.distribute_days()`: distribuição normal, soma exata == prazo, piso automático, **capped** com rescale, acerto fino (sobra → hom; falta → hom/val/ent com piso 1)
04° `engine.compute_meeting_gaps()`: offsets (offV, offA, offG), gap zero para data ≤ calculada, gaps cumulativos, total_gap, delay_antes por offset
05° `engine.date_phases()`: início/fim por fase com delay, entrega e entrega_base
06° `substeps.py`: blocos por peso (último absorve resto), marcos start/end/here, recorrente nas sextas pulando feriado
07° crunch: fins de semana dentro do intervalo do re-update, cap + aviso quando pedido > disponível, só em modo uteis
08° `gerar_game_plan()`: integração completa contra os golden tests

### 5.2 Golden tests (a especificação executável)

**Extração**: rodar o simulador do `inova-cockpit-v34.html` uma única vez via Playwright com os cenários abaixo, capturar o resultado completo (dias por fase, todas as datas de fases e sub-passos, feriados, flags, entrega) e salvar como JSON em `projects/scheduling/tests/golden/*.json`. Os JSONs entram no repo e nunca são editados à mão.

**Cenários (mínimo 14)**
01° Default: 45 dias úteis, onboarding 2026-06-10, 15/50/8, pesos 5/17/5
02° Mesmo cenário em dias corridos
03° Prazo mínimo (5) e 04° prazo longo (180, cruzando dez/jan: Natal, Confraternização)
05° Capped: 30+70+25 (soma 125%)
06° reupd_fds=2 cabendo e 07° reupd_fds=8 não cabendo (aviso)
08° Remarcação só da validação · 09° só da apresentação · 10° só da graduação · 11° as três juntas
12° Remarcação com data anterior à calculada (deve ser ignorada, gap 0)
13° Carnaval e Corpus desligados, com onboarding em janeiro (Carnaval no caminho)
14° Onboarding em véspera de 9 de julho (feriado SP no meio da Documentação)

**Critério de fidelidade**: igualdade exata (data a data, dia a dia, flag a flag) entre a saída do Python e o JSON golden. Divergência reprova o teste; a correção é sempre no port, nunca no fixture. Re-extração do golden só se o próprio simulador HTML mudar, com registro no PR do motivo.

---

## 6. Estratégia de testes geral

**Mínimo de todo PR**
- Teste unitário de cada regra de negócio nova (transição, gate, automação)
- Teste do caminho de erro (transição inválida retorna 400 e não muda estado)
- Teste de permissão: papel sem acesso recebe 403 (anti-IDOR: usuário de outro setor não lê nem escreve)
- Quando cria automação: teste de idempotência (disparar 2x não duplica efeito), seguindo o padrão já existente (`receivables_generated_at`)

**Suíte de regressão dos fluxos vivos em produção** (marcador `@pytest.mark.regression`, criada na F0/F2 e rodada em todo PR)
01° Login + 2FA + refresh + logout
02° Funil atual: transições existentes do Prospect, won → `_generate_receivables` idempotente
03° Proposal approve → `_generate_commissions` idempotente
04° Contrato + invoice recorrente mensal (task generate_recurring_invoices)
05° Ticket com SLA: criação, assign, resolve, close
06° Onboarding público por token (fluxo LGPD de repopulação)

**Pós-deploy**: smoke test do cd.yml (já existe, 24×5s no health + rollback automático) permanece como está.

---

## 7. Auditoria e governança

### 7.1 Trilha de auditoria (quem fez o quê, quando, valor anterior e novo)

Infra já existe (`core.AuditLog` + `log_audit()` com old_value/new_value/IP/user-agent). O plano padroniza o uso:

| Entidade/evento | Fase | O que registra |
|---|---|---|
| `Prospect.status` (toda transição) | F2 | old/new status, quem, origem (UI/n8n) |
| `LegalCase` (criação e toda transição, especialmente `assinado`) | F3 | old/new status, process_type, autentique_id |
| Liberação de cobrança e `entrada_paga` | F4 | invoice, valores, gatilho de origem |
| `Project.etapa_atual` e `situacao` (toda transição) + gate Dia 0 | F5 | old/new etapa, os 3 critérios no momento do gate |
| `ScheduleVersion` (cada Game Plan gerado/regerado) | F5 | parâmetros completos + entrega calculada (a entidade já é o snapshot) |
| `SupportTicket.status/conclusao`, promoção de `PedidoUpdate` | F6 | old/new, conclusão, prospect criado |
| `DirectorEscalation.decision` | F6 | decisão, notas, decided_by |

**Imutabilidade reforçada (F3)**: migration aditiva cria trigger Postgres em `core_auditlog` que bloqueia UPDATE e DELETE (raise exception). Trade-off: testes que tentarem limpar audit quebram (não devem) e a tabela só cresce; mitigado com particionamento ou arquivamento por ano na F8, se o volume justificar.

### 7.2 RBAC por setor

Proposta: manter o `role` global (admin/manager/operator/viewer/partner) e adicionar `User.sectors` (lista: comercial, juridico, financeiro, producao, suporte, diretoria) + permission class `HasSectorAccess(sector)` aplicada por ViewSet. Trade-off vs Django Groups: menos flexível que groups/permissions nativos, porém auditável num único campo, simples de exibir na UI de usuários e suficiente para 6 setores; se o RBAC crescer (permissões por ação), migra-se para groups depois sem quebrar.

Matriz (linhas = setor do recurso; admin ignora a matriz; viewer é leitura global):

| Recurso | comercial | juridico | financeiro | producao | suporte | diretoria |
|---|---|---|---|---|---|---|
| Prospect/Proposal | RW | R | R | R | R | R |
| LegalCase | R | RW | R | R | n/a | R |
| Invoice/cobrança | R | R | RW | R | n/a | R |
| Project/etapas/GamePlan | R | R | R | RW | R | R |
| SupportTicket/PedidoUpdate | R | n/a | R | R | RW | R |
| DirectorEscalation/Meeting | n/a | n/a | n/a | n/a | R (criar via escalação) | RW |

Cada PR de fase inclui os testes 403 da sua linha na matriz.

---

## 8. Plano de segurança e cibersegurança

### 8.1 Threat model (STRIDE) da arquitetura nova

| Ameaça | Cenário concreto | Neutralização no design |
|---|---|---|
| **S**poofing | Webhook falso "Autentique: assinado" libera desenvolvimento/cobrança | F7: HMAC por segredo de webhook + tolerância de timestamp (replay) + allowlist de eventos; até a F7, assinatura é marcada manualmente por usuário do setor jurídico com auditoria |
| **T**ampering | Usuário marca `LegalCase.assinado` ou edita `signed_at` sem ter havido assinatura | Transições só por endpoint de ação (não PATCH de campo), permission por setor, AuditLog com old/new; campos de webhook read-only no serializer |
| **R**epudiation | "Eu não liberei essa cobrança" | Trilha 7.1 com user+IP+timestamp imutáveis (trigger F3) |
| **I**nfo disclosure | Enumeração dos links públicos (onboarding, proposta, chamado público F6) | Tokens UUID4, throttle por IP e por token (padrão já existente em views_public), expiração, respostas sem dados sensíveis antes de validar token |
| **D**oS | Flood no canal público de chamados ou no endpoint de simulação | Throttle dedicado por escopo (novo rate p/ public tickets, ex 5/h por token), simulate autenticado com rate por usuário, body size limit |
| **E**levation | Operador do Suporte alterando Invoice; IDOR cross-setor | Matriz 7.2 + testes 403 obrigatórios por PR + object-level check em todo detail endpoint |

### 8.2 Correções do diagnóstico, priorizadas

**Urgente (F0, antes de qualquer feature)**: atualizar next (HIGH), gate de produção no reset-data (HIGH), pg_dump pré-migrate no cd.yml, validador de complexidade de senha (min 12 + maiúscula/dígito/símbolo), 2FA obrigatório para role admin (decisão 12.5), correção do template nginx (media atrás de auth, geo default deny), remoção do diretório `backend;C`, throttle no health.
**Nas fases**: áudio + magic bytes nos uploads (F6), media privada servida por endpoint autenticado com streaming (F6), webhooks HMAC (F7), access token 60→30min (F0, baixo custo), node:18→20/22 nos Dockerfiles (F0).

### 8.3 Aplicação

- **Autenticação**: política de senha (acima); lockout exponencial e throttles já existentes permanecem; expiração de sessão: access 30min + refresh 7d rotacionado com blacklist (já há rotação); MFA TOTP já implementado, enforcement por papel na F0
- **Autorização**: HasSectorAccess + object-level permission em todo detail; teste IDOR por PR (seção 6)
- **Validação de input**: serializers DRF como única porta de entrada (nenhum `request.data` cru em lógica); campos de sistema read-only
- **Uploads**: tipo por extensão + magic bytes (python-magic), tamanho (5/10MB, áudio 10MB), armazenamento em volume fora do webroot (já é o caso: media não tem rota pública hoje), download via endpoint autenticado
- **Headers**: CSP nonce, HSTS, XFO etc. já ativos via middleware Next + SecurityHeadersMiddleware; manter e cobrir com teste de header na suíte de regressão
- **Rate limiting**: novos escopos para canal público de chamados, simulate do cronograma e webhooks

### 8.4 Infraestrutura (checklist para John executar no VPS, F0/F7)

01° SSH só por chave + `PasswordAuthentication no` + porta padrão com fail2ban (jail sshd)
02° Firewall (ufw/painel): apenas 80/443 e SSH; nada de 5432/6379 expostos (compose já não publica portas: confirmar no host)
03° Containers: non-root (já ok), `node:18-alpine → node:20-alpine`, pin de digest nas imagens base na F7
04° TLS: emissão e renovação no Traefik/EasyPanel (já ativo); testar com ssllabs após F0
05° Atualizações do SO: unattended-upgrades para patches de segurança

### 8.5 Dados, backups e LGPD

- **Trânsito**: TLS em tudo (já ativo). **Repouso**: volume do Postgres no VPS; criptografia de disco é do provedor; o controle compensatório é backup cifrado fora do servidor
- **Backups off-site (F0)**: além do dump diário local, enviar dump cifrado (age ou gpg, chave fora do servidor) para storage externo (Backblaze B2 ou S3; custo estimado: < US$ 1/mês para o volume atual). Teste de restauração trimestral documentado
- **Inventário LGPD** (dados pessoais e quem acessa):

| Categoria | Onde | Acesso |
|---|---|---|
| Dados cadastrais de cliente PJ/PF (CNPJ/CPF, endereço) | Customer, ClientOnboarding | comercial, juridico, financeiro, admin |
| Dados do representante legal (CPF, estado civil, profissão, endereço) | ClientOnboarding | juridico, admin |
| Conversas WhatsApp de leads | ProspectMessage | comercial, admin |
| Dados financeiros do cliente (faturas, valores) | Invoice/Transaction | financeiro, diretoria, admin |
| Dados de colaborador (salário, custo/hora) | EmployeeProfile | admin |
| Anexos de chamados (podem conter dados pessoais) | TicketAttachment | suporte, admin |

  Já existem `data-export` e `anonymize` no sales (base para direitos do titular); F6 estende anonymize para tickets. Retenção: proposta de política (leads perdidos > 24 meses anonimizados) na seção 12.6

### 8.6 Cadeia de dependências e detecção/resposta

- **Dependências**: CI já roda pip-audit, bandit, npm audit (critical) e trufflehog. Adições na F0: subir npm audit para `--audit-level=high` e ativar Dependabot semanal (security updates auto-PR). Política: CRITICAL/HIGH bloqueiam merge; atualização de framework (Django/Next) em PR dedicado com regressão completa
- **Logs de segurança**: AuditLog (DB) + logger audit (stdout → logs do EasyPanel). F7: rotear eventos de segurança (login falho, lockout, ações admin, alteração em Invoice/LegalCase) para um canal de alerta via n8n (Telegram/WhatsApp do John) com agregação simples (ex: >10 logins falhos em 5min dispara alerta). Sentry já suportado por env: ativar DSN em produção na F0
- **Plano de resposta a incidentes (runbook, primeiros passos)**:
01° Isolar: derrubar o serviço afetado no EasyPanel (ou bloquear no Traefik); não destruir o container (evidência)
02° Rotacionar TODOS os secrets (DJANGO_SECRET_KEY, DB, JWT implícito via SECRET, API keys n8n/website, TOTP key se exposta) e invalidar sessões (flush do token_blacklist + forçar relogin)
03° Preservar evidência: dump dos logs do período + snapshot do banco antes de qualquer correção
04° Avaliar escopo: AuditLog + logs de acesso; identificar dados pessoais afetados (inventário 8.5)
05° Restaurar de backup limpo se houve alteração de dados; aplicar patch da causa raiz antes de religar
06° Comunicação: se dados pessoais vazaram, registrar e avaliar comunicação à ANPD e titulares (LGPD art. 48; prazo razoável, recomendação de 2 dias úteis para juízo de risco); post-mortem escrito no repo

### 8.7 Checklist de segurança por PR (bloqueante, vai no template de PR)

```
[ ] Nenhum secret/credencial em código, teste ou fixture
[ ] Todo endpoint novo tem permission class explícita (nada herdando default por omissão)
[ ] Detail endpoints têm object-level check (testado: 403 cross-setor)
[ ] Input só via serializer; campos de sistema read-only
[ ] Endpoint público novo: token + throttle dedicado + sem dados sensíveis pré-validação
[ ] Migration: aditiva, reverse documentado, sem default com lock em tabela grande
[ ] Ação sensível registra log_audit com old/new
[ ] Upload novo: extensão + magic bytes + tamanho + fora do webroot
[ ] pip-audit/npm audit sem novos HIGH/CRITICAL introduzidos
[ ] Logs não contêm dados pessoais nem secrets
```

---

## 9. Front-end: ordem e validação

Regra: o backend da fase entra primeiro (PR próprio); a tela vem no PR seguinte da mesma fase e só é mergeada após John validar em localhost (`docker compose up` + checklist visual do PR). Design system atual reaproveitado (Tailwind, dark mode, `<Sensitive>`, @dnd-kit).

| Fase | Telas |
|---|---|
| F1 | `/tools/cronograma`: mini-simulador (parâmetros + resultado), comparável lado a lado com o HTML v34 |
| F2 | Funil do CRM atualizado: colunas novas, badges de legado, campos da Reunião 2 e da análise técnica no drawer do lead |
| F3 | Kanban do Jurídico: 4 trilhas (contrato, validação, aditivo, encerramento) × 4 macro-etapas, card com link Autentique |
| F4 | Financeiro: faixa de status do ciclo (pré-cadastro → aguardando assinatura → ativa → paga) na tela de faturas + indicador de régua |
| F5 | Kanban de Produção por `etapa_atual` + tela Game Plan do projeto (parâmetros, fases datadas, sub-passos, histórico de versões) + formulário do roteiro de onboarding |
| F6 | Board de Suporte (status novos + conclusão + contexto), tela pública de abertura de chamado, fila da Diretoria (escalações + reunião semanal) |
| F7 | Indicadores (MRR/churn), painel agregado da DirectoryMeeting, status de integrações |

Validação de cada tela: roteiro curto no PR (5 a 10 passos clicáveis), John executa em localhost e comenta "validado"; sem isso o PR não entra.

---

## 10. Pipeline de entrega

**Fluxo**: localhost (docker compose, dados de dev) → branch → PR → CI → review + validação John → merge → CD para produção.

**Gates de CI já existentes (mantidos)**: pytest cov ≥70, ruff, bandit, pip-audit, npm audit, tsc, eslint, next build, trufflehog (histórico completo).
**Gates novos (F0)**: npm audit em `--audit-level=high`; job que falha se a migration não for aditiva (heurística: grep por RemoveField/DeleteModel/AlterField destrutivo nas migrations do PR).

**CD (cd.yml) com adições da F0**: pg_dump -Fc verificado ANTES do migrate (aborta se falhar) → migrate → restart → smoke test 24×5s → rollback automático por tag anterior (já existe). Pós-deploy de fase com data migration: executar o relatório de contagem e conferir com o esperado.

**Homologação (staging) mínima viável**: segundo projeto no mesmo VPS via EasyPanel (`staging.erp...`), compose reduzido (1 worker, sem beat de e-mail), Postgres próprio, dados de produção **anonimizados** por script (reusa a lógica do anonymize + faker para nomes/documentos). Custo: ~zero (mesmo VPS; risco: disputa de recursos, mitigado limitando memória dos containers de staging). Alternativa: VPS dedicado pequeno (US$ 5 a 9/mês). Recomendação: mesmo VPS agora; migrar staging para VPS próprio quando a F7 (webhooks externos) entrar, porque webhooks de sandbox ficam mais limpos isolados. Decisão 12.3.

---

## 11. Mapa de riscos (top 3)

**R1 · Motor de cronograma divergente do simulador** (datas erradas viram compromisso com cliente)
- Mitigação: golden tests de fidelidade exata (seção 5.2) + mini-tela F1 para John comparar lado a lado com o HTML antes de qualquer persistência
- Plano B: o Game Plan persistido guarda os parâmetros (ScheduleVersion); se uma divergência passar, regenerar todos os cronogramas afetados é um comando (recalcular a partir dos parâmetros) + o simulador HTML permanece como referência operacional até a F5 estabilizar

**R2 · Automação cross-setor disparando errado em produção** (ex: cobrança liberada sem assinatura, fatura duplicada, mensagens em massa)
- Mitigação: toda automação nova nasce atrás de feature flag por env (`AUTOMATION_<NOME>=off|dry_run|on`); entra em produção em `dry_run` (loga o que faria, não executa) por no mínimo 1 semana de operação real antes de ligar; idempotência por timestamp em todas (padrão já provado no código)
- Plano B: kill-switch imediato (flag off sem deploy, só env + restart) + AuditLog permite identificar e reverter efeitos manualmente (faturas canceláveis, status restauráveis)

**R3 · Drift de enum durante deploy** (código velho rodando contra status novos, ou worker Celery antigo processando dado novo)
- Mitigação: regra de convivência de 1 release (código N aceita os valores de N-1 e N+1; validação de choices feita no serializer, não no banco); deploy reinicia backend e workers juntos (compose já faz); data migrations só rodam quando o código que entende o valor novo já está no ar (PR de schema primeiro, PR de dados depois)
- Plano B: como nada é destrutivo, rollback de imagem (automático) volta o código velho que continua funcionando com o schema expandido; a data migration tem reverse + snapshot CSV (seção 4.4)

---

## 12. Decisões pendentes para John (nenhuma bloqueia a F0)

| # | Decisão | Recomendação |
|---|---|---|
| 12.1 | Substituição do gatilho `production` → evento Invoice paga (F4): confirma a convivência de 1 release e desativação do caminho velho na F5? | Sim, com log de ambos os caminhos durante a convivência |
| 12.2 | `WinLossReason` (usa `lost`): manter intocado para histórico/analytics? | Manter; funil novo usa disqualified/follow_up |
| 12.3 | Staging: mesmo VPS (custo zero) ou VPS dedicado (US$ 5 a 9/mês)? | Mesmo VPS agora; dedicado a partir da F7 |
| 12.4 | Data da fase contract (F8, remoções): propor 90 dias após a F6 estável em produção | Marcar ao fim da F6 |
| 12.5 | 2FA obrigatório para role admin já na F0? | Sim (TOTP já existe; é configuração + UX de aviso) |
| 12.6 | Política de retenção LGPD (ex: leads perdidos > 24 meses anonimizados automaticamente) | Aprovar texto na F6, junto do anonymize de tickets |

---

## Apêndice A · Resumo de PRs por fase (estimativa)

| Fase | PRs | Conteúdo resumido |
|---|---|---|
| F0 | 2 | (1) hardening backend/CI/CD + (2) bump next/node + correções frontend |
| F1 | 2 | (1) scheduling/ + golden tests + endpoint simulate · (2) mini-tela |
| F2 | 2 | (1) schema+data migration+API · (2) funil UI |
| F3 | 2 | (1) app juridico + gatilho + trigger auditoria · (2) kanban UI |
| F4 | 2 | (1) automações financeiro + flags · (2) UI status de cobrança |
| F5 | 3 | (1) schema Project + entidades · (2) gates + integração motor + data migration · (3) kanban + Game Plan UI |
| F6 | 3 | (1) realinhamento suporte + PedidoUpdate + uploads · (2) app diretoria · (3) UIs |
| F7 | 3+ | por integração (Autentique, Asaas, alertas/n8n), cada uma atrás de flag |
| F8 | 1 | remoções com data marcada |

Total estimado: ~20 PRs. Cada PR segue a seção 3; cada fase fecha com John validando em localhost antes do deploy da fase seguinte.
