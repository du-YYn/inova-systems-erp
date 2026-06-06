# Workflow de Execução — Correções de Segurança Residuais

**Contexto:** Após auditoria 2026-06-05 e merge dos PRs #22, #23, #24, #26 em produção, este documento define o processo formal para fechar os findings restantes (#25, #27 + hotfix CSP) **sem regressões** e **sem refazer trabalho**.

## Princípios operacionais (não negociáveis)

1. **Reality-first**: toda mudança é validada contra o código real (grep models.py) antes do CI, não só contra a auditoria.
2. **Atomicidade**: cada PR toca um conceito de segurança, é independentemente revertível, não cria dependência cruzada.
3. **DoD inclui prod**: "Done" = CI verde + CD success + smoke test + review agent PASS + manual user check + decision log atualizado.
4. **Decision log**: cada configuração em prod é documentada em `docs/security-decisions.md` com trade-offs explicitados.
5. **User é gate**: Claude nunca prossegue para próxima fase sem "OK explícito" do usuário.

## Arquitetura do workflow

```
┌─────────────────────────────────────────────────────────────────┐
│  FASE N                                                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ① Pre-flight checks      (Claude executa, gera relatório)       │
│      └─ Schema check (grep modelos/campos)                       │
│      └─ Conflict check (git merge --no-commit)                   │
│      └─ Coordination check (backend/frontend acoplados?)         │
│      └─ Migration safety (defaults + reversibilidade)            │
│                                                                  │
│  ② Implementation         (Claude codifica)                      │
│                                                                  │
│  ③ Push + CI              (GitHub Actions automatizado)          │
│      └─ pytest 70%+ cov                                          │
│      └─ ruff + bandit + tsc + eslint                            │
│                                                                  │
│  ④ Merge → CD             (concurrency-protected)                │
│      └─ Smoke test backend (90s)                                 │
│      └─ Smoke test frontend (60s)                                │
│      └─ Auto-rollback se falhar                                  │
│                                                                  │
│  ⑤ Review Agent           (Claude dispatcha agente independente) │
│      └─ Lê o diff mergeado                                       │
│      └─ Faz HTTP probes em erp.inovasystemssolutions.com         │
│      └─ Verifica headers, cookies, endpoints                     │
│      └─ Compara com spec da fase                                 │
│      └─ Reporta PASS/FAIL com evidência                          │
│                                                                  │
│  ⑥ Manual smoke test      (Você executa checklist)               │
│                                                                  │
│  ⑦ Gate de aprovação      (Você decide)                          │
│      ├─ ✅ "Fase N OK, segue"  → próxima fase                    │
│      ├─ 🟡 "Fase N investigar" → Claude analisa, ajusta          │
│      └─ 🔴 "Fase N rollback"   → git revert + push               │
│                                                                  │
│  ⑧ Decision log update    (Claude documenta)                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Fases planejadas

### Fase 1.5 — Hotfix CSP `style-src`

**Problema:** CSP atual `style-src 'self' 'nonce-XXX'` bloqueia inline `style="..."` em componentes React (24 violations no console).

**Mudança atômica:** 1 linha em `frontend/middleware.ts`:
- DE: `style-src 'self' 'nonce-${nonce}'`
- PARA: `style-src 'self' 'unsafe-inline'`

**Trade-off:** CSS injection ≠ XSS (não executa código). `script-src` mantém strict (gold standard).

**Review agent valida:**
- Console errors = 0 após reload
- `script-src` ainda tem `nonce-XXX` + `strict-dynamic`, SEM `unsafe-inline`
- `style-src` agora tem `unsafe-inline`
- HSTS / COOP / CORP intactos
- Páginas chave renderizam: /login, /dashboard, /crm/funil

**Tempo:** 15min

### Fase 2 — Auth hardening (#25)

**Mudanças:**
- Migration `0008_user_security_fields` (4 colunas com default)
- Lockout exponencial (5 falhas → 15/30/60/120/240/480 min)
- Login timing-safe
- temp_2fa_token invalida após 5 falhas
- ChangePassword exige TOTP se 2FA + throttle 5/h
- LogoutView cookie-only
- PasswordReset throttle composto

**Pre-flight obrigatório:**
- `grep -rn 'failed_attempts\|locked_until' backend/accounts/` → confirma model.py atualizado
- Migration tem `default=0`, `default=None` (zero-downtime)
- `test_auth.py` usa senhas que passam no `ComplexityValidator` (já corrigido em fix anterior)

**Degradação aceita (documentada):**
- Usuários com 2FA ativo não conseguem mudar senha pela UI até frontend de profile ser atualizado
- Workaround: usar "esqueci senha" via email

**Review agent valida:**
- Migration aplicada (via endpoint admin ou inspeção)
- POST /accounts/login/ com senha errada 5x → 6ª retorna 423 (Locked) ou 401 com info de bloqueio
- POST /accounts/logout/ com body mas sem cookie → 401
- Throttle headers presentes em `/accounts/password-reset/`

**Tempo:** 30min

### Fase 3a — Residuais baixo risco (split de #27)

**Mudanças backwards-compatible (sem coordenação frontend):**
- `ComplexityValidator` (min 12 + maiúscula + dígito + símbolo)
- `max_page_size 500→100`
- `system-info` esconde version para não-admin
- `reset_data` → 404 em prod
- `ProjectEnvironment.deploy` admin/manager + audit
- `ProjectComment` delete/update restrito ao autor
- nginx `client_max_body_size 1m + 12m em uploads`
- Frontend `autocomplete` em login/reset
- Frontend forgot-password 429 vs 5xx

**Pre-flight:**
- `ComplexityValidator` só roda em ChangePassword/Reset (senhas existentes preservadas)
- Pagination cap: frontend usa default 20, sem impacto

**Review agent valida:**
- POST /accounts/password-reset/confirm/ com senha `senha1234` → 400
- POST /accounts/password-reset/confirm/ com senha `SenhaForte123!` → 200
- GET /sales/customers/?page_size=500 → response com `count` ≤ 100
- GET /core/info/ como viewer → sem `version`
- GET /core/info/ como admin → com `version`
- POST /core/reset-data/ em prod → 404

**Tempo:** 25min

### Fase 3b — Coordenação backend/frontend (split de #27)

**Mudanças com coordenação ou decisão de negócio:**
- `LoginResponseSerializer` minimal (id/username/role apenas)
- `ProspectViewSet` operator filter (só vê assigned_to=self OR created_by=self)
- ALLOWED_HOSTS sem localhost em prod (JÁ revertido — não aplicar)

**Pre-flight obrigatório:**
- Topbar do dashboard usa `useCurrentUser` (#26) — não depende de `first_name` no login response
- Decisão de negócio confirmada: "operators veem só prospects deles"
- ALLOWED_HOSTS: PR original revertido — não tocar

**Review agent valida:**
- POST /accounts/login/ → response body só tem `id`, `username`, `role`
- GET /accounts/me/ (logado) → retorna PII completa (email/phone/etc.)
- Login como operator → GET /sales/prospects/ retorna apenas prospects com assigned_to=user OR created_by=user
- Login como admin → GET /sales/prospects/ retorna todos
- Topbar do dashboard renderiza nome do usuário (via /me/, não login response)

**Tempo:** 25min

### Fase 4 — Guardrails permanentes

**Artefatos criados:**
- `docs/security-decisions.md` — decision log completo
- `docs/cd-runbook.md` — playbook de troubleshooting de deploy
- `.github/PULL_REQUEST_TEMPLATE.md` — checklist obrigatório
- `cd.yml` enhanced — warning de untracked files no servidor

**Sem mudanças em prod.** Só documentação e processo.

**Tempo:** 30min

## Agente Revisor de Segurança

### Identidade do agente

**Nome:** Security Phase Reviewer  
**Tipo:** general-purpose com prompt especializado  
**Permissões:** READ-ONLY (não pode editar arquivos, não pode mergear)  
**Quando invocar:** após CD success de cada fase, ANTES de Claude pedir aprovação manual

### Inputs do agente (por fase)

```yaml
fase_id: "1.5"  # "1.5", "2", "3a", "3b"
commit_sha: "abc123..."  # SHA do merge commit
spec_resumida: |
  Mudança: alterar style-src no middleware.ts
  Spec esperada: style-src 'self' 'unsafe-inline'
  Não tocar: script-src deve manter 'nonce-XXX' 'strict-dynamic'
  Endpoints a validar: /login, /dashboard
