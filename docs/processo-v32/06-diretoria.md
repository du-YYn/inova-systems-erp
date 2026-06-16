# Parte 6 · Diretoria (governança)

> **Validado em 2026-06-10** (base: cockpit v34). Não é raia de fluxo: é ponto de decisão e
> governança transversal. App novo: `backend/diretoria/`.

## O que o v34 desenha

```
DIRETORIA (decisão e escalação)            REUNIÃO SEMANAL DE DIRETORIA
  recebe casos sem solução clara             1x/semana, dia fixo
  (chamado inconclusivo ─sc11─►)             revisa 6 áreas, define prioridades
  01° recebe resumo + evidência
  02° decide (absorver/cobrar/negociar)
  03° devolve a decisão pro fluxo
```

## 1. `DirectorEscalation` (recebe os inconclusivos do Suporte)

```python
DirectorEscalation
├── originating_ticket FK SupportTicket   # Suporte, conclusao=inconclusivo
├── raised_by          FK User
├── summary / evidence                    # resumo + evidência (01°)
├── decision           absorver | cobrar | negociar | rejeitar  # (02°)
├── decision_notes
├── decided_by         FK User
├── decided_at
└── resolved           bool               # devolvido ao fluxo (03°)
```
- Ao criar → notifica `User.role='admin'` via `notifications.Notification`.
- Ao decidir → devolve ao ticket (atualiza `SupportTicket.conclusao`/`status` conforme a decisão).

## 2. `DirectoryMeeting` (reunião semanal, estruturada)

```python
DirectoryMeeting
├── date / week_ref
├── attendees      M2M User
├── agenda_review  JSON   # checklist das 6 áreas: comercial/funil, metas/indicadores,
│                          #   carteira, financeiro, produção/projetos, suporte
├── decisions      JSON   # decisões e prioridades da semana
├── notes                 # ata
└── created_by
```
- Celery beat opcional cria o rascunho semanal no dia fixo.
- **Painel agrega KPIs** dos módulos existentes (funil, MRR, projetos, chamados) — sem duplicar
  dado; apenas lê os dashboards/endpoints já existentes.

## 3. Reaproveitado

`notifications.Notification` (alertas), `User.role='admin'` (quem é diretor),
dashboards/endpoints existentes (agregação de métricas pro painel da reunião).

## 4. Pendências herdadas

- **Suporte (Parte 5):** o gatilho `conclusao='inconclusivo'` cria o `DirectorEscalation`.
- Nenhuma outra dependência: a Diretoria é terminal de decisão.
