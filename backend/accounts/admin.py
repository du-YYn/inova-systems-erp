from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = (
        "username",
        "email",
        "role",
        "is_active",
        "is_2fa_enabled",
        "created_at",
    )
    list_filter = ("is_active", "role", "is_2fa_enabled", "created_at")
    search_fields = ("username", "email", "first_name", "last_name")
    ordering = ("-created_at",)

    # F3b: totp_secret removido do admin — agora cifrado e nao deve aparecer
    # em interfaces administrativas. is_2fa_enabled permanece (read-only na UI
    # via readonly_fields para impedir toggle sem o fluxo oficial).
    readonly_fields = ("is_2fa_enabled",)
    fieldsets = BaseUserAdmin.fieldsets + (
        (
            "Informações Adicionais",
            {"fields": ("role", "phone", "avatar", "is_2fa_enabled")},
        ),
    )

    add_fieldsets = BaseUserAdmin.add_fieldsets + (
        ("Informações Adicionais", {"fields": ("role",)}),
    )
