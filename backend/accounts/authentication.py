from django.middleware.csrf import CsrfViewMiddleware
from rest_framework import exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication


class _CSRFCheck(CsrfViewMiddleware):
    """Subclasse so para chamar metodos protected do CsrfViewMiddleware."""

    def _reject(self, request, reason):
        # Override: nao queremos retornar HttpResponse, so capturar a razao.
        return reason


class JWTCookieAuthentication(JWTAuthentication):
    """
    Autentica via cookie httpOnly 'access_token'.
    Mantém suporte a header Authorization: Bearer <token> para
    compatibilidade com testes e clientes de API externos.

    S7C2: quando o token vem do COOKIE (e nao do header Authorization), o
    request e potencialmente vulneravel a CSRF — atacante hospeda formulario
    em outro dominio e o browser anexa o cookie automaticamente. Aplicamos
    double-submit token: cliente deve enviar `X-CSRFToken` header batendo
    com o cookie `csrftoken` (que JS le do dominio do ERP). Atacante cross-origin
    nao pode ler o cookie do ERP, entao nao consegue forjar o header.

    Auth via Bearer header esta isento porque atacante CSRF nao pode setar
    headers customizados em requests cross-site (precisa de XMLHttpRequest com
    consentimento via CORS).
    """

    def authenticate(self, request):
        # Header tem prioridade (testes, Swagger, clientes externos)
        header = self.get_header(request)
        if header is not None:
            return super().authenticate(request)

        raw_token = request.COOKIES.get('access_token')
        if raw_token is None:
            return None

        validated_token = self.get_validated_token(raw_token)
        user = self.get_user(validated_token)

        # S7C2: enforce CSRF apenas em metodos nao-safe quando autenticado
        # via cookie. SAFE_METHODS (GET/HEAD/OPTIONS/TRACE) sao isentos.
        if request.method not in ('GET', 'HEAD', 'OPTIONS', 'TRACE'):
            self.enforce_csrf(request)

        return (user, validated_token)

    def enforce_csrf(self, request):
        """Executa o check de CSRF do Django (double-submit cookie pattern)."""
        def dummy_get_response(req):
            return None
        check = _CSRFCheck(dummy_get_response)
        check.process_request(request)
        reason = check.process_view(request, None, (), {})
        if reason:
            raise exceptions.PermissionDenied(f'CSRF Failed: {reason}')
