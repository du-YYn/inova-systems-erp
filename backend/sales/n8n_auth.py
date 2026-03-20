import hmac
import logging
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
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
        try:
            n8n_user, _ = User.objects.get_or_create(
                username='n8n-bot',
                defaults={
                    'first_name': 'n8n',
                    'last_name': 'Automation',
                    'email': 'n8n-bot@inovasystems.com.br',
                    'role': 'operator',
                    'is_active': False,
                },
            )
        except Exception:
            n8n_user = User.objects.get(username='n8n-bot')

        return (n8n_user, 'n8n-api-key')

    def authenticate_header(self, request):
        return 'X-API-Key'
