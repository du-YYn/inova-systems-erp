"""SSO inbound: validates a short-lived JWT issued by the Inova ERP and
provisions/refreshes the matching local user, returning a normal JWT pair."""
from __future__ import annotations

import secrets

import jwt
from django.conf import settings
from django.core.cache import cache
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Usuario
from .serializers import UsuarioSerializer

SSO_ALGORITHM = "HS256"
SSO_ISSUER = "inova-erp"
SSO_AUDIENCE = "inova-presentations"
JTI_CACHE_PREFIX = "sso:jti:"


class _SSOExchangeThrottle(ScopedRateThrottle):
    scope = "sso_exchange"


def _decode(token: str) -> dict:
    secret = getattr(settings, "PRESENTATION_SHARED_SECRET", "")
    if not secret:
        raise jwt.PyJWTError("PRESENTATION_SHARED_SECRET não configurado")
    return jwt.decode(
        token,
        secret,
        algorithms=[SSO_ALGORITHM],
        audience=SSO_AUDIENCE,
        issuer=SSO_ISSUER,
        options={"require": ["exp", "iat", "jti", "sub", "email"]},
    )


def _provision_user(payload: dict) -> Usuario:
    email = (payload.get("email") or "").strip().lower()
    nome  = (payload.get("name")  or "").strip() or email.split("@")[0]
    user, created = Usuario.objects.get_or_create(
        email=email, defaults={"nome": nome},
    )
    if created:
        # Random unusable password — the user can never sign in via password
        # locally; only via SSO. They could still reset via password-reset flow
        # if/when implemented.
        user.set_password(secrets.token_urlsafe(40))
        user.save(update_fields=["password"])
    elif user.nome != nome and nome:
        user.nome = nome
        user.save(update_fields=["nome"])
    return user


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([_SSOExchangeThrottle])
def sso_exchange(request):
    """Trade an ERP-signed SSO token for a Presentation JWT pair."""
    token = (request.data or {}).get("token", "")
    if not token:
        return Response({"erro": "token-ausente"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        payload = _decode(token)
    except jwt.ExpiredSignatureError:
        return Response({"erro": "token-expirado"}, status=status.HTTP_401_UNAUTHORIZED)
    except jwt.InvalidTokenError as exc:
        return Response({"erro": "token-invalido", "detalhe": str(exc)},
                        status=status.HTTP_401_UNAUTHORIZED)
    except jwt.PyJWTError:
        return Response({"erro": "sso-indisponivel"},
                        status=status.HTTP_503_SERVICE_UNAVAILABLE)

    jti = payload["jti"]
    cache_key = f"{JTI_CACHE_PREFIX}{jti}"
    # Anti-replay: if jti was seen before, refuse. TTL = remaining seconds + 60s margin.
    ttl = max(int(payload["exp"]) - int(payload["iat"]) + 60, 60)
    if not cache.add(cache_key, "1", timeout=ttl):
        return Response({"erro": "token-ja-utilizado"}, status=status.HTTP_409_CONFLICT)

    user = _provision_user(payload)
    refresh = RefreshToken.for_user(user)
    refresh["nome"] = user.nome
    refresh["email"] = user.email
    return Response({
        "access":  str(refresh.access_token),
        "refresh": str(refresh),
        "usuario": UsuarioSerializer(user).data,
    })
