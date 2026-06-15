import logging
import os
import warnings
from pathlib import Path
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent

DEBUG = os.environ.get('DEBUG', 'False').lower() == 'true'

# S7C1: removido fallback `django-insecure-dev-only-key-...` quando DEBUG=True.
# Risco: se DEBUG=true vazasse em prod (env var trocada por engano), a chave
# de assinatura JWT seria conhecida publicamente (esta no repo) → atacante
# forja access_token de qualquer user (incluindo admin). Agora exige
# DJANGO_SECRET_KEY sempre — dev configura no .env.local desde o setup.
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY')
if not SECRET_KEY:
    raise ValueError(
        'DJANGO_SECRET_KEY must be set (dev e prod). '
        'Gere com: python -c "import secrets; print(secrets.token_urlsafe(64))"'
    )

# Validate required secrets in production (skip in CI)
_is_ci = os.environ.get('GITHUB_ACTIONS') == 'true' or os.environ.get('CI') == 'true'
if not DEBUG and not _is_ci:
    # ── Fail-fast (boot impossivel sem isso) ─────────────────────────────────
    # DB_PASSWORD: sem isso, Django nao conecta no Postgres → app inutil.
    # WEBSITE_API_KEY: usada na auth do form publico do site; sem isso o
    #   endpoint /api/v1/sales/website-leads/ rejeita tudo. Mantemos hard-fail
    #   pra forcar configuracao correta (acidentalmente vazio = backdoor aberto).
    # REDIS_PASSWORD: cache + Celery broker compartilhados sem auth = vetor
    #   trivial de injecao de tasks Celery + leitura de cache JWT.
    _db_password = os.environ.get('DB_PASSWORD', '')
    if not _db_password:
        raise ValueError('DB_PASSWORD must be set in production')
    if not os.environ.get('WEBSITE_API_KEY'):
        raise ValueError('WEBSITE_API_KEY must be set in production')
    _redis_url = os.environ.get('REDIS_URL', '')
    _redis_password = os.environ.get('REDIS_PASSWORD', '')
    _redis_has_auth = '@' in _redis_url or bool(_redis_password)
    if not _redis_has_auth:
        raise ValueError(
            'REDIS_PASSWORD must be set in production '
            '(or embed credentials in REDIS_URL)'
        )

    # ── Soft-required (feature degrada, mas app sobe) ────────────────────────
    # TOTP_ENCRYPTION_KEY: usada SOMENTE no fluxo 2FA (encrypt/decrypt do
    # totp_secret). Sem ela:
    #   - Login sem 2FA continua funcionando (cookie httpOnly, etc).
    #   - Setup/verify de 2FA falha cedo em accounts/totp_crypto.py com
    #     ImproperlyConfigured — mensagem clara no response, sem corrupcao.
    #   - decrypt_totp tem fail-safe para legado plain-text (zero-downtime).
    # Fail-fast no import bloqueava deploys inteiros so por essa feature —
    # rollback automatico do CD voltava prod pra commit anterior, mascarando
    # outras correcoes. Agora a aplicacao sobe e o operador ve o aviso em log.
    if not os.environ.get('TOTP_ENCRYPTION_KEY'):
        _msg = (
            'TOTP_ENCRYPTION_KEY ausente — fluxo 2FA bloqueado ate a env var '
            'ser definida. Gere com: python -c "from cryptography.fernet '
            'import Fernet; print(Fernet.generate_key().decode())". App '
            'continua subindo; demais features funcionam normalmente.'
        )
        warnings.warn(_msg, RuntimeWarning, stacklevel=2)
        logging.getLogger('django').critical('CONFIG: %s', _msg)

