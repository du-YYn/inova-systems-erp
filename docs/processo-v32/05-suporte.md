# Parte 5 · CRM de Suporte

> **Validado em 2026-06-10** (base: cockpit v34). Chamados de projeto fechado ou recorrente.
> App: `backend/support/`. Realinhamentos via data migration (ERP em prod). 2 níveis:
> cliente único + chamados pendurados (já é assim hoje).

## Fluxo (v34)

```
Chamado aberto ─► Triagem ─┬─(bug)──────► Análise ─┬─(fechado)─► Correção/Orçamento ─► Resolvido ─► Fechado
   (canal único)           │                       ├─(recorrente)► Correção (recorrente) ─► Resolvido
                           │                       └─(inconclusivo)► DIRETORIA
                           ├─(dúvida)────► resolve direto
                           └─(mudança)───► Pedido de update ─► COMERCIAL (tech_analysis)
Entradas: Etapa 9 · Suporte Básico · Operação Contínua
```

## 1. Realinhar `SupportTicket.ticket_type` (data migration)

```
bug      ← bug, performance, integration, other
duvida   ← question
mudanca  ← feature
```

## 2. Realinhar `SupportTicket.status` (data migration)

```
aberto    ← open
triagem   ← (novo; chamado novo entra aberto → triagem)
analise   ← in_progress
correcao  ← (novo; sub-fase pós-análise)
resolvido ← resolved, pending_client      # pending_client migra p/ resolvido (aguarda retorno)
fechado   ← closed
```

## 3. Campo novo `conclusao`

```python
conclusao = CharField([
  'garantia',           # defeito de produção (passou na auditoria) → corrige sem custo
  'orcamento',          # cliente/terceiro mexeu ou fora de escopo → vira orçamento
  'inconclusivo',       # escala pra Diretoria
  'recorrente_corrige', # projeto recorrente → sempre corrige (contrato mensal)
], blank=True)
```

## 4. Lógica condicional por tipo de projeto (na Análise)

```
se Project.tipo == RECORRENTE → conclusao = recorrente_corrige (sempre corrige, sem orçamento)
se Project.tipo == FECHADO:
     garantia     → corrige sem custo
     orcamento    → cria Proposal/Invoice (Comercial/Financeiro)
     inconclusivo → escala Diretoria
```

## 5. Contexto da triagem (2 velocidades)

```python
contexto = CharField(['homologacao','suporte'], default='suporte')
# homologacao: projeto em etapa_atual=homologacao → chamados em LOTE no prazo (liga ao ReUpdateCycle)
# suporte:     projeto entregue/recorrente → conforme plano do cliente (SLA)
```

## 6. Entidade nova `PedidoUpdate` (ponte Suporte → Comercial)

```
PedidoUpdate
├── originating_ticket FK SupportTicket
├── customer           FK Customer
├── description
├── status             opened | promoted | declined
├── prospect           FK Prospect (criado ao promover)
└── requested_at / promoted_at
```
Triagem classifica `mudanca` → cria `PedidoUpdate` + abre `Prospect` novo entrando direto em
**`tech_analysis`** (Análise técnica), pois é cliente existente (pula Lead/qualificação/Reunião 1).
Conforme o edge do v34 (sup_upd → pn3).

## 7. Escalação Diretoria

`conclusao='inconclusivo'` → dispara escalação. A entidade `DirectorEscalation` é da **Parte 6
(Diretoria)**; aqui fica o gatilho + notificação (reusa `notifications.Notification`).

## 8. Auto-fechamento

Celery task diária: chamado em `resolvido` há mais de **5 dias** (configurável via settings/admin)
sem retorno do cliente → `fechado`. Pode ser desligado.

## 9. Canal único e anexos

- Rota pública `POST /api/v1/support/public/tickets/` (token assinado por cliente, rate limit) p/
  abrir chamado sem login, com texto/imagem/vídeo/áudio.
- Conferir `validate_file_extension` em `TicketAttachment` para aceitar áudio (`.mp3`,`.ogg`,`.m4a`).

## 10. Reaproveitado

`SLAPolicy`, `TicketComment` (is_internal), `TicketAttachment`, `KnowledgeBaseArticle`,
`SupportCategory` — sem mudança.

## 11. Pendências herdadas

- **Diretoria (Parte 6):** entidade `DirectorEscalation` (recebe os inconclusivos).
- **Financeiro:** "orçamento aprovado no ticket → Invoice" (já anotado na Parte 3).
- **Comercial:** o `Prospect` criado pelo PedidoUpdate entra em `tech_analysis` (Parte 1).
