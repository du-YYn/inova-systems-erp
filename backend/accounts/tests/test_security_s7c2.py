"""Testes Sprint S7-C2 — JWT cookie SameSite=Strict + CSRF double-submit.

Cobre o CRITICAL #3 da auditoria: JWT em cookie httpOnly nao tinha
protecao adicional contra CSRF, e SameSite=Lax permitia que GET top-level
disparassem com cookie. Esta fase:

- S7C2.1: JWT_COOKIE_SAMESITE = 'Strict' em prod (settings)
- S7C2.2: LoginView seta cookie CSRF (`csrftoken`, NAO httpOnly)
- S7C2.3: TwoFactorVerifyView idem
- S7C2.4: GET com JWT cookie nao exige CSRF (metodos safe)
- S7C2.5: POST/PATCH/DELETE com JWT cookie e SEM X-CSRFToken → 403
- S7C2.6: POST com X-CSRFToken != cookie csrftoken → 403
- S7C2.7: POST com X-CSRFToken == cookie csrftoken → 200/201
- S7C2.8: Auth via header Authorization Bearer continua isento de CSRF
- S7C2.9: LogoutView limpa csrftoken cookie
"""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.conf import settings
from django.contrib.auth import get_user_model
from django.middleware.csrf import get_token
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()


@pytest.fixture
def api_client():
    """Client com enforce_csrf_checks=True para simular browser real."""
    return APIClient(enforce_csrf_checks=True)


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='s7c2_admin', email='s7c2@admin.com',
        password='pass12345', role='admin',
    )


def _login_via_cookies(client, user):
    """Helper: seta cookies de JWT + lemra csrftoken (necessario fazer um GET
    primeiro para o Django enviar o csrftoken cookie).
    """
    refresh = RefreshToken.for_user(user)
    client.cookies['access_token'] = str(refresh.access_token)
    client.cookies['refresh_token'] = str(refresh)


# ─── S7C2.1: settings.py ────────────────────────────────────────────────

@pytest.mark.django_db
class TestSettingsSameSiteStrict:
    """JWT_COOKIE_SAMESITE deve ser 'Strict' (era 'Lax')."""

    def test_jwt_samesite_is_strict(self):
        assert settings.JWT_COOKIE_SAMESITE == 'Strict', (
            'JWT_COOKIE_SAMESITE deve ser Strict para impedir que o cookie '
            'viaje em navegacoes top-level cross-site.'
        )


# ─── S7C2.2 + S7C2.3: cookies CSRF apos login/2FA ──────────────────────

@pytest.mark.django_db
class TestLoginSetsCsrfCookie:
    """LoginView (sem 2FA) deve setar cookie csrftoken na resposta."""

    def test_login_response_sets_csrftoken_cookie(self, api_client, admin_user):
        resp = api_client.post('/api/v1/accounts/login/', {
            'username': 's7c2_admin', 'password': 'pass12345',
        }, format='json')
        assert resp.status_code == status.HTTP_200_OK, resp.content
        assert 'csrftoken' in resp.cookies, (
            'login deve setar csrftoken cookie para o frontend usar em '
            'requests subsequentes (double-submit pattern)'
        )
        # Cookie NAO httpOnly — JS precisa ler para mandar no header
        csrftoken_cookie = resp.cookies['csrftoken']
        assert csrftoken_cookie.get('httponly') in (False, '', None), (
            'csrftoken cookie nao pode ser httpOnly — JS precisa ler para '
            'enviar em X-CSRFToken header'
        )


# ─── S7C2.4: GET nao exige CSRF ────────────────────────────────────────

@pytest.mark.django_db
class TestCsrfNotRequiredForSafeMethods:
    """GET/HEAD/OPTIONS nao precisam de CSRF mesmo com JWT cookie."""

    def test_get_without_csrf_token_works(self, api_client, admin_user):
        _login_via_cookies(api_client, admin_user)
        resp = api_client.get('/api/v1/accounts/profile/')
        assert resp.status_code == status.HTTP_200_OK, (
            'GET /accounts/profile/ deve funcionar sem CSRF token '
            f'(retornou {resp.status_code}: {resp.content[:200]})'
        )


# ─── S7C2.5: POST sem CSRF token → 403 ─────────────────────────────────

