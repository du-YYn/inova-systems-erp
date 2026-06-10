# Parte 3 · CRM Financeiro

> **Validado em 2026-06-09** (base: cockpit v34). O `finance/` atual já cobre ~85% das 5
> áreas do v34. **Abordagem: reaproveitar as entidades existentes e focar nas automações.**
> Sem entidades novas grandes. App: `backend/finance/`.

## 1. Os 5 grupos do CRM Financeiro (reaproveitando o finance/ atual)

| Grupo | Sub-passos (v34) | Entidade atual | Status |
|---|---|---|---|
| **Contas a receber** | Entrada/parcelas de projeto · MRR · custo de servidor · orçamento de suporte · aditivo/novo projeto | `Invoice(receivable)`, `ProposalPaymentPlan`, `ContractPaymentPlan`, `ClientCost` | ✅ existe |
| **Contas a pagar** | Custos fixos e impostos · fornecedores/terceiros | `RecurringExpense`, `TaxEntry`, `Transaction(expense)`, `Invoice(payable)` | ✅ existe |
| **Faturamento e fiscal** | Emissão de NF · impostos e guias | `Invoice` (campos NFS-e), `TaxConfig`, `TaxEntry` | ✅ campos prontos; emissão real fica p/ integração |
| **Cobrança e inadimplência** | Faturas em aberto · régua de cobrança · tratar inadimplência | `Invoice(pending/overdue)` | ✅ existe; **régua = novo** |
| **Fluxo de caixa e gestão** | Conciliação · fluxo de caixa · indicadores (MRR/churn/margem) | `Transaction`, endpoint DRE, dashboards | ✅ caixa existe; conciliação + MRR/churn = depois |

## 2. Automações (o que liga o Financeiro ao fluxo)

```
ENTRADA · Coleta de dados preenchida (cliente novo)
   └─► PRÉ-CADASTRA Invoice PENDENTE a partir do ProposalPaymentPlan
       (entrada/parcelas/recorrente já definidos na proposta)
       [roda EM PARALELO com o Jurídico — entrada de cliente novo dispara os dois]

ENTRADA · contrato assinado (Jurídico, LegalCase contrato → assinado)
   └─► LIBERA a cobrança: a Invoice pré-cadastrada vira cobrança ATIVA (regra de ouro)

ENTRADA · encerramento assinado (Jurídico, LegalCase encerramento → assinado)
   └─► acerto final + encerra cobrança recorrente

ENTRADA · orçamento aprovado no Suporte (Parte 5)
   └─► gera Invoice(receivable)

SAÍDA · entrada paga (Invoice da entrada → status=paid)
   └─► PRODUÇÃO liberada (1 dos 3 critérios do Dia 0: assinatura + PAGAMENTO + onboarding)
       substitui o antigo status `production` do Comercial (removido na Parte 1)
```

## 3. Escopo desta parte (validado)

### Entra agora
01° **Pré-cadastro paralelo**: signal/serviço que, ao `ClientOnboarding.status='submitted'`,
    cria `Invoice` pendente a partir do `ProposalPaymentPlan` da proposta vinculada.
02° **Gatilho "contrato assinado → libera cobrança"**: ao `LegalCase(contrato)` assinar,
    a Invoice pré-cadastrada passa de pendente p/ ativa (enviável/cobrável).
03° **Gatilho "entrada paga → Produção"**: ao `Invoice` da entrada virar `paid`, dispara a
    liberação da Produção (compõe o gatilho do Dia 0).
04° **Régua de cobrança** (dunning): Celery task que envia lembrete de fatura a vencer e
    vencida (já existe `check_invoice_overdue`; estender para régua com follow-up).

### Fica para depois (decisão do usuário)
- Indicadores MRR/churn/margem dedicados.
- Conciliação bancária (fluxo; hoje só há `BankAccount.balance`).
- Integração Asaas real (criar cobrança + webhook pagamento) → Parte 6 (integrações).
- Emissão real de NFS-e → Parte 6.

## 4. Pendências herdadas pra outras partes

- **Suporte (Parte 5):** ponte "orçamento aprovado no ticket → Invoice".
- **Jurídico/Produção:** "aditivo assinado → Invoice".
- **Integrações (Parte 6):** Asaas (cobrança/webhook) e NFS-e (emissão).
- **MRR limpo:** decisão de entidade de contrato recorrente dedicada fica para a Produção
  (Parte 4, recorrência/Suporte Básico) ou Integrações (Parte 6).
