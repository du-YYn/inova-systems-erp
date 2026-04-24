from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import AcessoLog, Apresentacao, Asset, LinkPublico, Usuario


@admin.register(Usuario)
class UsuarioAdmin(BaseUserAdmin):
    ordering = ("email",)
    list_display = ("email", "nome", "is_staff", "is_active", "criado_em")
    search_fields = ("email", "nome")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Identificação", {"fields": ("nome",)}),
        ("Permissões", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Datas", {"fields": ("last_login", "criado_em")}),
    )
    readonly_fields = ("criado_em",)
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "nome", "password1", "password2"),
        }),
    )


@admin.register(Apresentacao)
class ApresentacaoAdmin(admin.ModelAdmin):
    list_display = ("nome", "cliente_nome", "status", "usuario", "atualizado_em")
    list_filter = ("status",)
    search_fields = ("nome", "cliente_nome")
    readonly_fields = ("criado_em", "atualizado_em")


@admin.register(LinkPublico)
class LinkPublicoAdmin(admin.ModelAdmin):
    list_display = ("rotulo", "apresentacao", "ativo", "total_views", "criado_em")
    list_filter = ("ativo",)
    readonly_fields = ("token", "criado_em", "revogado_em", "total_views", "ultimo_acesso")


@admin.register(Asset)
class AssetAdmin(admin.ModelAdmin):
    list_display = ("nome", "tipo", "usuario", "criado_em")
    list_filter = ("tipo",)


@admin.register(AcessoLog)
class AcessoLogAdmin(admin.ModelAdmin):
    list_display = ("link_publico", "ip", "acessado_em", "duracao_segundos")
    list_filter = ("acessado_em",)
