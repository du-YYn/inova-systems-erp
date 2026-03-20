# Inova Systems Solutions ERP

Sistema de Gestão Empresarial (ERP) moderno construído com Django REST Framework e Next.js.

## Stack Tecnológica

- **Backend**: Python 3.11 + Django 4.2 + Django REST Framework
- **Frontend**: Next.js 14 + React + TypeScript + Tailwind CSS
- **Database**: PostgreSQL 15
- **Cache/Tarefas**: Redis 7
- **Autenticação**: JWT com suporte a 2FA (TOTP)

## Requisitos

- Docker e Docker Compose
- 4GB RAM mínimo
- 20GB disco

## Configuração Local

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/inova-systems-erp.git
cd inova-systems-erp
```

### 2. Configure as variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
# Banco de Dados
DB_NAME=inova_erp
DB_USER=inova_user
DB_PASSWORD=sua_senha_segura_aqui

# Django
DJANGO_SECRET_KEY=sua_chave_secreta_aqui
DEBUG=true
ALLOWED_HOSTS=localhost,127.0.0.1

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

### 3. Inicie os containers

```bash
docker-compose up -d
```

### 4. Acesse os serviços

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **Admin Django**: http://localhost:8000/admin/

### 5. Criar superusuário

```bash
docker-compose exec backend python manage.py createsuperuser
```

## Estrutura do Projeto

```
inova-systems-erp/
├── backend/               # API Django REST
│   ├── accounts/         # Autenticação e usuários
│   ├── sales/           # Módulo de Vendas
│   ├── projects/        # Módulo de Projetos
│   └── core/            # Configurações e utilities
├── frontend/             # Aplicação Next.js
│   ├── app/             # Páginas e rotas
│   ├── components/      # Componentes React
│   └── lib/             # Utilities e API client
└── docker-compose.yml   # Orquestração Docker
```

## Funcionalidades

### Módulo de Vendas
- Cadastro de clientes (PF/PJ)
- Oportunidades de venda
- Orçamentos
- Pedidos
- Dashboard com métricas

### Módulo de Projetos
- Cadastro de projetos
- Fases e tarefas
- Controle de progresso
- Registro de horas
- Kanban de visualização

### Autenticação
- Login JWT
- Refresh token automático
- 2FA com TOTP (Google Authenticator)
- Roles: Admin, Gerente, Operador, Visualizador

## Deploy em Produção

### VPS (Hostinger/DigitalOcean)

1. Clone o repositório no servidor
2. Configure as variáveis de produção
3. Execute: `docker-compose -f docker-compose.yml up -d`
4. Configure Nginx como proxy reverso
5. Configure SSL com Let's Encrypt

## Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-----------|---------|
| `DB_NAME` | Nome do banco | inova_erp |
| `DB_USER` | Usuário do banco | inova_user |
| `DB_PASSWORD` | Senha do banco | - |
| `DJANGO_SECRET_KEY` | Chave secreta Django | - |
| `DEBUG` | Modo debug | true |
| `ALLOWED_HOSTS` | Hosts permitidos | localhost |

## API Endpoints

### Autenticação
- `POST /api/v1/accounts/register/` - Registrar usuário
- `POST /api/v1/accounts/login/` - Login
- `POST /api/v1/accounts/refresh/` - Refresh token
- `POST /api/v1/accounts/2fa/setup/` - Configurar 2FA
- `POST /api/v1/accounts/2fa/verify/` - Verificar 2FA

### Vendas
- `GET/POST /api/v1/sales/customers/` - Clientes
- `GET/POST /api/v1/sales/opportunities/` - Oportunidades
- `GET/POST /api/v1/sales/quotes/` - Orçamentos
- `GET/POST /api/v1/sales/orders/` - Pedidos

### Projetos
- `GET/POST /api/v1/projects/projects/` - Projetos
- `GET/POST /api/v1/projects/phases/` - Fases
- `GET/POST /api/v1/projects/tasks/` - Tarefas
- `GET/POST /api/v1/projects/time-entries/` - Registro de horas

## Licença

MIT License
# test
