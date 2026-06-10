# Parte 4 · CRM de Produção (Etapas 3-10)

> **Validado em 2026-06-10** (base: cockpit v34). A execução do projeto, do onboarding à
> graduação/implementação. App: `backend/projects/`. Mudanças **aditivas** (ERP em prod).
> O motor de cronograma (Game Plan) é a **Parte 7**; aqui ficam só os campos de parâmetro.

## Sequência (v34)

```
Etapa 3 Preparação ─► Etapa 4 Onboarding (DIA 0) ─► Etapa 5 Documentação
   ─► Etapa 6 Validação doc ──(Jurídico assina)──► Etapa 7 Desenvolvimento
   ║                                                  ║ (paralelo: Atualização semanal)
   ─► Etapa 8 Auditoria interna ─► Etapa 9 Apresentação/liberação
   ─► Janela de teste ─► re-update ─► Cliente aprovou ─► Registro da versão
   ─► BIFURCAÇÃO por tipo:
        FECHADO:    Etapa 10 Graduação ─► Suporte Básico
        RECORRENTE: Implementação ─► Operação Contínua
```

## 1. Status realinhado — campo novo `etapa_atual` (aditivo)

Campo novo `etapa_atual` ao lado do `status` atual (data migration mapeia; `status` vira legado).

| # | `etapa_atual` | Entra quando | Status antigo |
|---|---|---|---|
| 1 | `etapa_3_preparacao` | projeto criado (entrada paga) · **não conta no prazo** | planning, kickoff |
| 2 | `etapa_4_onboarding` | onboarding realizado · **seta o Dia 0** | requirements |
| 3 | `etapa_5_documentacao` | onboarding concluído | — |
| 4 | `etapa_6_validacao_doc` | doc pronta pra validar | — |
| 5 | `etapa_7_desenvolvimento` | **doc assinada** (Jurídico) | development |
| 6 | `etapa_8_auditoria` | dev concluído | testing |
| 7 | `etapa_9_apresentacao` | auditoria aprovada | — |
| 8 | `homologacao` | acesso liberado (janela + re-update + aprovação) | — |
| 9 | `registro_entrega` | cliente aprovou | deployment |
| 10 | `etapa_10_graduacao` | tipo=FECHADO | completed |
| 10b | `implementacao` | tipo=RECORRENTE | — |
| 11 | `recorrencia` | graduação/implementação concluída (sub-campo: `suporte_basico` \| `operacao_continua`) | — |

**Estados ortogonais** (campo separado `situacao`): `ativo` \| `em_espera` (← on_hold) \| `cancelado` (← cancelled).
Assim um projeto em espera não perde a etapa em que parou.

## 2. Campos novos no `Project`

```python
tipo            = CharField(['fechado','recorrente'])        # vem do Comercial (Parte 1)
etapa_atual     = CharField(...)                             # enum acima
recorrencia_tipo = CharField(['suporte_basico','operacao_continua'], blank=True)
situacao        = CharField(['ativo','em_espera','cancelado'], default='ativo')

# Gatilho do Dia 0 (3 critérios)
contrato_assinado_at    = DateTimeField(null)   # do LegalCase(contrato) assinado
entrada_paga_at         = DateTimeField(null)   # do Invoice da entrada (Financeiro)
onboarding_realizado_at = DateTimeField(null)   # da Etapa 4
dia_zero                = DateField(null)        # = data do onboarding, só quando os 3 ✓

# Parâmetros do Game Plan (Motor — Parte 7)
prazo_total, modo, pct_doc, pct_dev, pct_aud,
peso_val, peso_hom, peso_ent, reupd_fds,
considerar_carnaval, considerar_corpus,
data_reuniao_validacao, data_reuniao_apresentacao, data_reuniao_graduacao
```

## 3. Entidades novas

```
OnboardingMappingForm   # Etapa 4 — roteiro de mapeamento (7 blocos preenchíveis)
ProjectDocument         # Etapa 5 — 12 seções, baseline; vira LegalCase(validacao) no Jurídico
WeeklyUpdate            # atualização semanal (resumo, pendências, enviado, canal)
ReUpdateCycle           # homologação (apontamentos do cliente, ciclos, dias de fim de semana)
ProjectAudit            # Etapa 8 — checklist contra a doc + marco de aprovação (destrava Etapa 9)
ScheduleVersion         # histórico do Game Plan (comparar antes/depois de remarcação)
```

## 4. Entidades reaproveitadas (sem mudança)

`ProjectPhase` (recebe as 6 fases datadas do Game Plan), `Sprint`, `ProjectTask`, `TimeEntry`,
`ChangeRequest` (processo de mudança), `ProjectEnvironment` (registro da versão entregue),
`DeliveryApproval` (Etapa 9 apresentação/liberação com link admin único + "cliente aprovou").

## 5. Bifurcação Fechado/Recorrente

```
Registro da versão entregue
   ├─ tipo=FECHADO    → etapa_10_graduacao → signal cria RecurrenceContract(suporte_basico)
   └─ tipo=RECORRENTE → implementacao       → signal cria RecurrenceContract(operacao_continua)
```
**Decisão:** `RecurrenceContract` **nasce na bifurcação da Produção** (garante "todo entregue
entra em recorrência"). Modelo do RecurrenceContract detalhado na Parte 6 (Integrações/MRR).

## 6. Regras de ouro (validações)

| Regra | Onde implementar |
|---|---|
| Dev só começa com assinatura + pagamento + doc aprovada | validação ao entrar em `etapa_7_desenvolvimento` |
| Dia 0 = onboarding; Etapa 3 não conta no prazo | Motor (Parte 7) + `dia_zero` |
| Escopo = doc aprovada; adição vira mudança | `ChangeRequest` (já existe) |
| Cliente só vê após auditoria passar | `ProjectAudit` aprovada destrava `etapa_9` |
| Todo entregue entra em recorrência | signal na bifurcação cria RecurrenceContract |

## 7. Link com o Motor de Cronograma (Parte 7)

O motor (função pura que gera o Game Plan datado) é a **Parte 7**. Aqui ficam os campos de
parâmetro no `Project` + `ScheduleVersion`. Quando a Etapa 4 acontece e `dia_zero` é setado, o
motor gera as datas e popula os `ProjectPhase` (doc/val/dev/aud/hom/ent).

## 8. Pendências herdadas

- **Suporte (Parte 5):** a saída da Produção (Etapa 9, Suporte Básico, Operação Contínua) alimenta o CRM de Suporte.
- **Integrações (Parte 6):** modelo do `RecurrenceContract` (MRR), e o link "Etapa 5 ProjectDocument → LegalCase(validacao)".
- **Motor (Parte 7):** a função `gerar_game_plan` e os testes.
