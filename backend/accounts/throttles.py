from rest_framework.throttling import AnonRateThrottle, UserRateThrottle, SimpleRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    """Máximo 5 tentativas de login por minuto por IP."""
    scope = 'login'


class PasswordResetThrottle(AnonRateThrottle):
    """Máximo 3 pedidos de reset de senha por hora por IP."""
    scope = 'password_reset'


class TwoFactorRateThrottle(AnonRateThrottle):
    """Máximo 5 tentativas de código 2FA por minuto por IP (settings.py:224)."""
    scope = 'two_factor'


class ChangePasswordThrottle(UserRateThrottle):
    """S7H: 5 trocas de senha por hora por usuario autenticado.

    Protege contra abuso do endpoint (ex: atacante com sessao roubada
    nao consegue rotar senha repetidamente para tentar quebrar TOTP).
    """
    scope = 'change_password'


class PasswordResetEmailThrottle(SimpleRateThrottle):
    """S7H: throttle composto IP+email para password reset.

    Limita 1 reset/hora por combinacao (ip, email). Empilhado com
    PasswordResetThrottle (3/h por IP) — atacante com 1 IP rotando emails
    bate em PasswordResetThrottle; atacante com pool de IPs mas mesmo
    email-alvo bate aqui.
    """
    scope = 'password_reset_email'

    def get_cache_key(self, request, view):
        # Email pode estar em data (POST padrao) ou query (raro).
        # Se nao houver email, nao throttla (cai no PasswordResetThrottle).
        email = ''
        if hasattr(request, 'data') and isinstance(request.data, dict):
            email = (request.data.get('email') or '').strip().lower()
        if not email:
            return None
        ident = self.get_ident(request)
        return self.cache_format % {
            'scope': self.scope,
            'ident': f'{ident}:{email}',
        }
