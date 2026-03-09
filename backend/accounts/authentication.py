from rest_framework_simplejwt.authentication import JWTAuthentication


class JWTCookieAuthentication(JWTAuthentication):
    """
    Autentica via cookie httpOnly 'access_token'.
    Mantém suporte a header Authorization: Bearer <token> para
    compatibilidade com testes e clientes de API externos.
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
        return self.get_user(validated_token), validated_token
