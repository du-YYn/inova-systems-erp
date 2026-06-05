import hmac
import logging
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import BasePermission
from django.conf import settings

logger = logging.getLogger('sales')


class N8NApiKeyAuthentication(BaseAuthentication):
    """
    Autenticacao via X-API-Key para integracao machine-to-machine com n8n.
    A chave e definida na env var N8N_API_KEY.
    Usa comparacao timing-safe (hmac.compare_digest) para prevenir timing attacks.
    """

    def authenticate(self, request):
        api_key = request.headers.get('X-API-Key', '')
        if not api_key:
            return None  # Nao tenta autenticar — deixa para outro backend

        expected_key = getattr(settings, 'N8N_API_KEY', '')
        if not expected_key:
            logger.error('N8N_API_KEY not configured in settings')
            raise AuthenticationFailed('Server misconfiguration')

        if not hmac.compare_digest(api_key, expected_key):
            logger.warning(
                f"Invalid n8n API key from {request.META.get('REMOTE_ADDR', 'unknown')}"
            )
            raise AuthenticationFailed('Invalid API key')

        # Retorna um user bot dedicado para rastreabilidade no CRM
        from django.contrib.auth import get_user_model
        User = get_user_model()
        # S7B.9: is_active=True — IsAuthenticated checa is_active.
        # Antes: is_active=False mas .is_authenticated retornava True
        # (inconsistente com o restante do RBAC). Em paralelo criamos
        # IsN8NBot abaixo para que outros endpoints possam exigir explícito
        # que a requisição venha do bot (não confundir com operator humano
        # com 'n8n-bot' digitado como username).
        try:
            n8n_user, created = User.objects.get_or_create(
                username='n8n-bot',
                defaults={
                    'first_name': 'n8n',
                    'last_name': 'Automation',
                    'email': 'n8n-bot@inovasystems.com.br',
                    'role': 'operator',
                    'is_active': True,
                },
            )
            # Self-heal: se o bot foi marcado is_active=False em um deploy
            # anterior, conserta agora (manter ativo enquanto auth via API
            # key estiver habilitada).
            if not created and not n8n_user.is_active:
                n8n_user.is_active = True
                n8n_user.save(update_fields=['is_active'])
        except Exception:
            n8n_user = User.objects.get(username='n8n-bot')

        return (n8n_user, 'n8n-api-key')

    def authenticate_header(self, request):
        return 'X-API-Key'


class IsN8NBot(BasePermission):
    """S7B.9: permission dedicada que exige autenticação via N8N API key.

    Defesa em profundidade — mesmo que um usuário humano consiga criar uma
    conta com username 'n8n-bot' (improvável: registro é admin-only desde
    F2.1), só passa se request.auth foi setado por N8NApiKeyAuthentication.
    """
    message = 'Endpoint restrito ao bot n8n.'

    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.auth == 'n8n-api-key'
        )