validacoes_http:
  - url: "https://erp.inovasystemssolutions.com/login"
    headers_esperados:
      Content-Security-Policy:
        contém: ["script-src", "'nonce-", "'strict-dynamic'", "style-src", "'unsafe-inline'"]
        nao_contém_em_script_src: ["'unsafe-inline'"]
      Strict-Transport-Security:
        contém: ["max-age=63072000", "includeSubDomains"]
arquivos_modificados:
  - frontend/middleware.ts
```

### Outputs do agente

```yaml
status: PASS | FAIL | WARN
diff_analise:
  - arquivo: frontend/middleware.ts
    mudancas_esperadas: 1
    mudancas_observadas: 1
    detalhe: "style-src corretamente alterado"
http_probes:
  - url: /login
    csp_script_src: PASS
    csp_style_src: PASS
    hsts: PASS
console_violations_remanescentes: 0  # baseline anterior 24
seguranca_score:
  script_xss_protection: PRESERVADO
  hsts: PRESERVADO
  cors_strict: PRESERVADO
  novo_attack_surface: NENHUM
regressoes_detectadas: []
recomendacoes:
  - "Adicionar entry em decision log: 'style-src unsafe-inline aceito por React'"
```

### Estrutura do prompt do agente

```
Você é o Security Phase Reviewer. Sua função é validar de forma INDEPENDENTE
se uma fase de correção de segurança foi aplicada corretamente.