_allowed = [h.strip() for h in os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',') if h.strip()]
# Hosts internos do Docker (necessários para proxy Next.js → Django)
for _docker_host in ['backend', 'grupo_ry_inova-erp_backend', 'localhost', '127.0.0.1']:
    if _docker_host not in _allowed:
        _allowed.append(_docker_host)
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
    'juridico.apps.JuridicoConfig',
    'diretoria.apps.DiretoriaConfig',
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
    # Cabeçalhos de segurança complementares (CSP, Permissions-Policy, COOP).
    # Idempotente: views que já setaram CSP específico (ex: ProposalPublicHTMLView)
    # mantêm o valor delas.
    'core.middleware.SecurityHeadersMiddleware',
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
    # F0: 8 → 12. ERP financeiro com dados reais; 12+complexidade torna
    # brute-force offline impraticavel. So afeta senhas novas/trocadas.
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 12},
    },
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
    # F0: exige maiuscula + numero + simbolo (accounts/validators.py).
    {'NAME': 'accounts.validators.PasswordComplexityValidator'},
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
    # S7C1: SECURE_SSL_REDIRECT controlado via env. Default false pois Django
    # atras de Traefik/proxy ja recebe HTTPS terminado — habilitar redirect
    # aqui pode causar loop infinito se X-Forwarded-Proto nao chegar correto.
    # Operador deve setar SECURE_SSL_REDIRECT=true APENAS apos validar que o
    # proxy envia o header. SECURE_PROXY_SSL_HEADER abaixo trata o caso comum.
    SECURE_SSL_REDIRECT = os.environ.get('SECURE_SSL_REDIRECT', 'false').lower() == 'true'
    # S7C1: Django atras de nginx/Traefik com TLS terminado no proxy precisa
    # saber que a request original era HTTPS. Sem isso `request.is_secure()`
    # retorna False, `build_absolute_uri()` gera links http:// em emails de
    # password reset (token leak em redes intermediarias), e SECURE_SSL_REDIRECT
    # entra em loop infinito quando o proxy nao envia X-Forwarded-Proto correto.
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
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
        # 2FA: rate reduzido de 10/hora → 5/minuto.
        # Com 6 dígitos (1M combinações) + janela TOTP 30s + TTL temp_token
        # 3min (ver accounts/views.py), brute-force fica inviável.
        'two_factor': '5/minute',
        'n8n': '300/hour',
        # F4.2: simulate do PaymentProvider e puro calculo, mas repetir
        # 10k requests revela a tabela de taxas. Limite razoavel para
        # uso humano via modal.
        'simulate_payment': '60/minute',
        # S7H: troca de senha (usuario autenticado). 5/h protege contra
        # abuso de sessao roubada e brute-force de senha atual.
        'change_password': '5/hour',
        # S7H: password reset composto (IP, email). 1/h por combinacao
        # IP+email — empilha com password_reset (3/h por IP).
        'password_reset_email': '1/hour',
        # F0: health era throttle_classes=[] (sem limite). 60/min por IP
        # cobre o smoke do CD (24 req/2min) e monitores externos.
        'health': '60/minute',
        # F1: simulação do cronograma é cálculo puro autenticado; 60/min
        # por usuário cobre uso humano (sliders na mini-tela) sem permitir
        # flood (STRIDE DoS, doc 08 §8.1).
        'cronograma_simulate': '60/minute',
        # F6 (doc 05 §9): canal público de chamados — 5/h por token de
        # cliente (STRIDE DoS/Info disclosure, doc 08 §8.1). Empilha com o
        # throttle por IP da view.
        'public_ticket': '5/hour',
    },
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

# ─── JWT ───────────────────────────────────────────────────────────────────────

SIMPLE_JWT = {
    # F0: 60 → 30min. O frontend ja faz auto-refresh single-flight em 401,
    # entao a unica mudanca percebida e a janela menor de um token vazado.
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=30),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# ─── F0: FLAGS DE SEGURANCA OPERACIONAL ───────────────────────────────────────
# Enforcement de 2FA para admins: em producao default ON. Fase 1 do
# enforcement: o login de admin sem 2FA retorna must_setup_2fa=True e o
# frontend forca a tela de setup (bloqueio hard no backend fica para F2,
# evitando lockout do unico admin durante a transicao).
ENFORCE_ADMIN_2FA = os.environ.get(
    'ENFORCE_ADMIN_2FA', 'false' if DEBUG else 'true'
).lower() == 'true'

# reset-data apaga TODA a base de negocio. Fora de DEBUG o endpoint
# responde 404 a menos que o operador ligue explicitamente (e desligue
# depois). Nunca deixar ligado em producao.
RESET_DATA_ENABLED = DEBUG or os.environ.get(
    'RESET_DATA_ENABLED', 'false'
).lower() == 'true'

