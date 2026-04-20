from django.contrib import admin

from .models import Presentation, PresentationAccessLog, PresentationAsset, PublicLink


@admin.register(Presentation)
class PresentationAdmin(admin.ModelAdmin):
    list_display = ("name", "client_name", "status", "owner", "updated_at")
    list_filter = ("status",)
    search_fields = ("name", "client_name")
    readonly_fields = ("id", "created_at", "updated_at")
    raw_id_fields = ("owner",)


@admin.register(PublicLink)
class PublicLinkAdmin(admin.ModelAdmin):
    list_display = ("label", "presentation", "is_active", "total_views", "created_at")
    list_filter = ("is_active",)
    readonly_fields = ("id", "token", "created_at", "revoked_at", "total_views", "last_access_at")
    raw_id_fields = ("presentation",)


@admin.register(PresentationAsset)
class PresentationAssetAdmin(admin.ModelAdmin):
    list_display = ("name", "kind", "owner", "size_bytes", "created_at")
    list_filter = ("kind",)
    search_fields = ("name",)
    raw_id_fields = ("owner",)


@admin.register(PresentationAccessLog)
class PresentationAccessLogAdmin(admin.ModelAdmin):
    list_display = ("public_link", "ip", "accessed_at", "duration_seconds")
    list_filter = ("accessed_at",)
    raw_id_fields = ("public_link",)
