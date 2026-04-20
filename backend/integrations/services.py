"""SSO token service for the Inova Apresentação companion app.

The ERP issues a short-lived (≤120s), single-use JWT (HS256) carrying just
enough user context for the Apresentação to provision/refresh a local user
and grant a session — without sharing the ERP password database.

The shared secret (``PRESENTATION_SHARED_SECRET``) MUST be identical on both
sides. Tokens are signed with HS256 and validated against the same secret.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING
from urllib.parse import urlencode

import jwt
from django.conf import settings

if TYPE_CHECKING:
    from accounts.models import User


SSO_TOKEN_TTL_SECONDS = 120
SSO_ALGORITHM = "HS256"
SSO_ISSUER = "inova-erp"
SSO_AUDIENCE = "inova-presentations"


class SSOConfigError(RuntimeError):
    """Raised when the SSO is not properly configured."""


def _require_secret() -> str:
    secret = getattr(settings, "PRESENTATION_SHARED_SECRET", None)
    if not secret:
        raise SSOConfigError(
            "PRESENTATION_SHARED_SECRET is not configured. "
            "Set it in your environment to enable Presentations SSO."
        )
    return secret


def _require_base_url() -> str:
    url = getattr(settings, "PRESENTATION_BASE_URL", None)
    if not url:
        raise SSOConfigError(
            "PRESENTATION_BASE_URL is not configured. "
            "Set it in your environment (e.g. https://apresentacao.inovasystemssolutions.com)."
        )
    return url.rstrip("/")


def issue_sso_token(user: "User") -> str:
    """Mint a short-lived signed JWT carrying the user identity.

    The Apresentação will validate this token and provision/refresh its own
    local user record before issuing its own session JWT.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "iss":  SSO_ISSUER,
        "aud":  SSO_AUDIENCE,
        "iat":  int(now.timestamp()),
        "exp":  int((now + timedelta(seconds=SSO_TOKEN_TTL_SECONDS)).timestamp()),
        "jti":  str(uuid.uuid4()),
        "sub":  str(user.pk),
        "email": user.email,
        "name":  user.get_full_name() or user.username,
        "role":  getattr(user, "role", "operator"),
    }
    return jwt.encode(payload, _require_secret(), algorithm=SSO_ALGORITHM)


def build_launch_url(user: "User") -> str:
    """Build the full URL the user should be redirected to."""
    token = issue_sso_token(user)
    base = _require_base_url()
    return f"{base}/sso/launch?{urlencode({'token': token})}"
