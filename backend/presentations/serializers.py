from rest_framework import serializers

from .models import Presentation, PresentationAsset, PublicLink


class PresentationListSerializer(serializers.ModelSerializer):
    total_views = serializers.SerializerMethodField()
    total_links = serializers.SerializerMethodField()

    class Meta:
        model = Presentation
        fields = (
            "id", "name", "client_name", "status",
            "thumbnail_url", "created_at", "updated_at", "published_at",
            "total_views", "total_links",
        )
        read_only_fields = ("id", "created_at", "updated_at", "published_at", "total_views", "total_links")

    def get_total_views(self, obj):
        return sum(l.total_views for l in obj.public_links.all())

    def get_total_links(self, obj):
        return sum(1 for l in obj.public_links.all() if l.is_active)


class PresentationDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Presentation
        fields = (
            "id", "name", "client_name", "status",
            "canvas_json", "timeline_json", "config_json",
            "thumbnail_url", "created_at", "updated_at", "published_at",
        )
        read_only_fields = ("id", "created_at", "updated_at", "published_at")


class PublicLinkSerializer(serializers.ModelSerializer):
    password_protected = serializers.SerializerMethodField()

    class Meta:
        model = PublicLink
        fields = (
            "id", "presentation", "token", "label", "is_active",
            "expires_at", "total_views", "last_access_at",
            "created_at", "revoked_at", "password_protected",
        )
        read_only_fields = (
            "id", "token", "total_views", "last_access_at",
            "created_at", "revoked_at", "password_protected",
        )

    def get_password_protected(self, obj):
        return bool(obj.password_hash)


class PresentationAssetSerializer(serializers.ModelSerializer):
    class Meta:
        model = PresentationAsset
        fields = ("id", "name", "kind", "file", "size_bytes", "created_at")
        read_only_fields = ("id", "size_bytes", "created_at")
