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
from .throttles import LoginRateThrottle, PasswordResetThrottle, TwoFactorRateThrottle
from .tasks import send_password_reset_email
from core.logging_utils import mask_email

logger = logging.getLogger('accounts')
User = get_user_model()

_SECURE = getattr(django_settings, 'JWT_COOKIE_SECURE', False)
_SAMESITE = getattr(django_settings, 'JWT_COOKIE_SAMESITE', 'Lax')
_COOKIE_DOMAIN = getattr(django_settings, 'JWT_COOKIE_DOMAIN', None)  # .inovasystemssolutions.com


def _set_auth_cookies(response: Response, refresh: RefreshToken, user=None) -> None:
    """Define os cookies httpOnly de access e refresh token na resposta."""
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


def _clear_auth_cookies(response: Response) -> None:
    """Remove todos os cookies de autenticação."""
    kwargs = {'path': '/'}
    if _COOKIE_DOMAIN:
        kwargs['domain'] = _COOKIE_DOMAIN
    for name in ('access_token', 'refresh_token', 'inova_session', 'inova_role'):
        response.delete_cookie(name, **kwargs)


@extend_schema(tags=['auth'])
class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]


@extend_schema(tags=['auth'], summary='Login com username/senha')
class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        login_input = serializer.validated_data['username']
        password = serializer.validated_data['password']

        # Aceitar email ou username no campo de login
        User = get_user_model()
        username = login_input
        if '@' in login_input:
            try:
                found_user = User.objects.get(email=login_input)
                username = found_user.username
                logger.info(f"Login: email {mask_email(login_input)} resolvido para username '{username}' (active={found_user.is_active})")
            except User.DoesNotExist:
                logger.warning(f"Login: email {mask_email(login_input)} não encontrado no banco")

        user = authenticate(username=username, password=password)

        if not user:
            # Diagnóstico: verificar se user existe
            try:
                db_user = User.objects.get(username=username)
                logger.warning(f"Login falhou: user '{username}' existe (active={db_user.is_active}) mas senha incorreta")
            except User.DoesNotExist:
                logger.warning(f"Login falhou: user '{username}' não encontrado")
            return Response(
                {'error': 'Credenciais inválidas'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        if not user.is_active:
            return Response(
                {'error': 'Usuário inativo'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        if user.is_2fa_enabled:
            import hashlib
            temp_token = secrets.token_urlsafe(32)
            user.temp_2fa_token = hashlib.sha256(temp_token.encode()).hexdigest()
            # TTL reduzido de 10min → 3min: se temp_token vazar (logs, erros,
            # MitM em HTTP) o atacante tem apenas 3 min para brute-force do
            # código TOTP. Combinado com o rate limit de 5/min do endpoint,
            # o espaço de busca efetivo fica << 1M combinações.
            user.temp_2fa_expires = timezone.now() + timedelta(minutes=3)
            user.save(update_fields=['temp_2fa_token', 'temp_2fa_expires'])
            return Response({
                'requires_2fa': True,
                'temp_token': temp_token,
                'message': 'Código 2FA requerido'
            })

        logger.info(f"Login bem-sucedido: {user.username} (role={user.role})")
        log_audit(user, 'login', 'user', user.id)
        refresh = RefreshToken.for_user(user)
        response = Response({'user': UserSerializer(user).data})
        _set_auth_cookies(response, refresh, user=user)
        return response


@extend_schema(tags=['auth'], summary='Verificar código TOTP (2FA)')
class TwoFactorVerifyView(APIView):
    permission_classes = [AllowAny]
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

        if user.temp_2fa_expires and user.temp_2fa_expires < timezone.now():
            user.temp_2fa_token = None
            user.temp_2fa_expires = None
            user.save(update_fields=['temp_2fa_token', 'temp_2fa_expires'])
            return Response({'error': 'Token expirado, faça login novamente'}, status=status.HTTP_401_UNAUTHORIZED)

        totp = pyotp.TOTP(user.totp_secret)
        if not totp.verify(code):
            logger.warning("Código 2FA inválido")
            return Response({'error': 'Código 2FA inválido'}, status=status.HTTP_401_UNAUTHORIZED)

        user.temp_2fa_token = None
        user.temp_2fa_expires = None
        user.save(update_fields=['temp_2fa_token', 'temp_2fa_expires'])

        logger.info(f"2FA OK: {user.username}")
        refresh = RefreshToken.for_user(user)
        response = Response({'user': UserSerializer(user).data})
        _set_auth_cookies(response, refresh, user=user)
        return response


@extend_schema(tags=['auth'], summary='Ativar/desativar 2FA para o usuário autenticado')
class TwoFactorSetupView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        if user.is_2fa_enabled:
            password = request.data.get('password', '')
            if not password or not user.check_password(password):
                return Response(
                    {'error': 'Senha incorreta. Confirme sua senha para desativar o 2FA.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            user.is_2fa_enabled = False
            user.totp_secret = None
            user.save(update_fields=['is_2fa_enabled', 'totp_secret'])
            logger.info(f"2FA desativado: {user.username}")
            log_audit(user, '2fa_toggle', 'user', user.id, 'enabled' if user.is_2fa_enabled else 'disabled')
            return Response({'message': '2FA desativado', 'enabled': False})

        secret = pyotp.random_base32()
        user.totp_secret = secret
        user.is_2fa_enabled = True
        user.save(update_fields=['totp_secret', 'is_2fa_enabled'])

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
        log_audit(user, '2fa_toggle', 'user', user.id, 'enabled' if user.is_2fa_enabled else 'disabled')
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

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        if not user.check_password(serializer.validated_data['old_password']):
            return Response({'error': 'Senha atual incorreta'}, status=status.HTTP_400_BAD_REQUEST)

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
        try:
            refresh_token = request.COOKIES.get('refresh_token') or request.data.get('refresh')
            if refresh_token:
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
    throttle_classes = [PasswordResetThrottle]

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

        import hashlib
        token = secrets.token_urlsafe(32)
        user.password_reset_token = hashlib.sha256(token.encode()).hexdigest()
        user.password_reset_expires = timezone.now() + timedelta(hours=24)
        user.save(update_fields=['password_reset_token', 'password_reset_expires'])

        send_password_reset_email.delay(user.id, token)
        logger.info(f"Task de reset de senha enfileirada para: {mask_email(email)}")

        return safe_response


@extend_schema(tags=['auth'], summary='Confirmar redefinição de senha com token')
class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]

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
        return response
