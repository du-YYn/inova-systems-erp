# Atualização do ERP · Processo Inova v32

> Documento de arquitetura-alvo. Construído **por partes** (setor a setor). Cada parte é
> validada com o time antes de virar código. Quando todos os setores estiverem
> arquitetados, segue a arquitetura de front-end e só então a implementação.

## Contexto

- ERP em **produção com dados reais** (`erp.inovasystemssolutions.com`). Migrations **aditivas**;
  nunca deletar valores de enum com dados (deprecar no lugar).
- Stack: Django 4.2 + DRF + PostgreSQL + Redis + Celery · Next.js 14 frontend.
- Fonte da verdade do processo: cockpit v32 (mapa de raias + simulador de cronograma).
- Regra de escrita: sem travessão; numeração `01°`, `02°`.

## Setores do processo (raias)

1. **CRM Comercial** — do lead ao fechamento e coleta de dados → [01-comercial.md](01-comercial.md) ✅ validado
2. **CRM Jurídico** — 4 processos (contrato, validação doc, aditivo, encerramento), assinatura via Autentique → [02-juridico.md](02-juridico.md) ✅ validado
3. **CRM Financeiro** — 5 grupos, reaproveita finance/ + automações (pré-cadastro, entrada→produção, régua) → [03-financeiro.md](03-financeiro.md) ✅ validado
4. **CRM de Produção** — Etapas 3-10, etapa_atual realinhado, Dia 0, entidades novas → [04-producao.md](04-producao.md) ✅ validado
5. **CRM de Suporte** — chamados realinhados, conclusao, PedidoUpdate, auto-fechar → [05-suporte.md](05-suporte.md) ✅ validado
6. **Diretoria** — DirectorEscalation + DirectoryMeeting (app diretoria/) → [06-diretoria.md](06-diretoria.md) ✅ validado
7. **Motor de Cronograma** — função pura (scheduling/), endpoint, TDD estrito, mini-UI → [07-cronograma.md](07-cronograma.md) ✅ validado

## Arquitetura de desenvolvimento

O plano de implementação (fases F0 a F8, migrations, TDD do motor, segurança, pipeline) está em
[08-arquitetura-desenvolvimento.md](08-arquitetura-desenvolvimento.md) · ⏳ aguardando validação.

## Status de validação

| Setor | Estado | Data |
|-------|--------|------|
| Comercial | ✅ Validado | 2026-06-09 |
| Jurídico | ✅ Validado | 2026-06-09 |
| Financeiro | ✅ Validado | 2026-06-09 |
| Produção | ✅ Validado | 2026-06-10 |
| Suporte | ✅ Validado | 2026-06-10 |
| Diretoria | ✅ Validado | 2026-06-10 |
| Motor de Cronograma | ✅ Validado | 2026-06-10 |
