"""Middlewares custom do ERP — cabeçalhos de segurança complementares.

O Django já define via settings.py: HSTS, X-Frame-Options, Referrer-Policy,
Content-Type nosniff, XSS-Protection. Aqui adicionamos:
- Content-Security-Policy (restritivo, compatível com Next.js + Tailwind)
- Permissions-Policy (restringe APIs do browser que não usamos)
- Cross-Origin-Opener-Policy (COOP) para isolamento de origin
"""

# Política base — permite apenas o próprio host + recursos inline necessários
# para Next.js SSR e Tailwind runtime. Migração para nonces é um passo futuro.
_CSP_POLICY = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: https:; "
    "font-src 'self' data:; "
    "connect-src 'self'; "
    "frame-src 'self'; "
    "media-src 'self'; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "form-action 'self'; "
    "frame-ancestors 'none'; "
    "upgrade-insecure-requests"
)

# Permissions-Policy — desativa APIs que não usamos. Reduz superfície em
# caso de XSS (atacante não pode pedir geolocation/camera por ex.).
_PERMISSIONS_POLICY = (
    "accelerometer=(), "
    "autoplay=(), "
    "camera=(), "
    "display-capture=(), "
    "geolocation=(), "
    "gyroscope=(), "
    "magnetometer=(), "
    "microphone=(), "
    "payment=(), "
    "usb=()"
)


class SecurityHeadersMiddleware:
    """Adiciona CSP + Permissions-Policy + COOP em todas as respostas.

    Se a view já setou Content-Security-Policy (ex: ProposalPublicHTMLView
    com política mais restritiva para HTML servido), preservamos o valor
    existente — as views sabem melhor o que precisam.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        # Preserva CSP já definido por views específicas (ex: proposta pública)
        if 'Content-Security-Policy' not in response:
            response['Content-Security-Policy'] = _CSP_POLICY
        if 'Permissions-Policy' not in response:
            response['Permissions-Policy'] = _PERMISSIONS_POLICY
        if 'Cross-Origin-Opener-Policy' not in response:
            response['Cross-Origin-Opener-Policy'] = 'same-origin'
        return response
