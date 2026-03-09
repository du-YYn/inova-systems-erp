from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    """Máximo 5 tentativas de login por minuto por IP."""
    scope = 'login'


class PasswordResetThrottle(AnonRateThrottle):
    """Máximo 3 pedidos de reset de senha por hora por IP."""
    scope = 'password_reset'