# ─── v32: FLAGS DE AUTOMACAO CROSS-SETOR (doc 08 §11.2 R2) ────────────────────
# Toda automacao nova nasce atras de flag por env: off | dry_run | on.
# Default dry_run: loga (logger + log_audit) o que faria, sem efeito.
# Kill-switch sem deploy: trocar env + restart.


def _automation_flag(name: str, default: str = 'dry_run') -> str:
    value = os.environ.get(name, default).strip().lower()
    if value not in ('off', 'dry_run', 'on'):
        logging.getLogger('django').warning(
            'CONFIG: %s=%r invalido (esperado off|dry_run|on) — usando %r.',
            name, value, default,
        )
        return default
    return value


# F3: ClientOnboarding submitted -> cria LegalCase(contrato, source=comercial)
AUTOMATION_JURIDICO_CONTRATO = _automation_flag('AUTOMATION_JURIDICO_CONTRATO')

# F4: ClientOnboarding submitted -> pré-cadastra Invoice(pending) do
# ProposalPaymentPlan (paralelo ao Jurídico)
AUTOMATION_FIN_PRECADASTRO = _automation_flag('AUTOMATION_FIN_PRECADASTRO')

# F4: LegalCase(contrato) assinado -> libera cobrança das invoices pendentes
AUTOMATION_FIN_LIBERA_COBRANCA = _automation_flag('AUTOMATION_FIN_LIBERA_COBRANCA')

# F4: Invoice da entrada paga -> evento interno entrada_paga (Dia 0 Produção)
AUTOMATION_FIN_ENTRADA_PAGA = _automation_flag('AUTOMATION_FIN_ENTRADA_PAGA')

# F4: régua de cobrança (lembretes a vencer 3d / vencida 1d e 7d)
AUTOMATION_FIN_REGUA = _automation_flag('AUTOMATION_FIN_REGUA')

# F3/F4 (doc 09 item 07): Aditivo -> Financeiro. Nova solicitação pré-cadastra
# o valor (pendente); Assinado ativa a cobrança; Recusado cancela o pré-cadastro.
AUTOMATION_FIN_ADITIVO = _automation_flag('AUTOMATION_FIN_ADITIVO')

# F5: evento entrada_paga (Financeiro) -> seta Project.entrada_paga_at
AUTOMATION_PROD_ENTRADA = _automation_flag('AUTOMATION_PROD_ENTRADA')

# F5: LegalCase(contrato) assinado -> seta Project.contrato_assinado_at
AUTOMATION_PROD_CONTRATO_ASSINADO = _automation_flag(
    'AUTOMATION_PROD_CONTRATO_ASSINADO')

# F5: LegalCase(validacao_documento) assinado -> ProjectDocument signed+baseline
AUTOMATION_PROD_DOC_ASSINADA = _automation_flag('AUTOMATION_PROD_DOC_ASSINADA')

# F5: bifurcação (graduação/implementação) -> cria RecurrenceContract
AUTOMATION_PROD_RECORRENCIA = _automation_flag('AUTOMATION_PROD_RECORRENCIA')

# v32 ajustes (doc 09 itens 06/07 + doc 10): PRODUCERS Produção -> Jurídico.
# Doc enviada pra validação -> cria LegalCase(validacao_documento).
AUTOMATION_PROD_VALIDACAO_JURIDICO = _automation_flag(
    'AUTOMATION_PROD_VALIDACAO_JURIDICO')
# Solicitar Mudança -> cria ChangeRequest + LegalCase(aditivo).
AUTOMATION_PROD_ADITIVO_JURIDICO = _automation_flag(
    'AUTOMATION_PROD_ADITIVO_JURIDICO')

# F6: SupportTicket analisado com conclusao=inconclusivo -> cria
# diretoria.DirectorEscalation + Notification para admins
AUTOMATION_SUP_ESCALA = _automation_flag('AUTOMATION_SUP_ESCALA')

# F6: promover PedidoUpdate -> cria Prospect(status=tech_analysis) no Comercial
AUTOMATION_SUP_PEDIDO_UPDATE = _automation_flag('AUTOMATION_SUP_PEDIDO_UPDATE')

