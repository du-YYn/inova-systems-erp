import os
from pathlib import Path
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent

DEBUG = os.environ.get('DEBUG', 'False').lower() == 'true'

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY')
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = 'django-insecure-dev-only-key-do-not-use-in-production'
    else:
        raise ValueError('DJANGO_SECRET_KEY must be set in production')

# Validate required secrets in production (skip in CI)
_is_ci = os.environ.get('GITHUB_ACTIONS') == 'true' or os.environ.get('CI') == 'true'
if not DEBUG and not _is_ci:
    _db_password = os.environ.get('DB_PASSWORD', '')
    if not _db_password:
        raise ValueError('DB_PASSWORD must be set in production')
    if not os.environ.get('WEBSITE_API_KEY'):
        raise ValueError('WEBSITE_API_KEY must be set in production')

_allowed = [h.strip() for h in os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',') if h.strip()]
if DEBUG:
    _allowed += ['backend', 'host.docker.internal']
ALLOWED_HOSTS = _allowed

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'django_celery_beat',
    'django_celery_results',
    'accounts.apps.AccountsConfig',
    'sales.apps.SalesConfig',
    'finance.apps.FinanceConfig',
    'projects.apps.ProjectsConfig',
    'core.apps.CoreConfig',
    'support.apps.SupportConfig',
    'notifications.apps.NotificationsConfig',
    'drf_spectacular',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'inova_erp'),
        'USER': os.environ.get('DB_USER', 'inova_user'),
        'PASSWORD': os.environ.get('DB_PASSWORD', ''),
        'HOST': os.environ.get('DB_HOST', 'localhost'),
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'pt-br'
TIME_ZONE = 'America/Sao_Paulo'
USE_I18N = True
USE_TZ = True

# ─── SECURITY HEADERS (produção) ───────────────────────────────────────────────
if not DEBUG:
    SECURE_HSTS_SECONDS = 31536000          # 1 ano
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    # Desativado por padrão para permitir testes de CI sem HTTPS.
    # Em produção real, defina SECURE_SSL_REDIRECT=true no ambiente.
    SECURE_SSL_REDIRECT = os.environ.get('SECURE_SSL_REDIRECT', 'false').lower() == 'true'
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_BROWSER_XSS_FILTER = True
    X_FRAME_OPTIONS = 'DENY'
    SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'

STATIC_URL = 'static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')

MEDIA_URL = 'media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

AUTH_USER_MODEL = 'accounts.User'

# ─── REST FRAMEWORK ────────────────────────────────────────────────────────────

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'accounts.authentication.JWTCookieAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/hour',
        'user': '1000/hour',
        'login': '5/minute',
        'password_reset': '3/hour',
        'two_factor': '10/hour',
        'n8n': '300/hour',
    },
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

# ─── JWT ───────────────────────────────────────────────────────────────────────

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# ─── JWT COOKIES ────────────────────────────────────────────────────────────────
# Cookies são httpOnly — inacessíveis por JavaScript (proteção XSS)
# Em produção (not DEBUG), cookies devem ser sempre Secure (HTTPS)
JWT_COOKIE_SECURE = True if not DEBUG else os.environ.get('JWT_COOKIE_SECURE', 'False').lower() == 'true'
JWT_COOKIE_SAMESITE = 'Lax'  # Proteção CSRF cross-site

# ─── WEBSITE INTEGRATION ──────────────────────────────────────────────────────
WEBSITE_API_KEY = os.environ.get('WEBSITE_API_KEY', '')

# ─── N8N INTEGRATION ─────────────────────────────────────────────────────────
N8N_API_KEY = os.environ.get('N8N_API_KEY', '')

# ─── CORS ──────────────────────────────────────────────────────────────────────

CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get('CORS_ALLOWED_ORIGINS', 'http://localhost:3000').split(',')
    if o.strip()
]
# Subdomínio de cadastro do cliente (formulário público de onboarding)
if 'https://cadastro.inovasystemssolutions.com' not in CORS_ALLOWED_ORIGINS:
    CORS_ALLOWED_ORIGINS.append('https://cadastro.inovasystemssolutions.com')
CORS_ALLOW_CREDENTIALS = True

# ─── CACHE / REDIS ─────────────────────────────────────────────────────────────

CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': os.environ.get('REDIS_URL', 'redis://localhost:6379/1'),
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        }
    }
}

# ─── EMAIL ─────────────────────────────────────────────────────────────────────