CONTEXTO:
- Repo: du-YYn/inova-systems-erp
- Sistema em prod: https://erp.inovasystemssolutions.com
- Fase atual: {fase_id}
- Commit merge: {commit_sha}
- Spec da mudança: {spec_resumida}

TAREFAS:
1. Leia o diff do commit {commit_sha} (gh api repos/.../commits/{sha})
2. Compare o diff com a spec — confirme que cada mudança esperada está presente
3. Faça HTTP probes nos endpoints listados em {validacoes_http}:
   - curl -sI https://erp.inovasystemssolutions.com/{path}
   - extraia headers relevantes
   - verifique cookies via curl -b cookies.txt -c cookies.txt
4. Verifique que mudanças NÃO esperadas não aconteceram (regressão):
   - Endpoints que devem continuar funcionando
   - Cookies que devem manter flags
   - Outras headers de segurança que devem permanecer
5. Procure por:
   - Secrets hardcoded no diff
   - Endpoints novos sem permission_classes
   - Migrations sem default values
   - Logs com PII

NÃO FAÇA:
- Não tente consertar nada (read-only)
- Não modifique arquivos
- Não pushe nada para git
- Não execute migrations

OUTPUT OBRIGATÓRIO (YAML):
status: PASS | FAIL | WARN
diff_analise:
  ...
http_probes:
  ...
seguranca_score:
  ...
regressoes_detectadas: []
recomendacoes:
  ...
evidencia_bruta:  # logs/headers reais que coletei
  ...

Se status=FAIL, listar exatamente o que está errado para Claude principal
decidir entre rollback ou fix-forward.

