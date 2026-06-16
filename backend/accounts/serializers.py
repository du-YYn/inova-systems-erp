from rest_framework import serializers
from django.contrib.auth import get_user_model

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'full_name',
                  'role', 'sectors', 'is_2fa_enabled', 'phone', 'avatar', 'is_active', 'created_at']
        # role, sectors e is_2fa_enabled não podem ser alterados diretamente via
        # PATCH /profile/ — use endpoints dedicados: /2fa/setup/ e admin /users/{id}/
        read_only_fields = ['id', 'created_at', 'role', 'sectors', 'is_2fa_enabled']


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        # role excluído: novos usuários sempre começam como 'operator'
        fields = ['username', 'email', 'password', 'password_confirm', 'first_name', 'last_name']

    def validate(self, data):
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'As senhas não conferem'})
        return data

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        validated_data['role'] = 'operator'
        user = User.objects.create_user(**validated_data)
        return user


class SectorsValidationMixin:
    """v32 F3 / SEC-002: valida User.sectors (lista de slugs SECTOR_CHOICES).

    Reutilizado por AdminUserSerializer (PATCH) e AdminUserCreateSerializer
    (POST) — usuários manager/operator devem poder nascer já com setor,
    evitando recriar o estado inseguro de sectors=[] (escrita fail-closed).
    """

    def validate_sectors(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('Setores deve ser uma lista.')
        valid = {c[0] for c in User.SECTOR_CHOICES}
        invalid = [s for s in value if s not in valid]
        if invalid:
            raise serializers.ValidationError(
                f'Setores inválidos: {", ".join(map(str, invalid))}. '
                f'Válidos: {", ".join(sorted(valid))}'
            )
        return value


class AdminUserSerializer(SectorsValidationMixin, serializers.ModelSerializer):
    """UserSerializer com role/sectors editáveis — usado apenas por admins."""
    full_name = serializers.ReadOnlyField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'full_name',
                  'role', 'sectors', 'is_2fa_enabled', 'phone', 'avatar', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at', 'is_2fa_enabled']


class AdminUserCreateSerializer(SectorsValidationMixin, serializers.ModelSerializer):
    """RegisterSerializer com role/sectors editáveis — usado apenas por admins.

    SEC-002: inclui `sectors` para que manager/operator novos já nasçam com
    setor (a escrita por setor é fail-closed quando sectors=[]).
    """
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'first_name', 'last_name',
                  'role', 'sectors', 'is_active']

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


class TwoFactorSetupSerializer(serializers.Serializer):
    def create(self, validated_data):
        pass

    def update(self, instance, validated_data):
        pass


class TwoFactorVerifySerializer(serializers.Serializer):
    code = serializers.CharField(max_length=6, min_length=6)


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(min_length=8)


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)
    new_password_confirm = serializers.CharField(write_only=True)

    def validate(self, data):
        if data['new_password'] != data['new_password_confirm']:
            raise serializers.ValidationError({'new_password_confirm': 'As senhas não conferem'})
        return data
