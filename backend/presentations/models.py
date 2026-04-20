import uuid

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.db import models


class Presentation(models.Model):
    """A commercial presentation (interactive Miro+Prezi-style deck)."""

    class Status(models.TextChoices):
        DRAFT     = "draft",     "Rascunho"
        PUBLISHED = "published", "Publicada"
        ARCHIVED  = "archived",  "Arquivada"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="presentations",
    )
    name = models.CharField(max_length=200)
    client_name = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    canvas_json = models.JSONField(default=dict, blank=True)
    timeline_json = models.JSONField(default=dict, blank=True)
    config_json = models.JSONField(default=dict, blank=True)
    thumbnail_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    published_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "presentations_presentation"
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["owner", "status"]),
            GinIndex(fields=["canvas_json"],   name="presentations_canvas_gin"),
            GinIndex(fields=["timeline_json"], name="presentations_timeline_gin"),
        ]

    def __str__(self):
        return f"{self.name} ({self.status})"


class PublicLink(models.Model):
    """Shareable URL that lets a client self-view the presentation."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    presentation = models.ForeignKey(
        Presentation,
        on_delete=models.CASCADE,
        related_name="public_links",
    )
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    label = models.CharField(max_length=200, blank=True)
    is_active = models.BooleanField(default=True)
    password_hash = models.CharField(max_length=128, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    total_views = models.PositiveIntegerField(default=0)
    last_access_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "presentations_public_link"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["token"])]

    def __str__(self):
        return self.label or str(self.token)


class PresentationAsset(models.Model):
    """Reusable media (logos, images, icons) referenced inside presentations."""

    class Kind(models.TextChoices):
        LOGO  = "logo",  "Logo"
        IMAGE = "image", "Imagem"
        ICON  = "icon",  "Ícone"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="presentation_assets",
    )
    name = models.CharField(max_length=120)
    kind = models.CharField(max_length=16, choices=Kind.choices)
    file = models.FileField(upload_to="presentations/assets/%Y/%m/")
    size_bytes = models.PositiveIntegerField(default=0)
    used_in = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "presentations_asset"
        ordering = ["-created_at"]

    def __str__(self):
        return self.name


class PresentationAccessLog(models.Model):
    """Tracks every public-link view for analytics (IP, UA, duration)."""

    id = models.BigAutoField(primary_key=True)
    public_link = models.ForeignKey(
        PublicLink,
        on_delete=models.CASCADE,
        related_name="access_logs",
    )
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    accessed_at = models.DateTimeField(auto_now_add=True)
    duration_seconds = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "presentations_access_log"
        ordering = ["-accessed_at"]
        indexes = [models.Index(fields=["public_link", "accessed_at"])]
