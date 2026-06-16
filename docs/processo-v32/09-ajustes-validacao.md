# Parte 9 · Ajustes da validação manual (John)

> Lista de ajustes apontados por John testando a v32 em localhost. **Registro apenas** —
> as correções entram numa fase de reconciliação depois que a lista fechar. Não mexer no
> código até John liberar. Cada item: tela/rota, o que foi apontado, setor/fase, causa
> provável (cruzando com o teste E2E quando aplicável), e proposta de correção.

Status: 🟡 aberto (coletando) · ⚙️ a corrigir · ✅ corrigido

---

## 01 · CRM Comercial não pode ter "Contratos" (mistura de setores)
- **Status:** 🟡 aberto
- **Tela/rota:** `/crm` → aba **Contratos** (e revisar **Histórico**)
- **O que foi apontado:** o CRM Comercial ainda exibe a aba **Contratos**. Contrato agora é
  responsabilidade do **CRM Jurídico** (LegalCase). Não podemos misturar os processos/setores.
- **Setor/fase:** Comercial (F2) + Jurídico (F3)
- **Onde no código:**
  - `frontend/app/(dashboard)/crm/page.tsx` (linhas ~7, 11, 16, 18, 60): a tab `contratos`
    no array `tabs` + import e render de `ContratosTab`.
  - `frontend/app/(dashboard)/crm/ContratosTab.tsx` (componente da aba).
- **Causa:** o CRM Comercial é pré-v32 e nunca foi "limpo" depois que o Jurídico assumiu os
  contratos na F3. Sobrou a aba antiga.
- **Proposta de correção (a validar):**
  - Remover a aba **Contratos** do CRM Comercial (o fluxo de contrato vive em `/juridico`).
  - **Decidir com John:** a aba **Histórico** (atividades do lead) — manter no Comercial
    (faz sentido: timeline do prospect) ou também sai? (Ela não é "contrato", é atividade
    comercial; minha recomendação é MANTER, mas John destacou em vermelho, então confirmar.)
  - `ContratosTab.tsx` não se apaga nesta fase (regra expand/contract): fica órfão até a fase
    de limpeza, ou movemos seu conteúdo útil pro Jurídico se houver algo que lá ainda não tem.
- **Pergunta pendente p/ John:** "Histórico" sai junto ou fica?

---

