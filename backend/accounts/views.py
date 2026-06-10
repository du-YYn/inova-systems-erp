import logging
from rest_framework import status, generics
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.exceptions import TokenError
from django.conf import settings as django_settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from datetime import timedelta
from drf_spectacular.utils import extend_schema
from core.audit import log_audit
import pyotp
import qrcode
import io
import base64
import secrets

from .serializers import (
    UserSerializer, RegisterSerializer, LoginSerializer,
    TwoFactorVerifySerializer, PasswordResetRequestSerializer,
    ChangePasswordSerializer, AdminUserSerializer, AdminUserCreateSerializer,
)
from .permissions import IsAdmin
from .throttles import (
    LoginRateThrottle, PasswordResetThrottle, TwoFactorRateThrottle,
    ChangePasswordThrottle, PasswordResetEmailThrottle,
)
from .tasks import send_password_reset_email
from core.logging_utils import mask_email

logger = logging.getLogger('accounts')
User = get_user_model()

_SECURE = getattr(django_settings, 'JWT_COOKIE_SECURE', False)
_SAMESITE = getattr(django_settings, 'JWT_COOKIE_SAMESITE', 'Lax')
_COOKIE_DOMAIN = getattr(django_settings, 'JWT_COOKIE_DOMAIN', None)  # .inovasystemssolutions.com


def _set_csrf_cookie(response: Response, request) -> None:
    """S7C2: garante que o cookie `csrftoken` esta na resposta.

    Usa get_token(request) do Django que gera token se nao existe e marca o
    request para o CsrfViewMiddleware emitir o Set-Cookie no response. Como
    JWTCookieAuthentication isenta o login do check (Bearer/AllowAny), o
    middleware nao reseta o token entre requests legitimas.
    """
    from django.middleware.csrf import get_token
    # Forca a geracao + flag de envio do cookie pelo CsrfViewMiddleware
    get_token(request)