# F6: auto-fechamento de chamados resolvidos sem retorno do cliente
AUTOMATION_SUP_AUTOCLOSE = _automation_flag('AUTOMATION_SUP_AUTOCLOSE')

# F6 (doc 05 §8): dias em `resolvido` sem retorno antes do auto-fechamento.
try:
    SUPPORT_AUTOCLOSE_DAYS = int(os.environ.get('SUPPORT_AUTOCLOSE_DAYS', '5'))
except ValueError:
    SUPPORT_AUTOCLOSE_DAYS = 5

# ─── JWT COOKIES ────────────────────────────────────────────────────────────────
# Cookies são httpOnly — inacessíveis por JavaScript (proteção XSS)
# Em produção (not DEBUG), cookies devem ser sempre Secure (HTTPS)
JWT_COOKIE_SECURE = True if not DEBUG else os.environ.get('JWT_COOKIE_SECURE', 'False').lower() == 'true'
# S7C2: Strict (era Lax) — Lax permitia que cookie viajasse em top-level GET
# cross-site (links em emails, popups), abrindo brecha para CSRF em endpoints
# @action GET com side-effect. Strict so envia em requests originadas do
# proprio dominio.
JWT_COOKIE_SAMESITE = 'Strict'
JWT_COOKIE_DOMAIN = os.environ.get('JWT_COOKIE_DOMAIN', None)  # .inovasystemssolutions.com em prod

# ─── CSRF COOKIES (S7C2) ───────────────────────────────────────────────────────
# JWT em cookie + double-submit token: o cookie `csrftoken` NAO pode ser
# httpOnly (JS precisa ler), mas eh Secure+SameSite=Strict para nao vazar.
# JWTCookieAuthentication valida que o request traz X-CSRFToken header batendo
# com o cookie em metodos nao-safe.
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = 'Strict'
# CSRF_COOKIE_SECURE setado no bloco `if not DEBUG` abaixo (junto com SESSION).
CSRF_USE_SESSIONS = False  # Default; mantemos explicito.

# ─── WEBSITE INTEGRATION ──────────────────────────────────────────────────────
WEBSITE_API_KEY = os.environ.get('WEBSITE_API_KEY', '')
# S7B.8: lista de Origin/Referer permitidos para o endpoint público
# /api/v1/sales/website-lead/. Defesa em profundidade adicional à API key
# — bots externos com chave vazada precisam também spoofar o Origin.
# S7L: default inclui dominios conhecidos do site Inova (deploy sem env var
# ainda aceita lead form do site institucional). Operador pode adicionar
# subdominios via env var (CSV) — substitui o default.
# DEV/staging: setar via .env para incluir localhost.
_default_website_origins = (
    'https://www.inovasystemssolutions.com,'
    'https://inovasystemssolutions.com'
)
WEBSITE_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        'WEBSITE_ALLOWED_ORIGINS', _default_website_origins,
    ).split(',')
    if o.strip()
]

# ─── TOTP ENCRYPTION (F3b) ────────────────────────────────────────────────────
# Chave Fernet para cifrar User.totp_secret em repouso.
#
# S7C1: removido fallback hardcoded `aW5vdmEtZXJwLXRvdHAtZGV2LWtleS0y...`.
# Risco: se a env var nao fosse setada em prod (e o aviso ignorado), TODOS
# os totp_secret seriam cifrados com chave publica conhecida (esta no repo).
# Atacante com backup do DB decifra todos os TOTPs e bypass 2FA total.
#
# Comportamento atualizado:
#  - Em dev/CI (DEBUG=True ou GITHUB_ACTIONS): chave deterministica gerada
#    em memoria por processo via hash de uma fonte fixa do projeto. Tests
#    rodam sem precisar de env var, mas chave NAO esta no codigo fonte.
#  - Em prod: TOTP_ENCRYPTION_KEY obrigatoria (warning ja existente em
#    fail-fast block). Fail-safe permite app subir; 2FA bloqueado ate setar.
_explicit_totp = os.environ.get('TOTP_ENCRYPTION_KEY')
if _explicit_totp:
    TOTP_ENCRYPTION_KEY = _explicit_totp
