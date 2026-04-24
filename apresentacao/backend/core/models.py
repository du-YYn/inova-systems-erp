import uuid

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.contrib.postgres.indexes import GinIndex
from django.db import models

from .managers import UsuarioManager


class Usuario(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    nome = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    criado_em = models.DateTimeField(auto_now_add=True)
    ultimo_login = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["nome"]

    objects = UsuarioManager()

    class Meta:
        db_table = "usuario"
        verbose_name = "Usuário"
        verbose_name_plural = "Usuários"

    def __str__(self):
        return self.email


class Apresentacao(models.Model):
    class Status(models.TextChoices):
        RASCUNHO = "rascunho", "Rascunho"
        PUBLICADA = "publicada", "Publicada"
        ARQUIVADA = "arquivada", "Arquivada"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    usuario = models.ForeignKey(
        Usuario, on_delete=models.CASCADE, related_name="apresentacoes"
    )
    nome = models.CharField(max_length=200)
    cliente_nome = models.CharField(max_length=200, blank=True)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.RASCUNHO
    )
    canvas_json = models.JSONField(default=dict, blank=True)
    timeline_json = models.JSONField(default=dict, blank=True)
    config_json = models.JSONField(default=dict, blank=True)
    thumbnail_url = models.URLField(blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    atualizado_em = models.DateTimeField(auto_now=True)
    publicado_em = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "apresentacao"
        ordering = ["-atualizado_em"]
        indexes = [
            models.Index(fields=["usuario", "status"]),
            GinIndex(fields=["canvas_json"], name="apres_canvas_gin"),
            GinIndex(fields=["timeline_json"], name="apres_timeline_gin"),
        ]

    def __str__(self):
        return f"{self.nome} ({self.status})"


class LinkPublico(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    apresentacao = models.ForeignKey(
        Apresentacao, on_delete=models.CASCADE, related_name="links"
    )
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    rotulo = models.CharField(max_length=200, blank=True)
    ativo = models.BooleanField(default=True)
    senha_hash = models.CharField(max_length=128, blank=True)
    expira_em = models.DateTimeField(null=True, blank=True)
    total_views = models.PositiveIntegerField(default=0)
    ultimo_acesso = models.DateTimeField(null=True, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)
    revogado_em = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "link_publico"
        ordering = ["-criado_em"]
        indexes = [models.Index(fields=["token"])]

    def __str__(self):
        return f"{self.rotulo or self.token}"


class Asset(models.Model):
    class Tipo(models.TextChoices):
        LOGO = "logo", "Logo"
        IMAGEM = "imagem", "Imagem"
        ICONE = "icone", "Ícone"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    usuario = models.ForeignKey(
        Usuario, on_delete=models.CASCADE, related_name="assets"
    )
    nome = models.CharField(max_length=120)
    tipo = models.CharField(max_length=16, choices=Tipo.choices)
    arquivo = models.FileField(upload_to="assets/%Y/%m/")
    tamanho_bytes = models.PositiveIntegerField(default=0)
    usado_em = models.JSONField(default=list, blank=True)
    criado_em = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "asset"
        ordering = ["-criado_em"]

    def __str__(self):
        return self.nome


class AcessoLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    link_publico = models.ForeignKey(
        LinkPublico, on_delete=models.CASCADE, related_name="acessos"
    )
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    acessado_em = models.DateTimeField(auto_now_add=True)
    duracao_segundos = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "acesso_log"
        ordering = ["-acessado_em"]
        indexes = [models.Index(fields=["link_publico", "acessado_em"])]