Reporte em até 600 palavras.
```

### Invocação no fluxo

```python
# Pseudocódigo do que Claude principal faz
def execute_phase(phase_id, pr_number):
    # ① Pre-flight
    preflight = run_preflight_checks(phase_id)
    if not preflight.ok:
        return abort(preflight.reason)

    # ② Implementation
    implement_changes(phase_id)

    # ③ Push + CI
    push_and_wait_ci(pr_number)

    # ④ Merge → CD
    merge_pr(pr_number)
    cd_result = wait_cd_complete(pr_number)
    if not cd_result.ok:
        return rollback_automatic()  # CD já faz

    # ⑤ Review Agent (NOVO)
    agent_report = dispatch_review_agent(
        phase_id=phase_id,
        commit_sha=cd_result.commit_sha,
        spec=PHASE_SPECS[phase_id],
        validations=PHASE_VALIDATIONS[phase_id],
    )

    if agent_report.status == "FAIL":
        report_to_user("Review agent reprovou: ...")
        return wait_user_decision()

    # ⑥ + ⑦ Manual + Gate (user)
    report_to_user(
        cd_result=cd_result,
        agent_report=agent_report,
        manual_checklist=PHASE_MANUAL[phase_id],
    )
    user_decision = wait_user_input()

    # ⑧ Decision log
    if user_decision == "OK":
        update_decision_log(phase_id)
        return next_phase()
    elif user_decision == "ROLLBACK":
        execute_revert(cd_result.commit_sha)
```

## Decision log (a manter atualizado)

Cada fase concluída adiciona entry em `docs/security-decisions.md`:

```markdown
## 2026-06-05 — Fase 1.5: CSP style-src

**Decisão:** Permitir `'unsafe-inline'` em `style-src` (não em `script-src`).

**Trade-off aceito:**
- CSS injection é possível (mudança visual, exfil lenta via seletores)
- CSS NÃO executa código JavaScript
- `script-src` mantém strict (`nonce-XXX 'strict-dynamic'`) — XSS de script bloqueado

**Por que essa decisão:**
- React/Next obrigatoriamente gera `style="..."` em componentes
- OWASP CSP cheatsheet aceita o trade-off
- Sem isso, 24 inline styles legítimos quebravam UI

**Quando revisitar:**
- Se migrarmos para zero-runtime CSS (vanilla-extract, linaria)
- Se OWASP recomendar nova abordagem

**Validado por:**
- Review agent (PASS)
- Manual: ___
```

## Gates e responsabilidades

| Atividade | Quem | Quando |
|---|---|---|
| Pre-flight checks | Claude | Antes de implementar |
| Implementation | Claude | Após pre-flight PASS |
| CI validation | GitHub Actions | Após push |
| Merge + CD | Claude (automatizado) | Após CI verde |
| Review agent dispatch | Claude (principal) | Após CD success |
| Manual smoke test | Você | Após review agent PASS |
| Gate de aprovação | Você | Após manual smoke OK |
| Decision log update | Claude | Após gate aprovado |
| Rollback (se necessário) | Claude | Quando você diz "rollback" |

## Critérios objetivos de PASS/FAIL/WARN

**PASS** (autorizado a pedir aprovação ao usuário):
- Diff bate 100% com spec
- HTTP probes todos como esperado
- 0 regressões detectadas
- Console errors = baseline ou menor

**WARN** (pode prosseguir mas com nota):
- Diff bate com spec mas com pequenos extras inofensivos
- HTTP probes OK mas com headers extras não documentados
- Console com baseline mantida (não diminuiu)

**FAIL** (Claude NÃO pede aprovação — investiga primeiro):
- Diff diverge da spec
- HTTP probes falham
- Regressão detectada (cookie perdeu flag, header sumiu, etc.)
- Console aumentou erros

## Estado entre conversas

Este workflow funciona em múltiplas sessões. Para retomar:

```bash
gh pr list --state open --search "label:security"  # PRs abertos da auditoria
cat docs/security-decisions.md                     # decisões já em prod
gh run list --workflow=cd.yml --limit 5            # últimos deploys
```

Memory `project_inova_erp_security_workflow.md` é atualizada a cada fase.