def _set_auth_cookies(response: Response, refresh: RefreshToken, user=None, request=None) -> None:
    """Define os cookies httpOnly de access e refresh token na resposta.

    S7C2: chamadores devem passar `request` para que o CSRF cookie seja
    emitido junto. Sem request, mantemos compatibilidade mas o token CSRF
    nao e setado (chamadores antigos / fluxos de teste).
    """
    common = dict(
        secure=_SECURE,
        samesite=_SAMESITE,
        path='/',
    )
    if _COOKIE_DOMAIN:
        common['domain'] = _COOKIE_DOMAIN

    response.set_cookie(
        'access_token',
        str(refresh.access_token),
        max_age=int(django_settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds()),
        httponly=True,
        **common,
    )
    response.set_cookie(
        'refresh_token',
        str(refresh),
        max_age=int(django_settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
        httponly=True,
        **common,
    )
    # Cookie de sessão lido pelo middleware Next.js (server-side, logo
    # httpOnly é transparente) para proteção de rotas.
    # httponly=True evita que XSS possa ler/forjar o cookie via document.cookie.
    response.set_cookie(
        'inova_session',
        '1',
        max_age=int(django_settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
        httponly=True,
        **common,
    )
    # Role hint para middleware redirecionar parceiros ao portal correto.
    # httpOnly para impedir leitura via XSS e spoofing client-side.
    if user and hasattr(user, 'role'):
        response.set_cookie(
            'inova_role',
            user.role,
            max_age=int(django_settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
            httponly=True,
            **common,
        )

    # S7C2: csrftoken cookie (NAO httpOnly — JS le e manda em X-CSRFToken).
    if request is not None:
        _set_csrf_cookie(response, request)


def _clear_auth_cookies(response: Response) -> None:
    """Remove todos os cookies de autenticação."""
    kwargs = {'path': '/'}
    if _COOKIE_DOMAIN:
        kwargs['domain'] = _COOKIE_DOMAIN
    for name in ('access_token', 'refresh_token', 'inova_session', 'inova_role'):
        response.delete_cookie(name, **kwargs)
    # S7C2: csrftoken usa configuracao do Django (CSRF_COOKIE_NAME default
    # 'csrftoken'). Passamos os mesmos kwargs do CsrfViewMiddleware.
    response.delete_cookie('csrftoken', **kwargs)


@extend_schema(tags=['auth'])
class RegisterView(generics.CreateAPIView):
    """Cadastro de usuario — restrito a admin (F2.1).

    Antes era AllowAny, o que permitia qualquer internauta criar conta
    com role operator (CWE-306/862, OWASP A01:2021 — Broken Access Control).
    Como o frontend nao usa este endpoint (verificado no audit), restringir
    para IsAdmin nao quebra nenhum fluxo de usuario.

    Para criar primeiro admin quando DB esta vazio, usar:
        python manage.py createsuperuser
    """
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [IsAdmin]


@extend_schema(tags=['auth'], summary='Login com username/senha')
class LoginView(APIView):
    permission_classes = [AllowAny]
    # S7C2: isenta JWTCookieAuthentication para evitar CSRF check no proprio
    # login (user com cookie stale nao consegue relogar sem header X-CSRFToken).
    authentication_classes = []
    throttle_classes = [LoginRateThrottle]

    # S7H: lockout exponencial — janelas em minutos para failed_attempts >= 5.
    # 5° fail = 15min, 6° = 30min, 7° = 1h, 8° = 2h, 9° = 4h, 10°+ = 8h (cap).
    LOCKOUT_THRESHOLD = 5
    LOCKOUT_BASE_MINUTES = 15

    def _compute_lockout(self, failed_attempts: int):
        """Retorna timedelta de lockout para o n-esimo fail (n >= THRESHOLD)."""
        # 15 * 2^min(n-5, 5) = 15, 30, 60, 120, 240, 480
        exp = min(failed_attempts - self.LOCKOUT_THRESHOLD, 5)
        return timedelta(minutes=self.LOCKOUT_BASE_MINUTES * (2 ** exp))

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        login_input = serializer.validated_data['username']
        password = serializer.validated_data['password']

        # S7H: lookup do user ANTES de authenticate() — necessario para:
        # 1) checar lockout antes de queimar PBKDF2;
        # 2) incrementar failed_attempts em falha;
        # 3) timing-safe: se user nao existe, ainda queimamos PBKDF2 com
        #    authenticate(dummy) para equalizar latencia (account enum).
        User = get_user_model()
        username = login_input
        found_user = None
        if '@' in login_input:
            try:
                found_user = User.objects.get(email=login_input)
                username = found_user.username
            except User.DoesNotExist:
                pass
        else:
            try:
                found_user = User.objects.get(username=login_input)
            except User.DoesNotExist:
                pass

        # S7H: lockout — bloquear ANTES de authenticate() (nao queimamos
        # PBKDF2 nem revelamos diferenca de tempo entre bloqueado/destrancado).
        if found_user and found_user.locked_until and found_user.locked_until > timezone.now():
            # Resposta generica (mesma 401 de credencial invalida) para nao
            # facilitar enumeracao. Mensagem dedicada apenas se quisermos
            # UX explicita — mantemos generica por seguranca.
            logger.warning("Login bloqueado: usuario sob lockout")
            return Response(
                {'error': 'Credenciais inválidas'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        if found_user:
            user = authenticate(username=username, password=password)
        else:
            # S7H: timing-safe — queima PBKDF2 mesmo sem user, para
            # equalizar latencia com fluxo normal (~200ms).
            authenticate(username='__s7h_timing_safe_dummy__', password=password)
            user = None

        if not user:
            # S7H: incrementa failed_attempts se user existe; aplica lockout
            # apos THRESHOLD. Se nao existe, nao criamos ghost record.
            if found_user:
                found_user.failed_attempts = (found_user.failed_attempts or 0) + 1
                if found_user.failed_attempts >= self.LOCKOUT_THRESHOLD:
                    found_user.locked_until = timezone.now() + self._compute_lockout(found_user.failed_attempts)
                found_user.save(update_fields=['failed_attempts', 'locked_until'])
            # S7H: log sem revelar existencia do usuario.
            logger.warning("Login falhou para tentativa")
            return Response(
                {'error': 'Credenciais inválidas'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        if not user.is_active:
            return Response(
                {'error': 'Usuário inativo'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # S7H: sucesso de autenticacao — zerar contadores de falha.
        # Feito antes de gerar JWT para que mesmo se a geracao falhar o
        # contador nao fique inflado.
        if user.failed_attempts or user.locked_until:
            user.failed_attempts = 0
            user.locked_until = None
            user.save(update_fields=['failed_attempts', 'locked_until'])

        if user.is_2fa_enabled:
            import hashlib
            temp_token = secrets.token_urlsafe(32)
            user.temp_2fa_token = hashlib.sha256(temp_token.encode()).hexdigest()
            # TTL reduzido de 10min → 3min: se temp_token vazar (logs, erros,
            # MitM em HTTP) o atacante tem apenas 3 min para brute-force do
            # código TOTP. Combinado com o rate limit de 5/min do endpoint,
            # o espaço de busca efetivo fica << 1M combinações.
            user.temp_2fa_expires = timezone.now() + timedelta(minutes=3)
            # S7H: zerar tentativas de TOTP — comeca fresh em cada login.
            user.temp_2fa_attempts = 0
            user.save(update_fields=['temp_2fa_token', 'temp_2fa_expires', 'temp_2fa_attempts'])
            return Response({
                'requires_2fa': True,
                'temp_token': temp_token,
                'message': 'Código 2FA requerido'
            })

        logger.info(f"Login bem-sucedido: {user.username} (role={user.role})")
        log_audit(user, 'login', 'user', user.id)
        refresh = RefreshToken.for_user(user)
        response_data = {'user': UserSerializer(user).data}
        # F0: enforcement de 2FA para admins (fase 1). Login segue valido
        # (bloquear aqui poderia trancar o unico admin fora do sistema),
        # mas o frontend recebe a flag e forca a tela de setup antes de
        # liberar navegacao. Hard-block no backend entra na F2.
        if (
            getattr(django_settings, 'ENFORCE_ADMIN_2FA', False)
            and user.role == 'admin'
            and not user.is_2fa_enabled
        ):
            response_data['must_setup_2fa'] = True
            logger.warning(f"Admin sem 2FA logou: {user.username} (setup obrigatorio)")
            log_audit(user, '2fa_setup_required', 'user', user.id)
        response = Response(response_data)
        _set_auth_cookies(response, refresh, user=user, request=request)
        return response


@extend_schema(tags=['auth'], summary='Verificar código TOTP (2FA)')
class TwoFactorVerifyView(APIView):
    permission_classes = [AllowAny]
    # S7C2: isenta JWTCookieAuthentication (mesmo motivo do LoginView)
    authentication_classes = []
    throttle_classes = [TwoFactorRateThrottle]

    def post(self, request):
        serializer = TwoFactorVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        import hashlib
        temp_token = request.data.get('temp_token')
        code = serializer.validated_data['code']
        token_hash = hashlib.sha256(temp_token.encode()).hexdigest() if temp_token else ''

        try:
            user = User.objects.get(temp_2fa_token=token_hash)
        except User.DoesNotExist:
            return Response({'error': 'Token inválido'}, status=status.HTTP_401_UNAUTHORIZED)

        # S7H: bloqueia 2FA para usuario desativado entre login e verify.
        if not user.is_active:
            return Response(
                {'error': 'Usuário inativo'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        if user.temp_2fa_expires and user.temp_2fa_expires < timezone.now():
            user.temp_2fa_token = None
            user.temp_2fa_expires = None
            user.temp_2fa_attempts = 0
            user.save(update_fields=['temp_2fa_token', 'temp_2fa_expires', 'temp_2fa_attempts'])
            return Response({'error': 'Token expirado, faça login novamente'}, status=status.HTTP_401_UNAUTHORIZED)

        # F3b: get_totp_secret() decifra (com fail-safe para legado plain-text)
        totp = pyotp.TOTP(user.get_totp_secret())
        if not totp.verify(code):
            # S7H: incrementa contador; apos 5 falhas, invalida temp_token
            # forcando novo login (e novo temp_token).
            user.temp_2fa_attempts = (user.temp_2fa_attempts or 0) + 1
            if user.temp_2fa_attempts >= 5:
                user.temp_2fa_token = None
                user.temp_2fa_expires = None
                user.temp_2fa_attempts = 0
                user.save(update_fields=['temp_2fa_token', 'temp_2fa_expires', 'temp_2fa_attempts'])
                logger.warning(f"2FA: 5 falhas — temp_token invalidado para {user.username}")
                return Response(
                    {'error': 'Muitas tentativas inválidas. Faça login novamente.'},
                    status=status.HTTP_401_UNAUTHORIZED
                )
            user.save(update_fields=['temp_2fa_attempts'])
            logger.warning("Código 2FA inválido")
            return Response({'error': 'Código 2FA inválido'}, status=status.HTTP_401_UNAUTHORIZED)

        # S7H: zerar contadores em sucesso.
        user.temp_2fa_token = None
        user.temp_2fa_expires = None
        user.temp_2fa_attempts = 0
        user.save(update_fields=['temp_2fa_token', 'temp_2fa_expires', 'temp_2fa_attempts'])

        logger.info(f"2FA OK: {user.username}")
        refresh = RefreshToken.for_user(user)
        response = Response({'user': UserSerializer(user).data})
        _set_auth_cookies(response, refresh, user=user, request=request)
        return response


@extend_schema(tags=['auth'], summary='Ativar/desativar 2FA para o usuário autenticado')
class TwoFactorSetupView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        # F2.7: tanto enable quanto disable exigem re-autenticacao por senha.
        # Previne "hostage attack" — atacante com cookie roubado ativando 2FA
        # com segredo que ele controla, deixando a vitima sem acesso.
        password = request.data.get('password', '')
        if not password or not user.check_password(password):
            return Response(
                {'error': 'Senha incorreta. Confirme sua senha para alterar o 2FA.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if user.is_2fa_enabled:
            user.is_2fa_enabled = False
            user.totp_secret = ''
            user.save(update_fields=['is_2fa_enabled', 'totp_secret'])
            logger.info(f"2FA desativado: {user.username}")
            log_audit(user, '2fa_toggle', 'user', user.id, 'disabled')
            return Response({'message': '2FA desativado', 'enabled': False})

        # F3b: segredo armazenado cifrado via set_totp_secret()
        secret = pyotp.random_base32()
        user.set_totp_secret(secret)
        user.is_2fa_enabled = True
        user.save(update_fields=['totp_secret', 'is_2fa_enabled'])

        # F2.7: invalida outras sessoes ativas — se alguem tinha cookies
        # roubados, perde acesso obrigando novo login (agora com 2FA).
        try:
            from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
            OutstandingToken.objects.filter(user=user).update(expires_at=timezone.now())
        except Exception as exc:
            logger.warning(f"2FA enable: falha ao invalidar tokens para {user.username}: {exc}")

        totp = pyotp.TOTP(secret)
        provisioning_uri = totp.provisioning_uri(
            user.email or user.username,
            issuer_name='Inova Systems ERP'
        )

        img = qrcode.make(provisioning_uri)
        buffered = io.BytesIO()
        img.save(buffered, format='PNG')
        qr_code_b64 = base64.b64encode(buffered.getvalue()).decode()

        logger.info(f"2FA ativado: {user.username}")
        log_audit(user, '2fa_toggle', 'user', user.id, 'enabled')
        return Response({
            'secret': secret,
            'qr_code': f'data:image/png;base64,{qr_code_b64}',
            'enabled': True
        })


@extend_schema(tags=['auth'])
class ProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


@extend_schema(tags=['auth'], summary='Alterar senha do usuário autenticado')
class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]
    # S7H: 5 trocas de senha por hora — protege contra abuso (sessao roubada
    # tentando rotar senha rapido, brute-force de senha atual).
    throttle_classes = [ChangePasswordThrottle]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        if not user.check_password(serializer.validated_data['old_password']):
            return Response({'error': 'Senha atual incorreta'}, status=status.HTTP_400_BAD_REQUEST)

        # S7H: se 2FA esta ativo, exigir codigo TOTP como segundo fator.
        # Protege contra sessao sequestrada (cookie roubado nao basta —
        # atacante tambem precisa do segredo TOTP do dispositivo).
        if user.is_2fa_enabled:
            totp_code = request.data.get('totp_code', '')
            if not totp_code:
                return Response(
                    {'error': 'Código 2FA é obrigatório para alterar a senha'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            totp = pyotp.TOTP(user.get_totp_secret())
            if not totp.verify(totp_code):
                logger.warning(f"ChangePassword: codigo 2FA invalido para {user.username}")
                return Response(
                    {'error': 'Código 2FA inválido'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        try:
            validate_password(serializer.validated_data['new_password'], user=user)
        except DjangoValidationError as e:
            return Response({'error': list(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(serializer.validated_data['new_password'])
        user.save(update_fields=['password'])
        logger.info(f"Senha alterada: {user.username}")
        log_audit(user, 'password_change', 'user', user.id)
        return Response({'message': 'Senha alterada com sucesso'})


@extend_schema(tags=['auth'], summary='Encerrar sessão e invalidar refresh token')
class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # S7H: aceitar apenas cookie httpOnly (nao request.data) — refresh
        # via body permite que JS comprometido por XSS reproduza logout
        # com tokens arbitrarios. Cookie httpOnly nao e legivel por JS.
        refresh_token = request.COOKIES.get('refresh_token')
        if not refresh_token:
            return Response(
                {'error': 'Refresh token não encontrado'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except (KeyError, ValueError, TypeError, TokenError):
            pass
        logger.info(f"Logout: {request.user.username}")
        log_audit(request.user, 'logout', 'user', request.user.id)
        response = Response({'message': 'Logout realizado'})
        _clear_auth_cookies(response)
        return response


@extend_schema(tags=['auth'], summary='Solicitar link de redefinição de senha por email')
class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []  # S7C2
    # S7H: throttle empilhado — PasswordResetThrottle limita IP (3/h, anti-abuso
    # generico); PasswordResetEmailThrottle limita IP+email (1/h, anti-flood
    # por destinatario). Soft-cap por-email no save protege contra rotacao de IPs.
    throttle_classes = [PasswordResetThrottle, PasswordResetEmailThrottle]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        # Mesma resposta independente de o email existir (evita enumeração)
        safe_response = Response({'message': 'Se o email existir, você receberá instruções'})

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return safe_response

        # S7H: soft-cap por-email (1 reset/hora por usuario, independente de IP).
        # Protege contra atacante com pool de IPs floodando o mailbox da vitima.
        # Mantemos safe_response (anti-enumeracao) — atacante nao distingue
        # "rate-limited" de "email nao existe".
        if user.password_reset_last_sent and (
            timezone.now() - user.password_reset_last_sent < timedelta(hours=1)
        ):
            logger.info(f"Password reset suprimido (soft-cap 1h): {mask_email(email)}")
            return safe_response

        import hashlib
        token = secrets.token_urlsafe(32)
        user.password_reset_token = hashlib.sha256(token.encode()).hexdigest()
        user.password_reset_expires = timezone.now() + timedelta(hours=24)
        user.password_reset_last_sent = timezone.now()
        user.save(update_fields=[
            'password_reset_token', 'password_reset_expires', 'password_reset_last_sent',
        ])

        send_password_reset_email.delay(user.id, token)
        logger.info(f"Task de reset de senha enfileirada para: {mask_email(email)}")

        return safe_response


@extend_schema(tags=['auth'], summary='Confirmar redefinição de senha com token')
class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []  # S7C2

    def post(self, request):
        import hashlib
        token = request.data.get('token')
        new_password = request.data.get('new_password')

        if not token or not new_password:
            return Response(
                {'error': 'Token e nova senha são obrigatórios'},
                status=status.HTTP_400_BAD_REQUEST
            )
        token_hash = hashlib.sha256(token.encode()).hexdigest()

        try:
            user = User.objects.get(password_reset_token=token_hash)
        except User.DoesNotExist:
            return Response({'error': 'Token inválido ou expirado'}, status=status.HTTP_400_BAD_REQUEST)

        if not user.password_reset_expires or user.password_reset_expires < timezone.now():
            return Response({'error': 'Token expirado'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as e:
            return Response({'error': list(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.password_reset_token = None
        user.password_reset_expires = None
        user.save(update_fields=['password', 'password_reset_token', 'password_reset_expires'])

        logger.info(f"Senha redefinida via token: {user.username}")
        log_audit(user, 'password_reset', 'user', user.id)
        return Response({'message': 'Senha redefinida com sucesso'})


@extend_schema(tags=['auth'], summary='Listar e criar usuários (somente admin)')
class UserListView(generics.ListCreateAPIView):
    queryset = User.objects.all().order_by('-created_at')
    serializer_class = AdminUserSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        role = self.request.query_params.get('role')
        search = self.request.query_params.get('search')
        if role:
            qs = qs.filter(role=role)
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(email__icontains=search) |
                Q(username__icontains=search)
            )
        return qs

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return AdminUserCreateSerializer
        return AdminUserSerializer

    def perform_create(self, serializer):
        serializer.save()


@extend_schema(tags=['auth'], summary='Detalhar, atualizar e remover usuário (somente admin)')
class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = User.objects.all()
    serializer_class = AdminUserSerializer
    permission_classes = [IsAdmin]

    def destroy(self, request, *args, **kwargs):
        user = self.get_object()
        if user == request.user:
            return Response({'error': 'Não é possível remover o próprio usuário.'}, status=status.HTTP_400_BAD_REQUEST)
        log_audit(request.user, 'user_delete', 'user', user.id, f'deleted user: {user.username}')
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=['auth'], summary='Renovar access token via cookie de refresh')
class CookieTokenRefreshView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []  # S7C2

    def post(self, request):
        refresh_token = request.COOKIES.get('refresh_token')
        if not refresh_token:
            return Response(
                {'error': 'Refresh token não encontrado'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        serializer = TokenRefreshSerializer(data={'refresh': refresh_token})
        try:
            serializer.is_valid(raise_exception=True)
        except (ValueError, TypeError, Exception):  # TokenError subclasses Exception
            response = Response(
                {'error': 'Token inválido ou expirado'},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            _clear_auth_cookies(response)
            return response

        response = Response({'message': 'Token renovado'})
        # Seta novo access_token; se ROTATE_REFRESH_TOKENS=True, seta novo refresh também
        access = serializer.validated_data['access']
        response.set_cookie(
            'access_token', access,
            max_age=int(django_settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds()),
            httponly=True, secure=_SECURE, samesite=_SAMESITE, path='/',
        )
        if 'refresh' in serializer.validated_data:
            response.set_cookie(
                'refresh_token', serializer.validated_data['refresh'],
                max_age=int(django_settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
                httponly=True, secure=_SECURE, samesite=_SAMESITE, path='/',
            )
        # S7C2: revalida csrftoken para nao expirar enquanto o usuario esta ativo.
        _set_csrf_cookie(response, request)
        return response
