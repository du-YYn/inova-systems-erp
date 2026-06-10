# Parte 1 · CRM Comercial

> **Validado em 2026-06-09.** Do lead ao Projeto Fechado + Coleta de dados. Depois da
> coleta, o fluxo entrega pros demais setores (Jurídico recebe a demanda de contrato).

App afetado: `backend/sales/` (modelo `Prospect`). Tudo **aditivo** (ERP em produção).

## 1. Pipeline final (enum `Prospect.status`)

### Caminho principal (em ordem)

| # | Código | Label UI | Situação |
|---|--------|----------|----------|
| 01° | `new` | Lead recebido | mantém |
| 02° | `qualifying` | Em qualificação | mantém |
| 03° | `qualified` | Qualificado | mantém |
| 04° | `meeting_invite` | Convite para Reunião | 🆕 novo |
| 05° | `scheduled` | Agendado | mantém |
| 06° | `pre_meeting` | Pré-Reunião | mantém |
| 07° | `meeting_1_done` | Reunião 1 realizada | ✏️ renomeia `meeting_done` |
| 08° | `tech_analysis` | Análise técnica e proposta | 🆕 novo (era "Consulta ao Dev") |
| 09° | `meeting_2_done` | Reunião 2 realizada | 🆕 novo |
| 10° | `proposal` | Proposta enviada | mantém |
| 11° | `won` | Projeto Fechado | mantém |
| 12° | `data_collection` | Coleta de dados | 🆕 novo (último passo do Comercial) |

### Ramos e terminais (mantidos)

| Código | Label | Papel |
|--------|-------|-------|
| `no_show` | Não compareceu | ramo de Agendado/Pré-Reunião |
| `disqualified` | Desqualificado | terminal (lead não válido) |
| `follow_up` | Follow Up | reativação (motivos: nao_agendou, nao_compareceu, nao_fechou) |

### Legados (deprecados, NÃO deletar do banco)

`not_closed`, `production`, `concluded`, `lost`.
Somem do funil novo; nenhum lead novo cai neles; registros antigos seguem até fecharem.
Sem migration de dados destrutiva. "Não fechou" agora vira `follow_up(nao_fechou)`.
Perdas viram `disqualified` ou `follow_up`.

## 2. Campos novos no `Prospect` (aditivo)

```python
# Tipo do projeto — definido na Análise técnica e proposta (etapa 08°)
project_type = CharField(choices=[('fechado','Fechado'),('recorrente','Recorrente')], blank=True)

# Reunião 2 (a Reunião 1 reusa meeting_scheduled_at / meeting_link / meeting_attended)
meeting_2_scheduled_at  = DateTimeField(null=True, blank=True)
meeting_2_link          = URLField(blank=True)
meeting_2_attended      = BooleanField(null=True, blank=True)

# Saída da Análise técnica (escopo/prazo/valor do Dev)
tech_analysis_notes     = TextField(blank=True)            # escopo macro + estrutura
estimated_deadline_days = IntegerField(null=True, blank=True)  # prazo — alimenta o Game Plan depois
# (valor já existe em proposal_value)
```

**Reuniões:** a Reunião 1 usa os campos `meeting_*` existentes (só muda o label na UI);
a Reunião 2 usa os campos `meeting_2_*` novos. Decisão: não renomear colunas em produção.

## 3. Automações internas (transições)

```
qualified ──[SDR envia convite]──► meeting_invite
meeting_invite ──[lead agenda]──► scheduled            (grava meeting_scheduled_at)
scheduled ──[sequência pré-reunião]──► pre_meeting
pre_meeting ──[reunião acontece]──► meeting_1_done      (meeting_attended=true)
   └─[não apareceu]──► no_show ──► follow_up(nao_compareceu)
meeting_1_done ──[closer aciona Dev]──► tech_analysis
tech_analysis ──[Dev define escopo/prazo/valor + project_type]──► meeting_2_done
meeting_2_done ──[proposta enviada]──► proposal         (cria Proposal)
proposal ──[cliente aceita]──► won
   └─[não fechou]──► follow_up(nao_fechou)
won ──[dispara abertura]──► data_collection
   └─ cria/envia ClientOnboarding (link público já existe) via WhatsApp
data_collection ──[cliente preenche o forms]──► FIM do Comercial
   └─ ClientOnboarding.status='submitted' = GATILHO de entrega pro Jurídico (Parte 2)
```

## 4. Ponto de saída

Fim do Comercial = `data_collection` + `ClientOnboarding.status='submitted'`.
É esse o gatilho que cria a demanda de **contrato** no CRM Jurídico (detalhado na Parte 2).

## 5. Migração (ERP em produção)

01° Aditivo: adicionar os 4 status novos no enum + os 5 campos novos. Migration só adiciona.
02° Data migration: `UPDATE prospects SET status='meeting_1_done' WHERE status='meeting_done'`.
03° Legados (`not_closed`/`production`/`concluded`/`lost`): permanecem no enum, somem da UI.
04° Testes: cada transição nova + a data migration de renomeação.
