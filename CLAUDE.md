# Inova Systems ERP

ERP completo para a Inova Systems com CRM, vendas, projetos, financeiro, suporte e notificações.

## Stack

- **Backend**: Python 3.11 + Django 4.2 (LTS) + DRF + PostgreSQL 15 + Redis 7 + Celery 5.4
- **Frontend**: Next.js 14 (App Router) + React 18 + TypeScript 5.3 + Tailwind CSS 3.4
- **Auth**: JWT via cookies httpOnly (SimpleJWT) + 2FA TOTP (pyotp)
- **Infra**: Docker Compose (7 serviços) + Nginx + GitHub Actions CI/CD
- **Monitoramento**: Sentry (opcional)

## Comandos

```bash
# Subir ambiente completo
docker compose up -d --build

# Backend local (sem Docker)
cd backend && pip install -r requirements.txt
python manage.py migrate
python manage.py runserver

# Frontend local (sem Docker)
cd frontend && npm install
npm run dev

# Testes backend (requer PostgreSQL e Redis rodando)
cd backend && pytest --tb=short --cov=. --cov-fail-under=70 -q

# Frontend checks
cd frontend && npx tsc --noEmit && npx next lint && npm run build

# Celery worker + beat
celery -A config worker --loglevel=info --concurrency=2
celery -A config beat --loglevel=info --scheduler django_celery_beat.schedulers:DatabaseScheduler
```

## Estrutura do Projeto

```
├── backend/
│   ├── config/          # settings.py, urls.py, celery.py, wsgi.py
│   ├── accounts/        # User (roles: admin/manager/operator/viewer), 2FA, EmployeeProfile, UserSkill, Absence
│   ├── sales/           # Customer, Prospect (pipeline 13 estágios), Proposal, Contract, ProspectActivity, WinLossReason
│   ├── projects/        # Project, ProjectPhase, Milestone, Sprint, ProjectTask, TimeEntry, ProjectComment, ChangeRequest, ProjectTemplate
│   ├── finance/         # BankAccount, Category (hierárquica), Invoice (NF-e), Transaction, CostCenter, Budget
│   ├── support/         # SupportTicket (SLA), TicketComment, TicketAttachment, KnowledgeBaseArticle, SLAPolicy, SupportCategory
│   ├── notifications/   # Notification (15 tipos, polimórfica via object_type/object_id)
│   └── core/            # audit.py, validators.py, health check
├── frontend/
│   ├── app/
│   │   ├── (dashboard)/ # layout com sidebar + topbar
│   │   │   ├── dashboard/    # KPIs, gráficos, analytics
│   │   │   ├── crm/          # 5 tabs: Funil (Kanban DnD), Propostas, Contratos, Contas, Atividades
│   │   │   ├── projects/     # Kanban por status
│   │   │   ├── finance/      # Invoices, DRE, aging
│   │   │   ├── usuarios/     # CRUD com RBAC
│   │   │   ├── clientes/     # Gestão de clientes
│   │   │   ├── contratos/    # Ciclo de vida de contratos
│   │   │   ├── suporte/      # Tickets com SLA
│   │   │   ├── relatorios/   # Relatórios
│   │   │   ├── notificacoes/ # Central de notificações
│   │   │   └── perfil/       # Perfil do usuário
│   │   ├── login/            # Login + 2FA
│   │   ├── forgot-password/
│   │   └── reset-password/
│   ├── components/ui/   # 13 componentes: Button, FormField, Badge, Pagination, EmptyState, ConfirmDialog, FocusTrap, Skeleton, ThemeToggle, DemoContext, DemoToggle, Sensitive, Toast
│   └── lib/             # api.ts (fetch client), hooks.ts, validators.ts (CPF/CNPJ)
├── nginx/               # nginx.conf.template (SSL, rate limiting, routing)
├── scripts/             # backup_db.sh (backup diário PostgreSQL, rotação 7 dias)
├── .github/workflows/   # ci.yml (pytest + security scan + frontend build), cd.yml (deploy SSH)
└── docker-compose.yml   # postgres, redis, backend, celery worker, celery beat, frontend, db-backup
```

## Backend - Padrões e Convenções

### Django Apps
- Cada app tem: `models.py`, `serializers.py`, `views.py`, `urls.py`, `admin.py`
- Accounts tem serializers separados: `serializers.py` (auth) e `serializers_employee.py` (perfil)
- ViewSets usam `ModelViewSet` com `@action` decorators para endpoints customizados
- `perform_create()` seta `created_by=request.user` automaticamente
- Queries otimizadas com `select_related()` e `prefetch_related()`

### Permissões (RBAC)
- `IsAuthenticated` — padrão
- `IsAdminOrManagerOrOperator` — CRUD em resources
- `IsAdmin` — operações destrutivas
- Viewers têm acesso somente leitura

### Autenticação
- JWT em cookies httpOnly (`access_token`, `refresh_token`, `inova_session`)
- Access: 60min, Refresh: 7 dias (rotação + blacklist)
- 2FA: TOTP com QR code, temp token de 10min
- Rate limiting: login 5/min, password reset 3/h, 2FA 10/h

### Signals e Tasks
- `finance/signals.py`: recalcula Budget.actual ao salvar/deletar Transaction (via Celery)
- Celery Beat (4 tasks): check_contract_renewals (24h), check_task_deadlines (24h), check_invoice_overdue (24h), check_sla_warnings (1h)
- Tasks assíncronas: send_password_reset_email, send_generic_email, recalculate_budget_actuals

