# Parte 10 · Produção — Estrutura do CRM (3 telas) + card (etapas → ações)

> Lapidado do processo (John, 2026-06-12/13). Só o que o Dev executa (checklist). O card do
> cliente contém TODAS as etapas; conforme o Dev dá check, o card avança sozinho. Cada ação é
> datada pelo motor (substeps.py) a partir do Dia 0. 🔒 trava · 📅 reunião · ⚡ handshake Jurídico
> · ⛏ a definir.

O CRM de Produção tem **2 telas + 1 ação global**:
- **A) Kanban principal** — projetos em execução (13 etapas)
- **C) Tela "Projetos Recorrentes"** — operação recorrente + coluna "Encerrados" (handshake Jurídico) — *a detalhar depois*
- **Botão "Solicitar Mudança"** — NÃO é tela/coluna; é um botão que abre a solicitação (Aditivo) → Jurídico (ver seção B)

---

## A) KANBAN PRINCIPAL — projetos em execução

### 1 · Agendar ⚓ (crava o Dia 0)
- [ ] Agendar a reunião de Onboarding junto ao cliente

### 2 · Planejamento
- [ ] Revisar material do comercial + a proposta (escopo e prazo)
- [ ] Montar o Game Plan visual
- [ ] Preparar o roteiro de mapeamento

### 3 · Onboarding 📅 (Dia 0)
- [ ] Apresentar o Game Plan e confirmar prazo + marcos
- [ ] Aprofundar o processo (mapeamento completo)
- [ ] Validar e refinar o escopo
- [ ] Alinhar o modelo de entrega
- [ ] Mapear dependências do cliente
- [ ] Fechamento: agendar a reunião de Documentação

### 4 · Documentação  *(agora inclui a reunião de apresentação da arquitetura)*
- [ ] Revisar o material da onboarding
- [ ] Preencher a documentação seção por seção (12 seções)
- [ ] Definir prioridades e fases de entrega
- [ ] Gerar design e wireframes no branding
- [ ] Revisão interna (escopo fechado)
- [ ] Preparar a apresentação da Validação
- [ ] Agendar a reunião de apresentação da arquitetura 📅
- [ ] Apresentar a doc seção por seção
- [ ] Validar escopo e exclusões com o cliente
- [ ] Validar design, fluxos, prioridades e fases
- [ ] Explicar o processo de mudança

### 5 · Validação da doc 📅 ⚡🔒 (handshake Jurídico)
- [ ] Ajustar a arquitetura se necessário
- [ ] **Enviar para o Jurídico** → ⚡ abre a modalidade **Validação** no Jurídico
> 🔒 O card só avança quando o Jurídico assinar (vira "Aprovado para Desenvolvimento").

### 6 · Desenvolvimento 🔒 (gate Regra de Ouro)
- [ ] **Aprovado para Desenvolvimento** — ⚡ automático quando o Jurídico libera (destrava a etapa)
- [ ] Quebrar a doc em fases e tarefas
- [ ] Desenvolver fase por fase
- [ ] Acompanhar o progresso (doc + cronograma)
- [ ] Pedido fora do escopo → **processo de mudança** ⚡ (abre Solicitação de Mudança — board B)
- [ ] Concluir cada fase → encaminhar pra Auditoria
- [ ] ∥ Atualização semanal (resumo + pendências, dia fixo)
> 🔒 Gate pra entrar: contrato assinado + entrada paga + baseline assinada pelo Jurídico.

### 7 · Auditoria interna (sem cliente)
- [ ] Conferir o desenvolvido contra a doc, item por item
- [ ] Testar fluxos e casos de uso críticos
- [ ] Testar regras, exceções, permissões e integrações
- [ ] Verificar segurança, LGPD e performance
- [ ] Registrar e corrigir bugs
- [ ] Agendar a reunião de apresentação

### 8 · Reunião de Apresentação 📅
- [ ] Apresentar o sistema e demonstrar as funcionalidades
- [ ] Liberar o acesso (link admin único)
- [ ] Alinhar a janela de teste

### 9 · Janela de teste  (coleta de dados / apontamentos)
- [ ] Coletar os apontamentos do cliente durante o teste — **fotos, vídeos, áudios e texto**
      explicando o que precisa ser ajustado
- [ ] Organizar os apontamentos pra o Re-Update
> O cliente usa o sistema na janela e vai mandando o que precisa ajustar (multimídia). O Dev
> coleta tudo; ao fim da janela, executa o Re-Update (Etapa 10) em lote.