@pytest.mark.django_db
class TestCsrfRequiredForUnsafeMethods:
    """POST/PATCH/DELETE com JWT cookie e SEM X-CSRFToken header → 403."""

    def test_post_without_csrf_header_returns_403(self, api_client, admin_user):
        _login_via_cookies(api_client, admin_user)
        resp = api_client.post('/api/v1/sales/customers/', {
            'name': 'Cliente CSRF Test',
            'email': 'csrf@test.com',
            'document': '12345678000100',
            'document_type': 'cnpj',
        }, format='json')
        assert resp.status_code == status.HTTP_403_FORBIDDEN, (
            f'POST sem X-CSRFToken deveria ser bloqueado (CSRF Failed). '
            f'Retornou {resp.status_code}: {resp.content[:200]}'
        )


# ─── S7C2.6: POST com CSRF token errado → 403 ─────────────────────────

@pytest.mark.django_db
class TestCsrfTokenMustMatch:
    """X-CSRFToken header DEVE bater com cookie csrftoken."""

    def test_post_with_mismatched_csrf_returns_403(self, api_client, admin_user):
        _login_via_cookies(api_client, admin_user)
        # Fake CSRF token que nao bate com nenhum cookie
        resp = api_client.post(
            '/api/v1/sales/customers/',
            {'name': 'X', 'email': 'x@x.com', 'document': '12345678000100',
             'document_type': 'cnpj'},
            format='json',
            HTTP_X_CSRFTOKEN='fake-token-that-does-not-match',
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN, (
            f'X-CSRFToken inconsistente deve falhar. Retornou {resp.status_code}'
        )


# ─── S7C2.7: POST com CSRF correto → passa ─────────────────────────────

@pytest.mark.django_db
class TestCsrfTokenMatchPasses:
    """POST com X-CSRFToken == cookie csrftoken deve passar."""

    def test_post_with_valid_csrf_token_works(self, api_client, admin_user):
        _login_via_cookies(api_client, admin_user)
        # Faz um GET para o servidor enviar o csrftoken cookie
        api_client.get('/api/v1/accounts/profile/')
        # Le o cookie csrftoken do client e manda como X-CSRFToken
        csrf_token = api_client.cookies.get('csrftoken')
        assert csrf_token is not None, 'GET deveria ter setado csrftoken cookie'

        resp = api_client.post(
            '/api/v1/sales/customers/',
            {'name': 'Cliente Valido', 'email': 'valid@test.com',
             'document': '98765432000100', 'document_type': 'cnpj'},
            format='json',
            HTTP_X_CSRFTOKEN=csrf_token.value,
        )
        # 201 (created) ou 200 esperado; 403 = CSRF failed (bug)
        assert resp.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED), (
            f'POST com X-CSRFToken valido deveria passar. '
            f'Retornou {resp.status_code}: {resp.content[:200]}'
        )


# ─── S7C2.8: Bearer header isento de CSRF (compatibilidade) ────────────

@pytest.mark.django_db
class TestBearerAuthSkipsCsrf:
    """Authorization: Bearer <token> nao exige CSRF (atacante CSRF nao
    consegue setar header custom; Bearer e usado por testes/Swagger/API externa)."""

    def test_bearer_post_without_csrf_works(self, api_client, admin_user):
        refresh = RefreshToken.for_user(admin_user)
        resp = api_client.post(
            '/api/v1/sales/customers/',
            {'name': 'Bearer Cliente', 'email': 'bearer@test.com',
             'document': '11111111000111', 'document_type': 'cnpj'},
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}',
        )
        assert resp.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED), (
            f'Bearer header deveria isentar de CSRF. Retornou {resp.status_code}'
        )


# ─── S7C2.9: Logout limpa csrftoken cookie ─────────────────────────────

@pytest.mark.django_db
class TestLogoutClearsCsrfCookie:
    """LogoutView deve limpar csrftoken (junto com access/refresh)."""

    def test_logout_clears_csrftoken(self, api_client, admin_user):
        _login_via_cookies(api_client, admin_user)
        api_client.get('/api/v1/accounts/profile/')
        csrf = api_client.cookies.get('csrftoken').value

        resp = api_client.post(
            '/api/v1/accounts/logout/',
            format='json',
            HTTP_X_CSRFTOKEN=csrf,
        )
        assert resp.status_code == status.HTTP_200_OK
        # csrftoken deve estar marcado para expirar (Max-Age=0 ou expires no passado)
        csrf_after = resp.cookies.get('csrftoken')
        assert csrf_after is not None, 'logout deve setar csrftoken expirado'
        # Cookie de expiracao tem max-age 0 ou string vazia
        max_age = csrf_after.get('max-age')
        assert max_age in (0, '0'), (
            f'csrftoken cookie pos-logout deveria ter max-age=0, tem {max_age}'
        )
