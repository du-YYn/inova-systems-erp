# Parte 2 · CRM Jurídico

> **Validado em 2026-06-09** (base: cockpit v34). O Jurídico **controla o fluxo** das
> demandas (não é repositório de documento — o documento real vive no Autentique).
> Dois níveis: cliente único (nível 1) + casos jurídicos pendurados nele (nível 2).

App novo: `backend/juridico/`. Entidade central `LegalCase`. **Valor fica só no Financeiro**
(o Jurídico não lida com valor).

## 1. Entidade `LegalCase` (demanda/caso jurídico)

```python
LegalCase
├── customer        FK Customer          # cliente único (nível 1)
├── project         FK Project (opcional)
├── process_type    contrato | validacao_documento | aditivo | encerramento
├── status          preparacao → envio_assinatura → aguardando_assinatura → assinado
├── source          comercial | producao | cliente
├── autentique_id   / autentique_link / signed_at
├── notes           # info coletada p/ montar o documento
└── created_at / updated_at
```

O documento real (contrato, distrato, etc.) é montado pelo jurídico e **sobe no Autentique**.
O ERP guarda só o card + link/status do Autentique + data de assinatura.

## 2. Os 4 processos (process_type) e suas macro-etapas

Macro-etapas comuns (status do kanban): **Preparação → Envio p/ assinatura → Aguardando
assinatura → Assinado**. Os sub-passos variam por tipo:

| Macro-etapa | Contrato | Validação documento | Aditivo | Encerramento |
|---|---|---|---|---|
| 01° Preparação | Elaborar contrato | Anexar termo + subir Autentique | Elaborar aditivo | Analisar pendências + elaborar distrato |
| 02° Envio p/ assinatura | Enviar p/ assinatura | Enviar pro cliente | Enviar p/ assinatura | Enviar p/ assinatura |
| 03° Aguardando assinatura | Aguardando | Aguardando | Aguardando | Aguardando |
| 04° Assinado | Cliente assina | Cliente assina | Cliente assina | Cliente assina |

(Autentique: o upload acontece na transição Preparação → Envio.)

## 3. Entradas e saídas (automação)

```
ENTRADA contrato      ← Coleta de dados preenchida (Comercial)   ──► cria LegalCase(contrato)
                        EM PARALELO com o Financeiro (cliente novo dispara os dois juntos)
ENTRADA validação     ← Etapa 6 aprovada (Produção)              ──► cria LegalCase(validacao_documento)
ENTRADA aditivo       ← mudança de escopo (processo de mudança)  ──► cria LegalCase(aditivo)
ENTRADA encerramento  ← cliente solicita encerramento            ──► cria LegalCase(encerramento)

SAÍDA contrato assinado      ──► Financeiro: libera a COBRANÇA (sai do pré-cadastro p/ ativa)
SAÍDA validação assinada     ──► Produção · Etapa 7 Desenvolvimento (baseline liberada)
SAÍDA aditivo assinado       ──► Produção (nova fase) + Financeiro (se houver valor)
SAÍDA encerramento assinado  ──► Financeiro: acerto final / encerra cobrança
```

## 4. Entrada de cliente novo = Jurídico + Financeiro em paralelo

```
Cliente preenche a Coleta de dados (ClientOnboarding submitted)
        │
        ├──► JURÍDICO   · cria LegalCase(contrato) · monta · Autentique · cliente assina
        │                 (ao assinar → avisa o Financeiro p/ liberar cobrança)
        │
        └──► FINANCEIRO · PRÉ-cadastra fatura + forma de pagamento (status pendente)
                          · só COBRA após o contrato assinado (regra de ouro)
                          · detalhes na Parte 3
```

**Regra de ouro:** cobrança e desenvolvimento só andam depois que o Jurídico formaliza e o
cliente assina. O Financeiro pode pré-cadastrar em paralelo, mas a cobrança ativa espera a assinatura.

## 5. Relação com o `Contract` existente

O Jurídico **não** se liga ao valor. O registro `Contract` atual (valor/pagamento/PDF) continua
existindo e é usado pelo **Financeiro**. A ligação `LegalCase`↔valor, se necessária, é decidida
na Parte 3 (Financeiro). O Jurídico foca exclusivamente no trâmite de assinatura.

## 6. Pontos herdados pra próxima parte

- **Financeiro (Parte 3):** timing do pré-cadastro paralelo, o que exatamente é cadastrado na
  Coleta de dados, e como a assinatura do contrato libera a cobrança. (Usuário envia o fluxo.)
