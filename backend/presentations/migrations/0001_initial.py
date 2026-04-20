import uuid

import django.contrib.postgres.indexes
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Presentation",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=200)),
                ("client_name", models.CharField(blank=True, max_length=200)),
                ("status", models.CharField(
                    choices=[("draft", "Rascunho"), ("published", "Publicada"), ("archived", "Arquivada")],
                    default="draft", max_length=16,
                )),
                ("canvas_json", models.JSONField(blank=True, default=dict)),
                ("timeline_json", models.JSONField(blank=True, default=dict)),
                ("config_json", models.JSONField(blank=True, default=dict)),
                ("thumbnail_url", models.URLField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("published_at", models.DateTimeField(blank=True, null=True)),
                ("owner", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="presentations",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                "db_table": "presentations_presentation",
                "ordering": ["-updated_at"],
            },
        ),
        migrations.AddIndex(
            model_name="presentation",
            index=models.Index(fields=["owner", "status"], name="presentatio_owner_i_idx"),
        ),
        migrations.AddIndex(
            model_name="presentation",
            index=django.contrib.postgres.indexes.GinIndex(fields=["canvas_json"],   name="presentations_canvas_gin"),
        ),
        migrations.AddIndex(
            model_name="presentation",
            index=django.contrib.postgres.indexes.GinIndex(fields=["timeline_json"], name="presentations_timeline_gin"),
        ),
        migrations.CreateModel(
            name="PublicLink",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("token", models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ("label", models.CharField(blank=True, max_length=200)),
                ("is_active", models.BooleanField(default=True)),
                ("password_hash", models.CharField(blank=True, max_length=128)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("total_views", models.PositiveIntegerField(default=0)),
                ("last_access_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                ("presentation", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="public_links",
                    to="presentations.presentation",
                )),
            ],
            options={
                "db_table": "presentations_public_link",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="publiclink",
            index=models.Index(fields=["token"], name="presentatio_token_i_idx"),
        ),
        migrations.CreateModel(
            name="PresentationAsset",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=120)),
                ("kind", models.CharField(
                    choices=[("logo", "Logo"), ("image", "Imagem"), ("icon", "Ícone")],
                    max_length=16,
                )),
                ("file", models.FileField(upload_to="presentations/assets/%Y/%m/")),
                ("size_bytes", models.PositiveIntegerField(default=0)),
                ("used_in", models.JSONField(blank=True, default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("owner", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="presentation_assets",
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                "db_table": "presentations_asset",
                "ordering": ["-created_at"],
            },
        ),
        migrations.CreateModel(
            name="PresentationAccessLog",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("ip", models.GenericIPAddressField(blank=True, null=True)),
                ("user_agent", models.CharField(blank=True, max_length=500)),
                ("accessed_at", models.DateTimeField(auto_now_add=True)),
                ("duration_seconds", models.PositiveIntegerField(default=0)),
                ("public_link", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="access_logs",
                    to="presentations.publiclink",
                )),
            ],
            options={
                "db_table": "presentations_access_log",
                "ordering": ["-accessed_at"],
            },
        ),
        migrations.AddIndex(
            model_name="presentationaccesslog",
            index=models.Index(fields=["public_link", "accessed_at"], name="presentatio_public__idx"),
        ),
    ]