## 02 · Renomear "Não Compareceu" → "No-Show"
- **Status:** 🟡 aberto
- **Tela/rota:** `/crm` → Funil (coluna/etapa) e onde mais aparecer
- **O que foi apontado:** o rótulo da etapa **Não Compareceu** deve virar **No-Show**.
- **Setor/fase:** Comercial (F2) — só label de UI (o status interno `no_show` não muda).
- **Onde no código (frontend):**
  - `frontend/app/(dashboard)/crm/FunilTab.tsx`:
    - linha ~156: `no_show: 'Não Compareceu'` (mapa de labels do status) → 'No-Show'
    - linha ~2313: texto "Não Compareceu" (header/badge da coluna) → "No-Show"
  - Conferir também o motivo de follow-up na linha ~219 (`nao_compareceu` label "Não
    Compareceu") — é o *motivo* do follow-up, não a etapa. **Decidir:** alinhar pra "No-Show"
    também ou manter (é outro contexto). Recomendo alinhar para consistência.
  - `frontend/app/(dashboard)/crm/AtividadesTab.tsx`: também tem o termo — alinhar.
- **Causa:** rótulo pt-BR antigo; John prefere o termo de mercado "No-Show".
- **Proposta de correção:** trocar apenas o **label exibido** para "No-Show" (mantém o valor
  `no_show` no backend e nas APIs — zero migration). Aplicar em todos os pontos de UI acima.
- **Escopo:** cosmético, baixo risco.

---

## 03 · Fronteira SDR de IA × Closer no funil comercial (CONTEXTO, define automação)
- **Status:** 🟡 registrado (não é bug; é regra de propriedade que orienta o que automatizar)
- **Setor/fase:** Comercial (F2) + integração n8n
- **Regra confirmada por John:**
  - **SDR de IA (n8n + WhatsApp) faz a PRÉ-VENDA** e MOVE estas etapas:
    `new (Lead recebido) → qualifying → qualified → meeting_invite → scheduled`,
    mais os ramos `pre_meeting`, `no_show` e `follow_up`.
    Responsabilidades: qualificar (preencher os 4 critérios + qualification_score),
    agendar a reunião, e fazer o follow-up/reativação.
  - **Closer (humano) MOVE da Reunião 1 em diante:**
    `meeting_1_done → tech_analysis → meeting_2_done → proposal → won`.
    Responsabilidades: conduzir a reunião, a análise técnica (com o Dev), a proposta e o
    fechamento.
  - **Handoff:** acontece em `meeting_1_done` (quando a reunião realmente acontece). O SDR-IA
    entrega o lead agendado; o closer assume a condução.
- **Como está hoje no código:**
  - O ERP é o sistema de verdade; a "inteligência" da conversa do SDR vive no **n8n** (fora do
    repo), que lê/escreve via os endpoints `backend/sales/n8n_urls.py`
    (new-leads, messages, leads/<id>/update, follow-up, proposals/create, send-email).
  - As transições novas da v32 (`meeting_invite`, `tech_analysis`, `meeting_2_done`) hoje são
    **manuais** (kanban/PATCH) — não há automação puxando.
- **Decisão futura (não agora):** o que continua no n8n vs o que vira automação/UI dentro do
  ERP (ex: tela do closer pra mover reunião→proposta; o n8n só cuidando da parte do SDR-IA).
  Implica em quais campos/ações o ERP precisa expor pro n8n no escopo do SDR.
- **Sem ação de código nesta fase** — serve de baliza pros próximos itens e pra fase de
  reconciliação.

---

## 04 · AUDITORIA do fluxo de proposta (entender ponta a ponta)
- **Status:** 🟡 auditado (precisa de decisão de John pra virar correção)
- **Telas:** drawer do lead (botão "Proposta") · popup "Nova Proposta" (ProposalFormModal) ·
  aba "Propostas" (PropostasTab) · link público `/p/<token>`
- **Setor/fase:** Comercial (F2) + Financeiro (F4) + Jurídico (F3)

### Fluxo real (rastreado no código)
| Passo | Onde | O que faz |
|---|---|---|
| Criar | drawer/aba → `ProposalFormModal` → `POST /sales/proposals/` | Cria `Proposal` status=`draft` vinculada ao prospect; cria `ProposalService` (catálogo) + `ProposalPaymentPlan` (forma de pagamento: Único / Setup+Mensal / Só Mensal); valor derivado do plano; loga `proposal_created`. **NÃO move o card.** (`backend/sales/views.py` ProposalViewSet.perform_create ~l.910) |
| Anexar | `upload-pdf` action | Sobe HTML/PDF, sanitiza com bleach, gera `public_token` (uuid) → link público. (~l.1313) |
| Enviar | `send` action | `draft→sent`; **move o lead pra status `proposal`** (exceto se won/data_collection/lost/not_closed); loga `proposal_sent`. (~l.934) |
| Cliente vê | `/p/<token>` (iframe sandbox) | Registra view, `sent→viewed`. O HTML traz o botão "Aceito proposta" que **só redireciona pro onboarding** (não aprova). |
| Aprovar | `approve` action | `sent/viewed→approved` + `_generate_commissions` (ClientCost, idempotente). **NÃO move o lead pra `won`.** (~l.956) |
| Converter | `convert_to_contract` action | Cria `Contract` **legado** + copia payment plan + `proposal.status='converted'`. (~l.1140) |
| Outros | reject, regenerate-token, views-history, download-pdf | — |

### Descasamentos encontrados (a decidir)
- **A · Coluna ↔ documento desamarrados:** criar a proposta não move o card; só "Enviar" move. E
  dá pra arrastar o card pra "Proposta" sem existir proposta. → leads e documentos divergem.
- **B · Forma de pagamento ↔ project_type duplicados:** o modal define Único/Mensal (que define
  se é fechado/recorrente), mas `project_type` (campo v32) é preenchido separado na análise
  técnica. Mesma verdade em 2 lugares.
- **C · Ciclo de fechamento não automatiza:** "Aprovar" é manual e não move pra `won`; o aceite
  do cliente no link não chama `approve`. Nenhum ponto fecha o lead sozinho.
- **D · "Converter em Contrato" cria Contract legado:** conflita com o Jurídico v32 (contrato
  nasce da Coleta → LegalCase). Botão precisa sair/mudar. Liga ao item 01.
- **E · ProposalPaymentPlan não é consumido:** é a fonte que o pré-cadastro do Financeiro (F4)
  deveria usar; como o fluxo cai no manual/legado, não é usado → **raiz da cobrança em dobro**
  achada no teste E2E.

### Proposta de redesenho (a validar com John, NÃO implementar ainda)
01° **Aceite do cliente fecha o ciclo:** o botão "Aceito proposta" no link chama um endpoint
    que: aprova a proposta → (decisão de John: move o lead pra `won` direto OU notifica o closer
    pra confirmar) → libera/abre a Coleta de dados. Hoje só redireciona.
02° **Forma de pagamento define o tipo:** o `project_type` passa a ser derivado do plano de
    pagamento da proposta (Único=fechado / Mensal=recorrente), eliminando a duplicidade B.
03° **Sincronizar coluna↔proposta:** enviar a proposta move o card (já faz); criar deveria
    deixar claro o estado; impedir card em "Proposta" sem proposta (ou avisar).
04° **Remover "Converter em Contrato"** do Comercial (vai pro Jurídico — item 01).
05° **Ligar o ProposalPaymentPlan ao pré-cadastro F4** e dedupe vs caminho legado (resolve o
    item E + a cobrança em dobro do E2E).
### Decisões de John (2026-06-11) — fluxo otimizado cravado
> Ver fluxograma `docs/processo-v32/fluxo-proposta-atual.html` (bloco "Como fica · otimizado").
01° **Fechamento (won) NÃO é automático.** O lead só vira `won` quando o cliente **assina o
    contrato E paga a entrada** — antes disso não há 100% de certeza. O `won` continua sendo o
    fechamento que já existe; muda só que ele passa a ficar amarrado ao fim do fluxo (após
    assinatura + pagamento), não a um clique.
02° **O botão "Aceito proposta" NÃO dispara processo.** Um clique pode ser só curiosidade. O
    botão apenas **abre o formulário** de cadastro. O **gatilho real é o ENVIO do formulário**
    (cliente preenche os dados e submete) — só aí o lead se movimenta. Resolve C sem falso
    positivo.
03° **Nova coluna "Em Produção" no funil do Comercial.** Só de leitura/visibilidade: o
    Comercial enxerga quantos clientes estão em produção. Reflete os projetos que a Produção já
    iniciou (Dia 0). Não é etapa de venda — é indicador. Implementação: derivar do estado dos
    projetos vinculados (sem novo status de venda no Prospect; provável agregação/coluna de
    leitura no FunilTab).
04° **Mantidas:** A (sincronizar card↔proposta), B (project_type derivado da forma de
    pagamento), D (remover "Converter em Contrato" do Comercial → contrato só pelo Jurídico),
    E (ProposalPaymentPlan alimenta o Financeiro + dedupe do legado).

- **Cadeia final otimizada:** Reunião 2 → Criar+Enviar proposta (1 passo, move o card) →
  Cliente vê o link → clica "Aceito" (só abre o form) → **preenche e ENVIA o form (gatilho)** →
  Jurídico gera contrato (LegalCase) + lead avança p/ "Coleta recebida" → cliente **assina +
  paga** → Financeiro cobra pelo plano → **Fechado (won)** → **Em Produção** (visível Comercial).
- **Ainda em aberto (não bloqueia):** definir o nome/posição exata da etapa intermediária
  "Coleta recebida" no funil (entre Proposta e Fechado) e se ela é status novo ou derivada.

### Fluxo da proposta — ESPECIFICAÇÃO FINAL ditada por John (2026-06-12)
> Fluxograma: `docs/processo-v32/fluxo-proposta-atual.html`. Aguardando validação visual de John.
> Substitui os esboços anteriores. As 4 colunas do funil e seus gatilhos são a fonte da verdade.

**Colunas do funil (Comercial) e o que move o card:**
1. **Proposta** → (closer aprova a proposta) → 2
2. **Coleta de Dados** (NOVA, entre Proposta e Projeto Fechado) → (cliente envia o forms) → 3
3. **Projeto Fechado** → (Jurídico assinado + Financeiro pago) → 4
4. **Em Produção** (NOVA, última coluna)

**Passo a passo (15 passos):**
01° Closer coloca o lead na coluna **Proposta**.
02° Clica no card do lead → popup → "Nova Proposta".
03° Preenche a proposta (serviços + forma de pagamento → define valor e tipo) e salva.
04° Vai na aba **Propostas** → clica no card do cliente.
05° Sobe o arquivo → o link público é gerado.
06° Envia o link pro cliente.
07° Cliente acessa e lê a proposta (rastreio de aberturas).
08° Cliente retorna → o closer vai no card e **aprova** a proposta (manual).
09° Proposta aprovada → o card move pra **Coleta de Dados**. No card há DOIS links: o da
    proposta (com o botão "Aceito Investimento") E o link do **FORMS** de coleta.
10° Cliente abre o forms. No card (sem ir pra tela de cadastro) o closer vê: se foi aberto,
    quantas vezes, em qual dispositivo (mobile/desktop) e a data de cada abertura.
11° Cliente **preenche e envia** o forms → gatilho: dados vão pro Jurídico e Financeiro.
12° Jurídico: gera o contrato (LegalCase) e conduz a assinatura.
13° Envio do forms também move o card pra **Projeto Fechado**.
14° Financeiro: cobra pela forma de pagamento da proposta e confirma o pagamento.
15° Jurídico (assinado) + Financeiro (pago) → o card move pra **Em Produção**.

**Implicações de implementação (a detalhar na fase de correção):**
- Novos valores de coluna no funil: `coleta_de_dados`, `projeto_fechado`(=won?), `em_producao`
  (decidir reaproveitar `won`/`production` legados vs novos — migração aditiva).
- **Aprovar proposta** passa a mover o card (status do prospect) automaticamente.
- **Coleta de Dados**: expor no card o link do forms de onboarding + tracking de aberturas
  (device, contagem, timestamps) — provável extensão do tracking que já existe pra proposta.
- Gatilho do **envio do forms**: mover card pra Projeto Fechado + disparar Jurídico/Financeiro.
- **Em Produção**: derivado de Jurídico assinado + Financeiro pago.
- **Pendência de nomenclatura:** "Projeto Fechado" (form enviado) vs decisão anterior de "won só
  com assinatura+pagamento" — aqui John separou: form enviado = Projeto Fechado; assinado+pago =
  Em Produção. Confirmar que `won` legado mapeia pra "Projeto Fechado".

### Decisão (2026-06-12) — superfície de operação da proposta
- **Manter a tela de Propostas** (aba dedicada) como o lugar onde se sobe o arquivo, gera o link
  e envia. John avaliou as 3 opções (painel único no card / vários popups no card / manter a
  tela) e escolheu **manter a tela**. Motivo: é o que já funciona e concentra o trabalho pesado
  num lugar só, sem multiplicar popups.
- **Consequência:** o fluxo mantém o passo de ir na aba Propostas (passos 4-6 do fluxograma).
  O "Nova Proposta" continua abrindo via popup no card do lead (passo 2-3). A aprovação volta a
  ser no card do funil (passo 8). Ou seja: criar e aprovar pelo card; subir/link/enviar pela aba.
- **NÃO construir** o drawer unificado nem mover upload/link/envio pro card nesta rodada.

### Decisão (2026-06-12) — remover aba "Cadastros" + alerta de 3 dias na Coleta de Dados
> Adicionado ao fluxograma (`fluxo-proposta-atual.html`): nó de alerta na coluna Coleta de Dados.
- **Remover a aba "Cadastros"** (OnboardingTab) do CRM Comercial. Hoje ela é só uma LISTA de
  onboardings (pending/Preenchido) com copiar-link, marcar-revisado e `submitted_at`. Tudo isso
  passa pro **popup do card** na coluna Coleta de Dados. Componente fica órfão (regra
  expand/contract) até a fase de limpeza. Junta-se ao item 01 (Contratos também sai).
  - Consideração registrada: perde-se a visão agregada (lista de todos). Os cards vermelhos no
    funil cobrem a sinalização de atraso; se faltar visão agregada, reavaliar depois.
- **Tracking de abertura do FORMS é CÓDIGO NOVO.** O onboarding hoje só grava `ip_address` +
  `user_agent` no SUBMIT (`ClientOnboarding`, backend/sales/models.py ~l.597-665). NÃO há
  registro por abertura. Precisa espelhar o que a **proposta** já tem (`Proposal.view_count` +
  tabela de views com ip/user_agent ~l.371,403-404): criar um registro por abertura do link do
  forms, com timestamp + dispositivo (derivado do user_agent) — pra exibir no card "aberto?
  quantas vezes? mobile/desktop? data de cada vez".
- **Alerta de 3 dias + card vermelho.** Coleta sem preenchimento em até 3 dias → card ganha
  tonalidade vermelha no funil + notificação no CRM pro closer. Infra já existe: Notification
  (15 tipos) + Celery beat (`sla_warnings`, `deadlines`) — adicionar tarefa diária
  "coleta vencida" (mesmo padrão do SLA do Suporte) + flag que o front usa pra pintar o card.
- **A CONFIRMAR com John (não bloqueia o registro):**
  - Início da contagem: entrada em Coleta de Dados (aprovação) OU envio do link do forms?
    (assumido: entrada em Coleta de Dados.)
  - 3 dias corridos ou úteis?
  - Escalonamento após os 3 dias (ex.: 5 dias → avisa gestor / follow-up automático SDR) ou só
    fica vermelho?

---

## 05 · Automação "Entrada de cliente novo no Jurídico" (VALIDADA — brainstorming 2026-06-12)
- **Status:** ✅ design validado por John. No fluxograma (bloco 3). Aguardando implementação.
- **Setor/fase:** Jurídico (F3) + Comercial/Financeiro (F2/F4)
- **Objetivo:** quando um cliente novo fecha, o card de contrato no Jurídico precisa nascer com
  TUDO pra montar o contrato: os dados do forms + a proposta fechada.

### Estado atual (gap)
- O signal `on_client_onboarding_saved` (backend/juridico/signals.py) já cria o
  `LegalCase(contrato)` no submit do `ClientOnboarding`, mas só grava uma **nota de texto**.
  NÃO vincula o onboarding nem a proposta — o Jurídico hoje não recebe dado estruturado nenhum.
- `ClientOnboarding` (backend/sales/models.py ~l.597) captura: empresa (razão social, CNPJ,
  endereço), representante/signatário (nome, estado civil, profissão, CPF, endereço) e contato
  financeiro. `LegalCase` (backend/juridico/models.py) só tem FK p/ customer e project.

### Decisões de John (brainstorming)
- **Dado imutável:** o cliente NÃO edita o forms depois de enviar → o dado nasce congelado.
  Logo, o caso aponta pro forms por REFERÊNCIA (não precisa copiar/snapshot).
- **Da proposta o Jurídico recebe AMBOS:** o documento (link/arquivo) + os termos estruturados
  (valor, forma de pagamento, serviços).

### Design (abordagem: vínculo por referência)
01° **Modelo (aditivo):** adicionar ao `LegalCase` dois FKs:
    `onboarding` → `sales.ClientOnboarding` e `proposal` → `sales.Proposal`.
02° **Gatilho (enriquecer o signal):** no submit do onboarding, além de criar o caso, **vincula**
    o `onboarding` e a `proposal` aprovada daquele prospect (no fluxo, a proposta é aprovada
    ANTES do forms, então já existe). Mantém idempotência (não duplica caso aberto) e a flag
    `AUTOMATION_JURIDICO_CONTRATO` (off/dry_run/on).
03° **Card do Jurídico (2 painéis read-only):**
    - 📋 **Dados do Cliente** (do onboarding): empresa + representante + contato financeiro.
    - 📄 **Proposta fechada** (da proposal): documento + valor/forma de pagamento/serviços.
    - + o campo `notes` que já existe, pro Jurídico anotar.
04° **Sem proposta vinculável** (caso manual): cria mesmo assim só com os dados do cliente; o
    painel da proposta mostra "sem proposta vinculada".
- **Pendência aberta (não bloqueia):** o **contato financeiro** do forms vai junto também pro
  Financeiro, ou só pro Jurídico? (a confirmar com John)

---

## 06 · Jurídico: processo próprio por modalidade + card único circulando (VALIDADO 2026-06-12)
- **Status:** ✅ design validado por John no chat. **Fluxograma a atualizar** (bloco 2 do
  `fluxo-proposta-atual.html` está no modelo antigo "filtro sobre o mesmo kanban" e precisa
  refletir o novo modelo). Aguardando implementação.
- **Setor/fase:** Jurídico (F3) + Produção (F5) + Financeiro (F4)

### Decisões de John
01° **Cada modalidade vira um processo/tela próprio** (não é só filtro sobre o mesmo kanban
    como é hoje — `frontend/app/(dashboard)/juridico/page.tsx` filtra por `process_type`).
    As colunas variam por modalidade.
02° **UM card por cliente circula entre as modalidades**, com **histórico de movimentação**.
    Não nascem cards separados por modalidade: é o mesmo card que muda de modalidade, e cada
    passagem (mudança de modalidade, mudança de status, documento assinado com link Autentique +
    data) fica registrada na linha do tempo do card — então o contrato assinado não se perde,
    fica no histórico.
03° **Colunas por modalidade (confirmadas):**
    - **Contrato:** Preparação → Envio p/ Assinatura → Aguardando → Assinado
    - **Validação:** Preparação → Envio → Aguardando → Assinado → **Aprovado para Desenvolvimento** (5ª coluna nova)
    - **Aditivo:** Preparação → Envio → Aguardando → Assinado
    - **Encerramento:** Análise/Pendências → Distrato → Envio → Aguardando → Assinado/Encerrado

### Saídas (automação) por modalidade — "última coluna → pra onde vai"
| Modalidade | Entra quando | Última coluna | Saída (automação) |
|---|---|---|---|
| Contrato | cliente envia o forms (Coleta) | Assinado | → Financeiro libera a cobrança · quando pago, projeto inicia → Produção |
| Validação | Produção (Dev) põe o card na coluna "validação" | Aprovado p/ Desenvolvimento | → Produção: card do Dev vai pra "Desenvolvimento" (libera iniciar) |
| Aditivo | mudança de escopo (Produção/Comercial) | Assinado | → Produção (nova fase) + Financeiro (se houver valor) |
| Encerramento | cliente solicita | Assinado/Encerrado | → Financeiro: acerto final / encerra cobrança |

### Handshakes cross-setor (2 sentidos)
- **Produção → Jurídico:** Dev move o card pra coluna "validação" → o card no Jurídico entra
  automaticamente na modalidade **Validação** (Preparação). **Preenche o gap do E2E** (o
  produtor do gatilho `validacao_documento` que faltava no código).
- **Jurídico → Produção:** validação chega em "Aprovado para Desenvolvimento" → o card do Dev
  vai pra coluna "Desenvolvimento". Dev sabe que pode iniciar.
- **O lado operacional do Dev/Produção ainda será detalhado** (John sinalizou).

### Implicações de implementação (a detalhar)
- A UI do Jurídico deixa de ser "filtro sobre 1 kanban" e passa a ter processo/colunas por
  modalidade; o `process_type` do card muda ao longo do tempo (com histórico).
- Precisa de entidade/registro de **histórico de movimentação** do LegalCase (timeline de
  modalidade/status/documentos) — preservar cada documento assinado (link + data).
- Coluna nova **"Aprovado para Desenvolvimento"** só na Validação.
- Implementar os 2 handshakes (Produção↔Jurídico), atrás de flag de automação.
- **✅ Fluxograma atualizado (2026-06-12):** bloco 2 reconstruído — 4 modalidades com colunas
  próprias, entrada (⬅ de qual setor) e saída (➡ pra qual setor), card único circulando.

### Encerramento (4ª modalidade) — VALIDADO 2026-06-12
- **Entrada:** ÚNICA manual. Na tela de Encerramento do Jurídico, seleciona o cliente e inicia.
  Amarrado a **projeto de receita recorrente** (a tela de recorrentes do Dev será detalhada
  depois — ponto de encontro: a coluna "Encerrados").
- **Colunas:** Análise/Pendências → Distrato → Envio → Aguardando → Assinado/Encerrado.
- **Saída (assinado):** ➡ Dev (board de recorrentes): card vai pra coluna **"Encerrados"** com
  **instruções de offboarding** (como finalizar) + ➡ Financeiro: acerto final / encerra a
  cobrança recorrente.
- **Pendências abertas (não bloqueiam):** (a) o que dispara a decisão de encerrar (cliente pede
  cancelamento? fim de contrato? inadimplência?); (b) o conteúdo do checklist de offboarding.

---

## 08 · Produção (Dev): etapas atualizadas + ações por etapa + cronograma datado (em construção)
- **Status:** 🟡 em construção. John envia as ações de cada etapa; montar o bloco do Produção no
  fluxograma no formato etapa → ações (com data).
- **Setor/fase:** Produção (F5) + Motor de Cronograma (F7)

### Etapas atualizadas (John, 2026-06-12) — kanban principal
1. **Agendar** (reunião de Onboarding) 🆕 — ver decisão Visão 2 abaixo
2. **Planejamento** (era "Preparação")
3. **Onboarding** (Dia 0)
4. **Documentação**
5. **Validação da doc** (handshake Jurídico)
6. **Desenvolvimento** (gate Regra de Ouro)
7. **Auditoria interna**
8. **Reunião de Apresentação** (era "Apresentação/liberação")
9. **Janela de teste** 🆕 (era sub-passo da homologação → coluna própria)
10. **Re-Update** 🆕 (era sub-passo / ReUpdateCycle → coluna própria)
11. **Homologação** (= cliente aprovou)
12. **Entregue** (era "Registro da entrega")
13. **Implementado** (era "Graduação / Implementação")
- Campo ortogonal `situacao`: Ativo · Em Espera · Cancelado (mantém).
- **Pendência:** a bifurcação Fechado/Recorrente sumiu da lista (terminava em Graduação vs
  Implementação + Recorrência). Assumido: "Implementado" é o fim do kanban e a parte recorrente
  vive na tela separada "Projetos Recorrentes" (com a coluna "Encerrados"). **A confirmar.**

### Ações dentro do card por etapa (cada ação aparece no card do cliente)
- Cada etapa tem um checklist de ações que o Dev segue, exibido **dentro do card**.
- **Cada ação já vem DATADA** pelo motor de cronograma — não se digita data na mão.

### Cronograma datado — como liga (base já existe)
- `backend/projects/scheduling/engine.py`: distribui o prazo nas 6 fases (doc/val/dev/aud/hom/ent).
- `backend/projects/scheduling/substeps.py` (`expand_substeps`): **já destrincha cada fase em
  sub-passos DATADOS** (porte exato do `subSteps()` do v34). As ações de John encaixam nesses
  sub-passos → cada ação no card nasce com a data calculada a partir do Dia 0 + parâmetros.

### DECISÃO Visão 2 (2026-06-12) — "Agendar" ancora o cronograma
- **Problema:** o motor só data ações quando existe o Dia 0 (âncora = data da reunião de
  Onboarding). Antes disso, nenhuma ação tem data.
- **Decisão:** criar a etapa **"Agendar"** como a 1ª. Ao marcar a reunião de Onboarding, crava o
  **Dia 0 (provisório)** → o motor calcula TUDO: as ações de prep **de trás pra frente** da
  reunião + todo o roadmap pra frente. Remarcar → recalcula e guarda `ScheduleVersion`.
- **Implicação de implementação:** hoje `dia_zero` só é setado quando o onboarding ACONTECE
  (`onboarding_realizado_at`, em transitions.maybe_set_dia_zero). Precisa de um conceito de
  **data de onboarding AGENDADA** (âncora provisória) distinta do `dia_zero` confirmado; e o
  motor precisa datar ações **pré-Dia-0 de trás pra frente** (offsets negativos).

### 1ª etapa — ações (exemplo fornecido por John)
**Etapa "Agendar":**
- 01° Agendar a reunião de Onboarding → crava a âncora (Dia 0 provisório).
**Etapa "Planejamento"** (datadas de trás pra frente da reunião):
- 02° Reunir e revisar o material do Comercial (contexto do negócio) + revisar a proposta
  comercial (escopo vendido e prazo acordado).
- 03° Montar o Game Plan visual (roadmap das etapas e prazos do projeto).
- 04° Preparar o roteiro de mapeamento.
- Janela do Dev: da assinatura+pagamento até a reunião de Onboarding.
- **Próximo:** John envia as ações das demais etapas.

---

## 07 · Aditivo + "Solicitação de Mudança" (Dev ↔ Jurídico) — VALIDADO 2026-06-12
- **Status:** ✅ design validado no chat. Fluxograma a atualizar. Aguardando implementação.
- **Setor/fase:** Produção/Dev (F5) + Jurídico (F3) + Financeiro (F4)

### O que já existe (e o gap)
- `projects.ChangeRequest` já existe: `title`, `description`, `impact_hours`, **`impact_value`**,
  `status` (pending→approved), `approved_by`/`approved_at`. **NÃO há automação** ligando uma
  mudança a um `LegalCase(aditivo)` (nem em juridico/signals nem em projects/signals/receivers).

### Nomenclatura (decisão de John)
- "Escopo" foi descartado. Termo escolhido: **"Solicitação de Mudança"** (Change Request / PMBOK).
- **Colunas no board do Dev:** `Solicitação de Mudança` (aberta, no Jurídico) →
  `Mudança Aprovada` (cliente assinou) / `Mudança Recusada` (cliente recusou).

### Fluxo do Aditivo
01° **Origem (Dev):** durante o desenvolvimento o Dev abre uma **Solicitação de Mudança**
    (a partir do ChangeRequest: descrição + horas + valor estimado). Card na coluna
    "Solicitação de Mudança" do board do Dev.
02° **⚡ Handshake Dev → Jurídico:** abrir a solicitação cria/move o card (do cliente) pra
    modalidade **Aditivo** no Jurídico. Recebe **por referência**: os dados da mudança
    (ChangeRequest) + o **contrato original** (LegalCase contrato assinado).
03° **Colunas da modalidade Aditivo no Jurídico (ajuste John 2026-06-13):**
    1. **Nova solicitação** — chega o card novo quando o Dev solicita · **⚡ avisa o Financeiro
       também** (pré-cadastra o valor adicional, pendente — paralelo, como no Contrato).
    2. **Preparação** — prepara o documento, sobe no Autentique e **envia ao cliente** (o "Envio"
       fica embutido aqui, não é coluna separada).
    3. **Aguardando** — aguardando a assinatura.
    4. **Assinado** / **Recusado** — dois desfechos (colunas terminais).
04° **⚡ Saídas (2 desfechos):**
    - **Assinado** → board do Dev: **"Mudança Aprovada"** + ⚡ **Financeiro ATIVA a cobrança** do
      `impact_value` (que estava pré-cadastrado) → Dev libera a nova fase.
    - **Recusado** → board do Dev: **"Mudança Recusada"** + ⚡ **Financeiro cancela** o
      pré-cadastro (projeto segue sem a mudança, sem cobrança).

### Pendência aberta (não bloqueia)
- **Quem define o `impact_value`** (o valor da mudança) antes de ir pro cliente? O Dev estima as
  horas; o valor comercial precisa do closer/Comercial, ou é derivado das horas? (a confirmar)

---

# ACHADOS DO TESTE MANUAL DE JOHN (após o desenvolvimento — 2026-06-13)
> John testando a branch v32-ajustes. Registro só; corrigir tudo junto no fim (mesmo modo).

## T01 · Coleta de Dados: o card precisa expor o LINK DO FORMS pra enviar ao cliente
- **Status:** 🟡 aberto (testando). Liga com o GAP #1 já conhecido do desenvolvimento.
- **Onde:** CRM Comercial → card do cliente na coluna **"Coleta de Dados"**.
- **O que John apontou:** quando o card vai pra Coleta de Dados, ele precisa ter acesso ao
  **link do FORMS** (coleta de dados) pra copiar e enviar ao cliente — mesmo que o link também
  esteja dentro da proposta. Hoje não aparece.
- **Causa (já mapeada no dev):** o endpoint `create-onboarding` (backend/sales/views.py ~l.865)
  só aceita `prospect.status in ('won','data_collection','production')` — NÃO aceita o status
  novo `coleta_de_dados`. Então, ao aprovar a proposta (que move pra `coleta_de_dados`), o banner
  do link de onboarding no drawer do FunilTab (gate em won/production, ~l.2065) não aparece e a
  criação seria recusada.
- **Correção (na fase de reconciliação):**
  1. Backend: `create-onboarding` aceitar `coleta_de_dados` (e provavelmente `projeto_fechado`).
  2. Frontend: no card em "Coleta de Dados", mostrar o **link do FORMS** (gerar/copiar) — e, como
     desenhamos no item 04, ter os 2 links (proposta + forms) acessíveis pelo card.
- **Confirma o redesenho:** é o que o item 04 e o doc 10 já previam (2 links no card da Coleta).

## T02 · CRM de Projetos: barra de rolagem horizontal precisa ficar EM CIMA
- **Status:** ✅ corrigido (2026-06-14) — barra sincronizada no topo (`projects/page.tsx`), tsc
  limpo. Aguardando verificação visual de John.
- **Tela/rota:** `/projects` (kanban de Produção por etapa)
- **O que foi apontado:** com muitos cards, as colunas ficam altas e a **barra de rolagem
  horizontal** (pra mover o kanban lateralmente) fica lá embaixo — o usuário precisa **descer até
  o fim** pra alcançá-la e mexer no CRM. Precisa estar **acessível no topo**.
- **Onde no código:** `frontend/app/(dashboard)/projects/page.tsx:274` — `<div className="flex
  gap-4 overflow-x-auto pb-4">` (o scrollbar nasce no rodapé do container).
- **Correção (a aplicar na fase de UI):** opção recomendada — **barra de rolagem sincronizada no
  topo**: um `<div>` fino acima do kanban (mesma largura do conteúdo, `overflow-x-auto`, ~12px)
  com `scrollLeft` espelhado por JS entre ele e o container do kanban (scroll de um move o outro).
  Alternativa: dar `max-height` ao kanban + scroll vertical interno das colunas, deixando a barra
  horizontal sempre visível. Aplicar o mesmo no CRM Jurídico (colunas por modalidade) se repetir.
- **Escopo:** frontend, baixo risco.
> 2 jornadas (Padaria Aurora=Fechado, TransLog=Recorrente) + RBAC. Ambas completaram ponta a
> ponta, MAS só com 5-6 workarounds de admin cada → o caminho feliz está quebrado nos P0 abaixo.

### ✅ Confirmado funcionando (ponta a ponta)
- **Cobrança em dobro CORRIGIDA** — pré-cadastro F4 idempotente, 1 invoice (Aurora) / 13 (TransLog), sem dobra.
- project_type derivado (fechado/recorrente); send→proposal; approve→coleta_de_dados.
- Jurídico: contrato/validação/aditivo transitam até assinado + **timeline (LegalCaseEvent)** gravada.
- Finance LIBERA_COBRANCA sem dobrar; **Dia 0** (3 critérios); **Dev gate (Regra de Ouro)** robusto nos 2 sentidos.
- Bifurcação por tipo + RecurrenceContract idempotente; validação pública (CNPJ/CPF) ok; **RBAC do Financeiro** ok.

### 🔴 P0 — bloqueadores do caminho feliz (hoje só passam com admin)
- **P0.1 Customer não é criado no funil (gap RAIZ):** nada em comercial→coleta cria o Customer do
  prospect. Sem ele, pré-cadastro F4 + sync + LegalCase(contrato) abortam silenciosos no submit.
- **P0.2 create-onboarding rejeita `coleta_de_dados`** (= T01) + `coleta_de_dados`↔`data_collection`
  são sinônimos divergentes; a guarda V32_TRANSITIONS_INTO_NEW só deixa data_collection a partir de won.
- **P0.3 mark_paid estoura 500:** invoice de pré-cadastro nasce sem `bank_account`; a Transaction
  copia o NULL e `transactions.bank_account_id` é NOT NULL (em TransLog não havia NENHuma conta).
- **P0.4 Project de Produção não é criado na assinatura do contrato:** o receiver exige Project
  pré-dev existente; sem ele, no-op silencioso.

### 🟡 P1 — automações que disparam mas incompletas
- **P1.5 Aditivo assinado NÃO aprova o ChangeRequest** (fica pending) — loop volta-pro-dev incompleto. (única automação marcada incorreta)
- **P1.6 Comissão no approve:** aborta sem Customer mas seta `commissions_generated_at` → nunca re-tenta.
- **P1.7 RecurrenceContract `monthly_value=0.00`** — não herda o valor recorrente do ProposalPaymentPlan.

### 🟢 P2 — RBAC e polimento
- **P2.8 sales/ ainda sem HasSectorAccess:** financeiro consegue escrever no Comercial (segregação só existe no finance/). Aplicar HasSectorAccess('comercial').
- **P2.9** payload de proposta exige billing_type + valid_until (doc/UX).
- **P2.10** GET cronograma/ vazio mesmo com âncora + Dia 0 (investigar materialização do Game Plan).

### RECONCILIAÇÃO (resultado — 2026-06-13)
> Workflow corrigiu P0/P1/P2 + revalidou com 2 jornadas NOVAS. **Meta atingida: 0 workarounds de
> admin** (Padaria Bela Vista=Fechado e RotaSul=Recorrente rodaram ponta a ponta limpas).
> 1048 testes passando (4 falhas = artefato de ambiente, passam com flag dry_run); tsc limpo;
> sem novas migrations (correções comportamentais). NÃO pushado.

**Corrigido:** P0.1 Customer auto no approve (raiz) · P0.2 create-onboarding aceita
coleta_de_dados + banner no card · P0.3 mark_paid com conta default (sem 500) · P0.4 Project
criado na assinatura do contrato · P1.5 aditivo assinado → ChangeRequest "Mudança Aprovada" ·
P1.7 RecurrenceContract herda monthly_value · P2.8 RBAC por setor no sales/ · P2.9 proposta
billing_type/valid_until com default · P2.10 cronograma materializa on-demand.

**🔴 2 decisões de John (achados ALTOS da revisão — NÃO corrigidos):**
- **D1 (RBAC × prod):** aplicar RBAC por setor no Comercial faz os usuários do Comercial em
  PRODUÇÃO precisarem de `sectors=['comercial']`, senão tomam 403 ao escrever. **Antes de subir
  pra prod: backfill do campo `sectors`.** (dev/local ok.)
- **D2 (PII):** com RBAC por setor no Customer, o `viewer` (leitura global) passou a conseguir o
  `data-export` (PII do cliente). Confirmar: viewer DEVE exportar PII? Se não, checagem extra na
  action (aditiva).

**🟡 Gaps que sobraram (não bloqueiam):**
- Funil: envio do form NÃO move o card pra "Projeto Fechado" (doc 09 §04 passo 13) — Jur/Fin/Prod
  operam normais, mas o status do card não avança.
- Cronograma: o Game Plan datado não materializa sozinho ao cravar âncora/Dia 0 — só sob demanda
  (POST). Pela Visão 2 deveria gerar sozinho. (gap real)
- Bifurcação label/rota: Fechado vai registro_entrega→graduação→recorrência (terminal); o label
  "Concluído" (etapa implementacao) é só do recorrente. Confirmar se "Concluído" é o terminal do Fechado.
- Invoice de aditivo nasce sem bank_account (mesmo padrão P0.3); não estoura no caminho feliz, mas
  se for paga pode repetir o 500. Pequeno.

---

## T-E2E-2 · Re-validação independente JORNADA FECHADO (2026-06-13, branch v32-ajustes)
> Senior validator rodou a jornada FECHADO INTEIRA ponta a ponta de novo, cliente novo
> "Mercado Sao Jorge Ltda" (Helena Costa, one_time), só via endpoints documentados (john admin,
> flags AUTOMATION_* on). **Meta atingida: 0 workarounds de admin** — nenhum estado avançado na
> marra; tudo passou pela automação/transição correta. 1072 testes backend passando (0 falhas,
> só 4 warnings de paginação/teardown); `tsc --noEmit` limpo.

### ✅ Automações confirmadas funcionando
- **Customer automático no approve** (P0.1): aprovar PROP-00010 criou Customer #7 e vinculou.
- **Comissão** (idempotente): 2 ClientCost no approve — Closer R$1.800 (10%) + SDR R$900 (5%).
- **billing_type/valid_until default** (P2.9): omitidos no POST → `fixed` (one_time) + hoje+30.
- **approve → coleta_de_dados** + create-onboarding aceita `coleta_de_dados` (P0.2/T01) + gera token.
- **Submit do forms** dispara em paralelo: LegalCase(contrato) #17 vinculado a proposta+onboarding
  (§05) E pré-cadastro Financeiro (1 invoice REC-00048, R$18.000, **bank_account=1**, sem dobra).
- **Contrato assinado**: criou Project #8 (P0.4) + liberou cobrança (`cobranca_liberada=True`).
- **mark_paid sem 500** (P0.3): invoice paga + Transaction #11 com bank_account=1 (não-NULL).
- **Produção** (Dia 0): agendar crava âncora; 3 critérios (contrato+entrada+onboarding) → dia_zero=2026-06-20.
- **Handshake Produção→Jurídico**: submit do doc (pending_validation) criou LegalCase(validacao) #19.
- **Handshake Jurídico→Produção**: validacao assinada criou ProjectDocument baseline `signed` → **Dev gate liberado**.
- **Regra de Ouro robusta**: gate bloqueava só na baseline; liberou só com os 3 ok.
- **Aditivo (P1.5 — antes incorreto, AGORA OK)**: aditivo assinado → ChangeRequest #5 vira
  `approved` (Mudança Aprovada) + Financeiro ativa a cobrança pré-cadastrada (INV REC-00062, R$4.000).
- **Falha do H1 VISÍVEL**: forçando exceção no pré-cadastro F4, o erro sai como `ERROR` + traceback
  (`logger.exception`) e NÃO derruba o submit (signal do Jurídico ainda roda). Falha não é engolida.
- **RBAC por setor**: producao RW só producao+admin (fran/bia/leo → 403 write, read global ok);
  comercial RW só comercial+admin (fran financeiro **bloqueado** de escrever no Comercial — P2.8).

### Observações (consistentes com os gaps já registrados; não bloqueiam)
- **Funil não avança**: prospect ficou em `coleta_de_dados` após submit do forms — confirma o gap
  "envio do form não move o card pra Projeto Fechado" (§04 passo 13). Jur/Fin/Prod operam normais.
- **Aditivo invoice COM bank_account**: nesta corrida a INV de aditivo (REC-00062) nasceu já com
  `bank_account=1` — o gap "aditivo sem bank_account" parece resolvido p/ este caminho.
- **Bifurcação fechado**: terminal = `recorrencia` (label "Implementado") via `etapa_10_graduacao`
  ("Homologação"); `implementacao` ("Concluído") é rejeitado p/ fechado (guard ok). Pendência de
  NOMENCLATURA permanece: confirmar com John se o terminal do Fechado deve se chamar "Concluído".

---

# PARECER GO/NO-GO (correção + validação sênior — 2026-06-13, HEAD c14bf32)
> Workflow: Sr. fixer (worklist) → Sr. code review + Sr. segurança → fixer altos → 2 jornadas
> E2E → veredito. Worklist 8/8 FECHADO (H1/H2/H3/M1/M2/M4/L3/L4 + higiene). 1072 testes verdes,
> tsc limpo, migrations aditivas. Ambas as revisões: aprovado-com-ressalvas. Jornadas: Fechado 0
> workarounds; Recorrente 1 (ordem de passos — pagar entrada antes de assinar; não é bug).

**RECOMENDAÇÃO: GO COM RESSALVAS** — código pronto; ressalvas são deploy-time/política.

## Checklist pré-deploy (obrigatório antes de subir)
1. [ ] **Backup do banco** antes de migrate (ERP em prod).
2. [ ] **Dup-check de e-mail (BLOQUEADOR da migration 0036):**
   `SELECT email, COUNT(*) FROM customers WHERE email <> '' GROUP BY email HAVING COUNT(*) > 1;`
   Se vier linha → reconciliar (decisão de John sobre qual mantém) ANTES de migrar. 0036 falha
   alto-e-claro se não for feito.
3. [ ] **Backfill de `sectors`** dos usuários reais (senão a segregação por setor fica dormente).
4. [ ] **Decisão M3** — política de comissão sobre MRR recorrente.
5. [ ] **Decisão D2** — viewer NÃO exporta PII (já é o comportamento após H3; confirmar).
6. [ ] **Flags AUTOMATION_*** em prod (defaults conservadores).
7. [ ] **Smoke pós-deploy:** health 200; approve→Customer+comissões; mark_paid→Transaction c/ conta.
8. [x] **E-mail do domínio — CONFIGURADO E FUNCIONANDO (2026-06-15):** Resend + Hostinger.
   Domínio `inovasystemssolutions.com` **verificado** (região sa-east-1), DNS (DKIM/SPF/MX/DMARC)
   ok, **2 e-mails de teste entregues** (`delivered`). Falta só pôr no **env de PROD**:
   `EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend` + `EMAIL_HOST_PASSWORD=<API key Resend>`
   (host/port/user/from já vêm certos por default no settings.py). ⚠️ **Rotacionar a API key** que
   foi exposta no chat — a nova vai só pro env de prod.

## Gaps funcionais (follow-up aditivo — não bloqueiam o deploy)
- Submit do forms NÃO move o card → "Projeto Fechado" (doc §04 passo 13).
- Cronograma/Game Plan não materializa sozinho na âncora/Dia 0 (só on-demand; Visão 2 pede automático).
- Naming do terminal do Fechado ("Concluído"?).
- Linkagem LegalCase(contrato).project / invoice.project_id ficam None (rastreabilidade, aditivo).
- Tornar `entrada_paga` retentável quando o Project nasce DEPOIS do pagamento.

## Estado
Tudo na branch `v32-ajustes` LOCAL. NADA pushado/mergeado na v32. Aguarda John: rodar os 2 gates +
tomar M3/D2, e então autorizar o push/merge → deploy.
