# Parte 7 · Motor de Cronograma (o "Game Plan")

> **Validado em 2026-06-10** (base: simulador v34 + Parte 6 do prompt original).
> **Fidelidade exata:** replica o `compute()` do simulador JS, já validado. **TDD estrito.**
> Código 100% novo (não toca em nada existente). Os campos de parâmetro vivem no `Project`
> (Parte 4); aqui está a função que os transforma em datas.

## 1. Estrutura do código (submódulo `projects/scheduling/`)

```
backend/projects/scheduling/
├── __init__.py     # exports: gerar_game_plan, CronogramaParams, GamePlan
├── types.py        # dataclasses: CronogramaParams, GamePlan, Fase, SubPasso, ReuniaoCliente, Feriado
├── calendar.py     # easter(), holiday_map(), is_business_day(), add_business_days(), add_calendar_days()
├── engine.py       # distribute_days(), compute_meeting_gaps(), date_phases(), gerar_game_plan()
└── substeps.py     # SUBS dict + expand_substeps() (marcos, blocos, recorrentes, crunch)
```

Princípio: `gerar_game_plan(params)` é **função pura** — mesma entrada → mesma saída, sem I/O,
sem `datetime.now()`. Aceita `date` timezone-naive (Brasil-only).

## 2. Entradas (`CronogramaParams`) — espelha 6.1

| Campo | Tipo | Padrão | Faixa |
|---|---|---|---|
| prazo_total | int | 45 | 5..400 |
| modo | enum | uteis | uteis \| corridos |
| data_onboarding | date | — | Dia 0 |
| pct_doc | int | 15 | 0..40 |
| pct_dev | int | 50 | 20..80 |
| pct_aud | int | 8 | 0..30 |
| peso_val | int | 5 | 1..60 |
| peso_hom | int | 17 | 1..60 |
| peso_ent | int | 5 | 1..60 |
| reupd_fds | int | 0 | 0..8 |
| considerar_carnaval | bool | true | — |
| considerar_corpus | bool | true | — |
| data_reuniao_validacao | date? | null | — |
| data_reuniao_apresentacao | date? | null | — |
| data_reuniao_graduacao | date? | null | — |

Fases na ordem: **Documentação, Validação+assinatura, Desenvolvimento, Auditoria, Homologação, Entrega/Implementação**.

## 3. Distribuição dos dias (6.2) — replicar exato

```
docD = round(prazo * pct_doc/100); devD = round(prazo*pct_dev/100); audD = round(prazo*pct_aud/100)
PISO_AUTO = 3
controlled = docD+devD+audD
if controlled > prazo - PISO_AUTO:
    sc = (prazo - PISO_AUTO)/controlled
    docD=max(0,round(docD*sc)); devD=max(1,round(devD*sc)); audD=max(0,round(audD*sc)); capped=True
rem = max(0, prazo - controlled); wsum = (peso_val+peso_hom+peso_ent) or 1
val_=max(1,round(rem*peso_val/wsum)); hom_=max(1,round(rem*peso_hom/wsum)); ent_=max(1,round(rem*peso_ent/wsum))
# acerto fino: força soma == prazo; sobra vai p/ hom; falta tira de ['hom','val','ent'] (valor>1)
```

## 4. Calendário (6.3)

- Feriados fixos nacionais + SP: `(1,1)(4,21)(5,1)(7,9 RevConstSP)(9,7)(10,12)(11,2)(11,15)(11,20)(12,25)`.
- Móveis via Páscoa (Gauss/computus): Sexta-feira Santa = Páscoa−2; Carnaval = Páscoa−48 e −47
  (se considerar_carnaval); Corpus Christi = Páscoa+60 (se considerar_corpus).
- `is_business_day` = seg-sex e não feriado. `add_business_days` avança N dias úteis.
- Mapa cobre do ano do onboarding por ~3 anos (margem p/ remarcações).

## 5. Datação das fases (6.4) — aplicar 6.7 antes

```
cum=0; for f in fases: f.cumPrev=cum; cum+=f.days; f.cumEnd=cum   # cum final == prazo
for f: f.inicio = add_x(onb, f.cumPrev+1+delay_antes(f.cumPrev+1)); f.fim = add_x(onb, f.cumEnd+delay_antes(f.cumEnd))
entrega_base = add_x(onb, prazo); entrega = add_x(onb, prazo+total_gap)
```
Documentação sempre começa 1 dia útil após o Dia 0.

## 6. Sub-passos por fase (6.5)