### Auditoria
- `core/audit.py` → `log_audit()` registra operações sensíveis (login, logout, 2FA, password change, deletions)

### Testes
- Framework: pytest + pytest-django
- Cobertura mínima: 70%
- Fixtures em `conftest.py` — usa `locmem` cache para evitar throttle cross-test
- Padrão: classes `Test*` com `@pytest.mark.django_db`, fixtures `api_client`, `admin_user`, `regular_user`

## Frontend - Padrões e Convenções

### API Client
- `lib/api.ts`: cliente fetch customizado (não axios)
- Métodos: `api.get<T>()`, `api.post<T>()`, `api.patch<T>()`, `api.put<T>()`, `api.delete<T>()`
- Credentials: `include` (cookies automáticos)
- Error: classe `ApiError` com status e data

### State Management
- Context API + localStorage (sem Redux/Zustand)
- DemoContext: modo demonstração (blur em dados sensíveis)
- ToastContext: notificações toast

### Formulários
- react-hook-form + zod para validação
- `FormField` component wrapper com label e erro
- Validadores BR em `lib/validators.ts`: CPF, CNPJ, telefone, moeda

### Design System
- **Cores primárias**: slate-900/800 (sidebar), `#A6864A` (dourado accent)
- **Dark mode**: `darkMode: 'class'` no Tailwind, toggle via localStorage `theme`
- **Tipografia**: Inter (default), JetBrains Mono (code)
- **Sombras**: tokens CSS customizados (card, card-hover, modal, topbar, sidebar)
- **Animações**: shimmer, modal-in, fade-in, stagger-in, shake, float
- **Raio de borda**: sm(4px), md(8px), lg(12px), xl(16px)

### Features Especiais
- **Demo Mode**: componente `<Sensitive>` aplica blur 5px em dados sensíveis
- **Drag & Drop**: @dnd-kit para Kanban (CRM Funil + Projects)
- **Notificações**: polling 30s para contagem, toast para feedback
- **Acessibilidade**: FocusTrap, ARIA labels, skip-to-content, foco visível

### Middleware (Next.js)
- Verifica cookie `inova_session` em todas as rotas
- Rotas públicas: `/login`, `/reset-password`, `/forgot-password`
- Redirect para `/login?redirect={pathname}` se não autenticado

## API Endpoints

Base: `/api/v1/`

| Prefixo | App | Endpoints notáveis |
|---------|-----|-------------------|
| `/accounts/` | Auth | login, logout, register, 2fa/setup, 2fa/verify, password-reset, me |
| `/sales/` | CRM | customers, prospects (qualify, schedule_meeting, pipeline), proposals (pdf), contracts |
| `/projects/` | Projetos | projects (dashboard, profitability, my_tasks), tasks, time-entries, sprints, milestones |
| `/finance/` | Financeiro | invoices (mark_paid, aging), transactions, budgets, bank-accounts, categories, dashboard, dre |
| `/support/` | Suporte | tickets (assign, resolve, close, dashboard), comments, kb-articles (publish, helpful) |
| `/notifications/` | Notificações | notifications (mark_read, mark_all_read) |
| `/core/` | Core | health, system-info |

Documentação: `/api/docs/` (Swagger) e `/api/redoc/` (somente dev)

## Infraestrutura

### Docker Compose (7 serviços)
- `postgres` (15) — health check com pg_isready
- `redis` (7-alpine) — cache + broker Celery
- `backend` — Gunicorn 4 workers, roda migrate + collectstatic no startup
- `celery-worker` — concurrency=2
- `celery-beat` — DatabaseScheduler
- `frontend` — standalone Next.js build
- `db-backup` — backup diário com rotação 7 dias

### CI/CD (GitHub Actions)
- **CI** (`ci.yml`): pytest (70% cov) + pip-audit + bandit + ruff + npm audit + tsc + eslint + next build + trufflehog
- **CD** (`cd.yml`): deploy SSH para `/opt/inova-systems-erp`, docker compose rebuild, smoke test com rollback automático

### Nginx
- SSL/TLS 1.2+ com Let's Encrypt
- Rate limiting: API 30/s, login 5/min, uploads 10/min
- HSTS, X-Frame-Options, CSP headers
- Gzip, cache de estáticos (1 ano)

### Variáveis de Ambiente
- Template em `.env.example` — nunca commitar `.env`
- Principais: `DJANGO_SECRET_KEY`, `DB_*`, `REDIS_*`, `NEXT_PUBLIC_API_URL`, `JWT_COOKIE_SECURE`
- Opcionais: `SENTRY_DSN`, `N8N_API_KEY`, `WEBSITE_API_KEY`

## Regras para Contribuição

- Idioma do código: inglês (nomes de variáveis, classes, funções). Idioma da UI: português-BR
- Sempre rodar `pytest` antes de commitar mudanças no backend
- Sempre rodar `npx tsc --noEmit` antes de commitar mudanças no frontend
- Migrations devem ser criadas e commitadas junto com mudanças em models
- Manter cobertura de testes >= 70%
- Não commitar `.env`, credenciais ou secrets
- Serializer fields com dados auto-gerados ou de sistema devem ser `read_only`
- Usar `perform_create()` para setar `created_by` nos ViewSets
- Componentes UI devem suportar dark mode (`dark:` classes do Tailwind)
- Dados sensíveis na UI devem ser envolvidos com `<Sensitive>`
