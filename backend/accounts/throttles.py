from rest_framework.throttling import AnonRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    """Máximo 5 tentativas de login por minuto por IP."""
    scope = 'login'


class PasswordResetThrottle(AnonRateThrottle):
    """Máximo 3 pedidos de reset de senha por hora por IP."""
    scope = 'password_reset'


class TwoFactorRateThrottle(AnonRateThrottle):
    """Máximo 10 tentativas de código 2FA por hora por IP."""
    scope = 'two_factor'