`SUBS` dict idêntico ao v34. Três tipos: **marco** (start/end/here), **bloco** (fração por peso `w`,
1 linha por dia, tags início/fim), **recorrente** (sexta, pula feriados em `uteis`).

| Fase | Sub-passos |
|---|---|
| doc | bloco Produção doc (w60); bloco Design/wireframes (w25); bloco Revisão+apresentação (w15); marco "pronta pra validar" (end); marco "agendar validação" (end) |
| val | marco **"Reunião de validação"** (start); bloco "Dev ajusta + envia ao Jurídico" (w100); marco "Cliente assina, baseline" (end) |
| dev | marco "Início" (start); recorrente "Atualização semanal" (sexta); marco "Dev concluído" (end) |
| aud | bloco "Testes" (w60); bloco "Correção dos bugs" (w40); marco "Auditoria aprovada" (end) |
| hom | marco **"Apresentação e liberação"** (start); bloco "Janela de teste" (w55); bloco "re-update" (w45, crunch); marco "Cliente aprovou" (end) |
| ent | marco "Registro da versão" (start); marco **"Graduação/subida"** (here); marco "Plano de recorrência" (end) |

Marcos em negrito = as 3 reuniões com cliente (entram no recálculo 6.7).

## 7. Re-update fim de semana (crunch, 6.6)

No bloco "re-update" da Homologação, `reupd_fds` adiciona sábados/domingos do intervalo como dias
trabalhados extras (linhas "fim de semana") **sem mexer na entrega**. Cap = fins de semana que cabem
no intervalo; se pedir mais, aplica o máximo e gera aviso. Só vale em `uteis`.

## 8. Remarcação das reuniões (6.7) — estende o prazo

```
offV = fase_val.cumPrev+1; offA = fase_hom.cumPrev+1; offG = fase_ent.cumPrev + max(1, round(fase_ent.days/2))
natV=add_x(onb,offV);            gapV = passos_entre(natV, data_reuniao_validacao) if set else 0
natA=add_x(onb,offA+gapV);       gapA = passos_entre(natA, data_reuniao_apresentacao) if set else 0
natG=add_x(onb,offG+gapV+gapA);  gapG = passos_entre(natG, data_reuniao_graduacao) if set else 0
total_gap = gapV+gapA+gapG
delay_antes(o) = (gapV if o>=offV) + (gapA if o>=offA) + (gapG if o>=offG)
```
Data ≤ calculada é ignorada (gap=0). Atraso é cumulativo (val empurra apr e grad).

**DECISÃO (validada):** a graduação **anda junto com a entrega** — `gapG` entra em `total_gap`
(a entrega final soma todos os gaps). Conforme o protocolo do simulador v34.

## 9. Saída (`GamePlan`) — 6.8

- `entrega` (com extensão) e `entrega_base` (sem remarcação).
- Por fase: `inicio`, `fim`, `dias`, `pct` + lista de sub-passos datados.
- Por reunião: data calculada (natural) + atraso aplicado.
- Lista de feriados no período (modo `uteis`).
- Flags: `capped` e aviso do re-update (pediu mais fds do que cabe).
- `total_gap` e mensagem de extensão quando > 0.

## 10. Endpoint + persistência

- `POST /api/v1/projects/cronograma/simular/` — stateless, `IsAuthenticated`, recebe
  `CronogramaParams` (JSON), devolve `GamePlan` (JSON). Sem efeito colateral.
- `POST /api/v1/projetos/{id}/cronograma/` — gera e **persiste** `ScheduleVersion` (histórico) e
  popula os `ProjectPhase` datados (Parte 4).
- Serializer valida faixas (5..400, etc.).

## 11. TDD estrito — casos obrigatórios

01° Distribuição normal (soma == prazo) em `uteis` e `corridos`.
02° **Capped**: soma dos % estoura o prazo → reduz + flag `capped`.
03° **Re-update fds**: aplica fins de semana; pede mais do que cabe → aviso.
04° **Remarcação** de cada reunião (val, apr, grad) isolada + as 3 juntas, em `uteis` e `corridos`.
05° Feriados: Páscoa/Carnaval/Corpus corretos; toggles on/off; 9 de julho (SP).
06° Datas batem com o simulador v34 (cenários de baseline conhecidos).

## 12. Mini-UI de validação

Página `/tools/cronograma/` (Next.js) — formulário dos parâmetros + render do `GamePlan`
(barra de fases, sub-passos datados, feriados, avisos). Sem ligação com Project. Serve pra você
validar visualmente em localhost antes do commit; a UI completa ligada ao Project vem na fase de
front-end.
