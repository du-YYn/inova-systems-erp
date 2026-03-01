from rest_framework import status, generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.hashers import make_password
from django.core.mail import send_mail
from django.utils import timezone
from datetime import timedelta
import pyotp
import qrcode
import io
import base64
import secrets

from .serializers import (
    UserSerializer, RegisterSerializer, LoginSerializer,
    TwoFactorVerifySerializer, PasswordResetRequestSerializer, PasswordResetConfirmSerializer,
    ChangePasswordSerializer
)

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = authenticate(
            username=serializer.validated_data['username'],
            password=serializer.validated_data['password']
        )

        if not user:
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
            temp_token = secrets.token_urlsafe(32)
            user.temp_2fa_token = temp_token
            user.save(update_fields=['temp_2fa_token'])
            
            return Response({
                'requires_2fa': True,
                'temp_token': temp_token,
                'message': 'Código 2FA requerido'
            })

        refresh = RefreshToken.for_user(user)
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserSerializer(user).data
        })


class TwoFactorVerifyView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = TwoFactorVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        temp_token = request.data.get('temp_token')
        code = serializer.validated_data['code']

        try:
            user = User.objects.get(temp_2fa_token=temp_token)
        except User.DoesNotExist:
            return Response(
                {'error': 'Token inválido'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        totp = pyotp.TOTP(user.totp_secret)
        if not totp.verify(code):
            return Response(
                {'error': 'Código 2FA inválido'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        user.temp_2fa_token = None
        user.save(update_fields=['temp_2fa_token'])

        refresh = RefreshToken.for_user(user)
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserSerializer(user).data
        })


class TwoFactorSetupView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        
        if user.is_2fa_enabled:
            user.is_2fa_enabled = False
            user.totp_secret = None
            user.save(update_fields=['is_2fa_enabled', 'totp_secret'])
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

        return Response({
            'secret': secret,
            'qr_code': f'data:image/png;base64,{qr_code_b64}',
            'enabled': True
        })


class ProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = request.user
        if not user.check_password(serializer.validated_data['old_password']):
            return Response(
                {'error': 'Senha atual incorreta'},
                status=status.HTTP_400_BAD_REQUEST
            )

        user.password = make_password(serializer.validated_data['new_password'])
        user.save()

        return Response({'message': 'Senha alterada com sucesso'})


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
        except Exception:
            pass
        return Response({'message': 'Logout realizado'})


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data['email']
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({'message': 'Se o email existir, você receberá instruções'})

        token = secrets.token_urlsafe(32)
        user.password_reset_token = token
        user.password_reset_expires = timezone.now() + timedelta(hours=24)
        user.save(update_fields=['password_reset_token', 'password_reset_expires'])

        return Response({'message': 'Se o email existir, você receberá instruções'})


class UserListView(generics.ListAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