EMAIL_BACKEND = os.environ.get(
    'EMAIL_BACKEND',
    'django.core.mail.backends.console.EmailBackend'  # imprime no console em dev
)
EMAIL_HOST = os.environ.get('EMAIL_HOST', 'smtp.resend.com')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', '587'))
EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'True').lower() == 'true'
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', 'resend')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'noreply@inovasystemssolutions.com')

FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

# ─── SENTRY ────────────────────────────────────────────────────────────────────

SENTRY_DSN = os.environ.get('SENTRY_DSN', '')

if SENTRY_DSN:
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=SENTRY_DSN,
            traces_sample_rate=0.2,
            profiles_sample_rate=0.1,
            environment='production' if not DEBUG else 'development',
            send_default_pii=False,
        )
    except ImportError:
        pass  # sentry-sdk não instalado ainda

# ─── LOGGING ───────────────────────────────────────────────────────────────────

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'json': {
            'format': '{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}',
        },
        'verbose': {
            'format': '[%(asctime)s] %(levelname)s %(name)s: %(message)s',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'json' if not DEBUG else 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
        'django.request': {
            'handlers': ['console'],
            'level': 'ERROR',
            'propagate': False,
        },
        'accounts':  {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
        'sales':     {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
        'finance':   {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
        'projects':  {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
        'audit': {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
    },
}

# ─── CELERY ────────────────────────────────────────────────────────────────────

CELERY_BROKER_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = 'django-db'
CELERY_CACHE_BACKEND = 'django-cache'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
CELERY_BEAT_SCHEDULER = 'django_celery_beat.schedulers:DatabaseScheduler'
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60  # 30 minutos por task
CELERY_WORKER_PREFETCH_MULTIPLIER = 1  # Uma task por vez (bom para tasks longas)

from celery.schedules import crontab  # noqa: E402

CELERY_BEAT_SCHEDULE = {
    # Verifica contratos vencendo e auto-renova — diário às 08:00
    'check-contract-renewals': {
        'task': 'sales.tasks.check_contract_renewals',
        'schedule': crontab(hour=8, minute=0),
    },
    # Alerta de tarefas com prazo próximo — diário às 07:00
    'check-task-deadlines': {
        'task': 'notifications.tasks.check_task_deadlines',
        'schedule': crontab(hour=7, minute=0),
    },
    # Marca invoices vencidas e envia alertas — diário às 09:00
    'check-invoice-overdue': {
        'task': 'notifications.tasks.check_invoice_overdue',
        'schedule': crontab(hour=9, minute=0),
    },
    # Gera faturas de despesas fixas recorrentes — dia 1 de cada mês às 06:00
    'generate-recurring-invoices': {
        'task': 'finance.tasks.generate_recurring_invoices',
        'schedule': crontab(hour=6, minute=0, day_of_month='1'),
    },
    # Recalcula budgets ativos — diário às 06:30
    'recalculate-budgets': {
        'task': 'finance.tasks.recalculate_all_active_budgets',
        'schedule': crontab(hour=6, minute=30),
    },
    # Alerta de SLA em risco — a cada hora
    'check-sla-warnings': {
        'task': 'notifications.tasks.check_sla_warnings',
        'schedule': crontab(minute=0),  # a cada hora cheia
    },
}

CELERY_RESULT_EXPIRES = 3600  # Limpa resultados após 1 hora

# ─── SWAGGER / OpenAPI ──────────────────────────────────────────────────────

SPECTACULAR_SETTINGS = {
    'TITLE': 'Inova Systems ERP API',
    'DESCRIPTION': (
        'API REST do Inova Systems ERP — gestão de clientes, projetos, vendas e financeiro.\n\n'
        '**Autenticação**: Bearer JWT. Obtenha o token em `/api/v1/accounts/login/` '
        'e passe no header `Authorization: Bearer <token>`.'
    ),
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'CONTACT': {'email': 'dev@inovasystemssolutions.com'},
    'LICENSE': {'name': 'Proprietário'},
    'COMPONENT_SPLIT_REQUEST': True,
    'SORT_OPERATIONS': False,
    'TAGS': [
        {'name': 'auth', 'description': 'Autenticação e gestão de usuários'},
        {'name': 'sales', 'description': 'CRM — clientes, prospects, propostas, contratos'},
        {'name': 'projects', 'description': 'Projetos, tarefas, fases e apontamento de horas'},
        {'name': 'finance', 'description': 'Financeiro — contas, faturas, transações, orçamentos'},
    ],
}
