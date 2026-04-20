"""Tests for the Presentations SSO integration."""
from __future__ import annotations

import jwt
import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from integrations.services import (
    SSO_ALGORITHM,
    SSO_AUDIENCE,
    SSO_ISSUER,
    SSO_TOKEN_TTL_SECONDS,
    SSOConfigError,
    build_launch_url,
    issue_sso_token,
)


SECRET = "shared-test-secret-not-for-prod"
BASE_URL = "https://apresentacao.test.local"


@pytest.fixture
def configured_settings(settings):
    settings.PRESENTATION_SHARED_SECRET = SECRET
    settings.PRESENTATION_BASE_URL = BASE_URL
    return settings


@pytest.fixture
def user(db):
    User = get_user_model()
    return User.objects.create_user(
        username="alice",
        email="alice@example.com",
        password="anything-is-fine",
        first_name="Alice",
        last_name="Lima",
        role="manager",
    )


@pytest.mark.django_db
class TestIssueSSOToken:
    def test_token_is_signed_and_decodable(self, configured_settings, user):
        token = issue_sso_token(user)
        decoded = jwt.decode(
            token,
            SECRET,
            algorithms=[SSO_ALGORITHM],
            audience=SSO_AUDIENCE,
            issuer=SSO_ISSUER,
        )
        assert decoded["sub"] == str(user.pk)
        assert decoded["email"] == "alice@example.com"
        assert decoded["name"] == "Alice Lima"
        assert decoded["role"] == "manager"
        assert decoded["jti"]
        assert decoded["exp"] - decoded["iat"] == SSO_TOKEN_TTL_SECONDS

    def test_token_fails_with_wrong_secret(self, configured_settings, user):
        token = issue_sso_token(user)
        with pytest.raises(jwt.InvalidSignatureError):
            jwt.decode(
                token,
                "wrong-secret",
                algorithms=[SSO_ALGORITHM],
                audience=SSO_AUDIENCE,
                issuer=SSO_ISSUER,
            )

    def test_token_falls_back_to_username_when_no_full_name(self, configured_settings, db):
        User = get_user_model()
        u = User.objects.create_user(username="bob", email="bob@example.com", password="x")
        token = issue_sso_token(u)
        decoded = jwt.decode(token, SECRET, algorithms=[SSO_ALGORITHM],
                             audience=SSO_AUDIENCE, issuer=SSO_ISSUER)
        assert decoded["name"] == "bob"

    def test_missing_secret_raises(self, settings, user):
        settings.PRESENTATION_SHARED_SECRET = ""
        with pytest.raises(SSOConfigError):
            issue_sso_token(user)


@pytest.mark.django_db
class TestBuildLaunchURL:
    def test_url_contains_token_and_base(self, configured_settings, user):
        url = build_launch_url(user)
        assert url.startswith(f"{BASE_URL}/sso/launch?token=")

    def test_strips_trailing_slash(self, settings, user):
        settings.PRESENTATION_SHARED_SECRET = SECRET
        settings.PRESENTATION_BASE_URL = BASE_URL + "/"
        url = build_launch_url(user)
        assert url.startswith(f"{BASE_URL}/sso/launch?token=")
        assert "//sso/launch" not in url

    def test_missing_base_url_raises(self, settings, user):
        settings.PRESENTATION_SHARED_SECRET = SECRET
        settings.PRESENTATION_BASE_URL = ""
        with pytest.raises(SSOConfigError):
            build_launch_url(user)


@pytest.mark.django_db
class TestPresentationLaunchEndpoint:
    URL = "/api/v1/integrations/presentations/launch/"

    def test_unauthenticated_blocked(self, configured_settings):
        client = APIClient()
        response = client.post(self.URL)
        assert response.status_code in (401, 403)

    def test_authenticated_returns_url(self, configured_settings, user):
        client = APIClient()
        client.force_authenticate(user)
        response = client.post(self.URL)
        assert response.status_code == 200
        assert "url" in response.data
        assert response.data["url"].startswith(f"{BASE_URL}/sso/launch?token=")

    def test_returns_503_when_misconfigured(self, settings, user):
        settings.PRESENTATION_SHARED_SECRET = ""
        settings.PRESENTATION_BASE_URL = BASE_URL
        client = APIClient()
        client.force_authenticate(user)
        response = client.post(self.URL)
        assert response.status_code == 503

    def test_each_call_issues_unique_jti(self, configured_settings, user):
        client = APIClient()
        client.force_authenticate(user)
        token_1 = client.post(self.URL).data["url"].split("token=")[-1]
        token_2 = client.post(self.URL).data["url"].split("token=")[-1]
        decoded_1 = jwt.decode(token_1, SECRET, algorithms=[SSO_ALGORITHM],
                               audience=SSO_AUDIENCE, issuer=SSO_ISSUER)
        decoded_2 = jwt.decode(token_2, SECRET, algorithms=[SSO_ALGORITHM],
                               audience=SSO_AUDIENCE, issuer=SSO_ISSUER)
        assert decoded_1["jti"] != decoded_2["jti"]
