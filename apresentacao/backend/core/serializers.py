from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import Apresentacao, Asset, LinkPublico, Usuario


class UsuarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Usuario
        fields = ("id", "email", "nome", "criado_em", "ultimo_login")
        read_only_fields = ("id", "criado_em", "ultimo_login")


class LoginSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["nome"] = user.nome
        token["email"] = user.email
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data["usuario"] = UsuarioSerializer(self.user).data
        return data


class ApresentacaoListSerializer(serializers.ModelSerializer):
    total_views = serializers.SerializerMethodField()
    total_links = serializers.SerializerMethodField()

    class Meta:
        model = Apresentacao
        fields = (
            "id", "nome", "cliente_nome", "status",
            "thumbnail_url", "criado_em", "atualizado_em", "publicado_em",
            "total_views", "total_links",
        )

    def get_total_views(self, obj):
        return sum(l.total_views for l in obj.links.all())

    def get_total_links(self, obj):
        return sum(1 for l in obj.links.all() if l.ativo)


class ApresentacaoDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Apresentacao
        fields = (
            "id", "nome", "cliente_nome", "status",
            "canvas_json", "timeline_json", "config_json",
            "thumbnail_url", "criado_em", "atualizado_em", "publicado_em",
        )
        read_only_fields = ("id", "criado_em", "atualizado_em", "publicado_em")


class LinkPublicoSerializer(serializers.ModelSerializer):
    protegido_por_senha = serializers.SerializerMethodField()

    class Meta:
        model = LinkPublico
        fields = (
            "id", "apresentacao", "token", "rotulo", "ativo",
            "expira_em", "total_views", "ultimo_acesso",
            "criado_em", "revogado_em", "protegido_por_senha",
        )
        read_only_fields = ("id", "token", "total_views", "ultimo_acesso", "criado_em", "revogado_em", "protegido_por_senha")

    def get_protegido_por_senha(self, obj):
        return bool(obj.senha_hash)


class AssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Asset
        fields = ("id", "nome", "tipo", "arquivo", "tamanho_bytes", "criado_em")
        read_only_fields = ("id", "tamanho_bytes", "criado_em")