elif DEBUG or _is_ci:
    # Deriva chave Fernet de um marcador deterministico (NAO publico).
    # Chave muda se a hash mudar; testes precisam apenas que a chave seja
    # estavel dentro do mesmo processo (round-trip encrypt/decrypt).
    import base64
    import hashlib
    _seed = f'inova-erp-dev-{SECRET_KEY[:32]}'.encode()
    _derived = hashlib.sha256(_seed).digest()
    TOTP_ENCRYPTION_KEY = base64.urlsafe_b64encode(_derived).decode()
else:
    # Em prod o warning ja foi emitido no fail-fast block acima.
    # Settamos None para forcar erro claro em totp_crypto.py se for usado.
    TOTP_ENCRYPTION_KEY = None

# ─── N8N INTEGRATION ─────────────────────────────────────────────────────────
N8N_API_KEY = os.environ.get('N8N_API_KEY', '')

# ─── CORS ──────────────────────────────────────────────────────────────────────

CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get('CORS_ALLOWED_ORIGINS', 'http://localhost:3000').split(',')
    if o.strip()
]
# Subdomínios públicos
for subdomain in ['cadastro', 'parceiro']:
    origin = f'https://{subdomain}.inovasystemssolutions.com'
    if origin not in CORS_ALLOWED_ORIGINS:
        CORS_ALLOWED_ORIGINS.append(origin)
CORS_ALLOW_CREDENTIALS = True

# CSRF trusted origins (deve vir DEPOIS de CORS_ALLOWED_ORIGINS)
#
# S7C1: removido wildcard `https://*.inovasystemssolutions.com`.
# Risco: subdomain takeover (DNS dangling, CNAME orfao em staging/dev)
# concedia bypass de CSRF e — combinado com JWT_COOKIE_DOMAIN amplo —
# roubo total de sessao. Agora enumeramos subdominios conhecidos.
#
# Como adicionar novos subdominios em prod:
#   1) Setar CSRF_EXTRA_TRUSTED_ORIGINS no .env:
#      CSRF_EXTRA_TRUSTED_ORIGINS=https://novo.inovasystemssolutions.com,https://outro.dominio
#   2) Reiniciar backend.
if not DEBUG:
    _csrf_trusted = [
        o for o in CORS_ALLOWED_ORIGINS if o.startswith('https://')
    ]
    # Subdominios conhecidos da Inova (substitui o wildcard).
    for _sub in ['app', 'erp', 'cadastro', 'parceiro']:
        _origin = f'https://{_sub}.inovasystemssolutions.com'
        if _origin not in _csrf_trusted:
            _csrf_trusted.append(_origin)
    # Extras configuraveis sem deploy (env var).
    _extra = os.environ.get('CSRF_EXTRA_TRUSTED_ORIGINS', '')
    for _o in [x.strip() for x in _extra.split(',') if x.strip()]:
        if _o.startswith('https://') and '*' not in _o and _o not in _csrf_trusted:
            _csrf_trusted.append(_o)
    CSRF_TRUSTED_ORIGINS = _csrf_trusted
else:
    # F0/DX: em dev o frontend (localhost:3000) chama a API direto em outra
    # porta; POST cross-origin exige a origin aqui, senao todo unsafe method
    # morre com "CSRF Failed: Origin checking failed". SO em DEBUG — em
    # producao vale o bloco acima (enumerado, sem wildcard, https only).
    CSRF_TRUSTED_ORIGINS = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
    ]

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
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'Inova Systems Solutions <noreply@inovasystemssolutions.com>')

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
        'juridico':  {'handlers': ['console'], 'level': 'INFO', 'propagate': False},
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
    # v32 F4: régua de cobrança (a vencer 3d / vencida 1d e 7d) — diário 08:30
    # Atrás da flag AUTOMATION_FIN_REGUA (default dry_run).
    'dunning-reminders': {
        'task': 'finance.tasks.dunning_reminders',
        'schedule': crontab(hour=8, minute=30),
    },
    # v32 F6 (doc 05 §8): auto-fechamento de chamados resolvidos há mais de
    # SUPPORT_AUTOCLOSE_DAYS dias sem retorno — diário às 07:30.
    # Atrás da flag AUTOMATION_SUP_AUTOCLOSE (default dry_run).
    'support-autoclose-resolved': {
        'task': 'support.tasks.close_stale_resolved',
        'schedule': crontab(hour=7, minute=30),
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