### 10 · Re-Update (sem reunião, em lote)
- [ ] Revisar e analisar os apontamentos do cliente
- [ ] Fazer os ajustes em lote (dentro do escopo)
- [ ] Atualizar e devolver pro cliente
- [ ] Repetir o ciclo até o cliente aprovar

### 11 · Homologação  *(= entrega oficial — projeto OU automação)*
- [ ] Taguear a versão do código (release)
- [ ] Guardar a doc aprovada como baseline
- [ ] Registrar data e ambiente do deploy
- [ ] Agendar a reunião com o cliente 📅
- [ ] **PROJETO → Reunião de Entrega:** passar a estrutura ao cliente — acessos a servidores,
      domínios e código-fonte — e explicar como manter a estrutura de pé
- [ ] **AUTOMAÇÃO/IA → Reunião de Implementação:** realizar a implementação oficial da automação
> A entrega tem 2 caminhos por tipo: software (Reunião de Entrega / handover) ou automação-IA
> (Reunião de Implementação).

### 12 · Concluído  *(coluna de controle — renomeada de "Entregue")*
- Mantém o card do cliente pra controlar o que foi concluído (projeto X já entregue). Sem ações
  do Dev — é o "arquivo" dos projetos **fechados** concluídos.

### 13 · Implementado  *(coluna de controle)*
- Mesma ideia: os clientes cujo projeto já foi **implementado** (automação/recorrente). Alimenta
  a tela de Projetos Recorrentes (C).

---

## B) "Solicitar Mudança" — BOTÃO (não é tela/coluna) ⬌ Jurídico
> Decisão de John: não é etapa nem coluna; é um **botão** que abre a solicitação. Estrutura
> proposta (a validar):

**1. Botão "Solicitar Mudança"** — no card do cliente (cliente já selecionado) + atalho global
   (onde seleciona o cliente).

**2. Popup da solicitação** → preenche o **documento** de mudança:
   - descrição da mudança · horas estimadas · valor (impact_value) · anexos.

**3. Envia → Jurídico** → cria a modalidade **Aditivo** (LegalCase aditivo), vinculado ao projeto.
   O Jurídico elabora o aditivo e manda pro cliente assinar.

**4. Volta pro Produção** (a "saída"): no card do cliente há uma **aba/lista "Solicitações de
   Mudança"** que mostra cada solicitação e seu status:
   - ⏳ **Em análise** (no Jurídico) → ✅ **Aprovada** / ❌ **Recusada**
   - O card do cliente NÃO muda de coluna — ele continua em Desenvolvimento; a solicitação é um
     sub-item do card.

**5. Quando o Jurídico assina (Aprovada)** → ⚡:
   - notificação/badge no card,
   - a mudança vira uma **nova fase** no Desenvolvimento (libera o trabalho extra),
   - ⚡ **Financeiro** cobra o valor (impact_value).

**6. Recusada** → marca recusada na lista; o projeto segue sem a mudança.

```
[botão Solicitar Mudança] → popup (documento) → ⚡ Jurídico (Aditivo) → cliente assina/recusa
        │                                                                      │  ⚡ volta
        └── no card: aba "Solicitações" lista o status ◄────────────────────── ┘
            Aprovada → nova fase no Desenvolvimento + Financeiro cobra
            Recusada → segue sem a mudança
```

## C) TELA "Projetos Recorrentes" ⬌ Jurídico
> Os projetos que entraram em recorrência (Suporte Básico / Operação Contínua). Liga com o
> Suporte (Parte 5) e recebe o Encerramento do Jurídico.
```
... colunas da operação recorrente (⛏ a definir — Suporte Básico / Operação Contínua) ...
        └──►  Encerrados   ⬅⚡ recebe o Encerramento do Jurídico (manual no Jurídico → seleciona o cliente)
                              + instruções de offboarding (como o Dev finaliza)
```

---

## Pontos ainda a fechar
1. ✅ Janela de teste — coleta de apontamentos multimídia (resolvido).
2. ✅ Homologação — 2 caminhos (Reunião de Entrega / Reunião de Implementação) (resolvido).
3. ✅ Naming — "Entregue" → "Concluído" (resolvido).
4. 🟡 **Solicitar Mudança** — estrutura proposta (botão + aba no card); aguardando validação.
5. ⛏ **Tela Recorrentes (C):** colunas da operação recorrente — John: "falamos depois".
