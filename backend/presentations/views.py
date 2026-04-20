import os

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db.models import F
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from .models import Presentation, PresentationAccessLog, PresentationAsset, PublicLink
from .serializers import (
    PresentationAssetSerializer,
    PresentationDetailSerializer,
    PresentationListSerializer,
    PublicLinkSerializer,
)
from .upload_validators import (
    MAX_ASSET_SIZE,
    MAX_THUMBNAIL_SIZE,
    validate_image_upload,
)


class PresentationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            Presentation.objects
            .filter(owner=self.request.user)
            .prefetch_related("public_links")
        )

    def get_serializer_class(self):
        return PresentationListSerializer if self.action == "list" else PresentationDetailSerializer

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        source = self.get_object()
        clone = Presentation.objects.create(
            owner=request.user,
            name=f"{source.name} (cópia)",
            client_name=source.client_name,
            canvas_json=source.canvas_json,
            timeline_json=source.timeline_json,
            config_json=source.config_json,
        )
        return Response(PresentationDetailSerializer(clone).data, status=201)

    @action(detail=True, methods=["post"], url_path="thumbnail")
    def thumbnail(self, request, pk=None):
        presentation = self.get_object()
        uploaded = request.FILES.get("file") or request.FILES.get("arquivo")
        validate_image_upload(uploaded, MAX_THUMBNAIL_SIZE, label="file")

        relpath = f"presentations/thumbnails/{presentation.id}.png"
        fullpath = os.path.join(settings.MEDIA_ROOT, relpath)
        os.makedirs(os.path.dirname(fullpath), exist_ok=True)
        with open(fullpath, "wb") as fp:
            for chunk in uploaded.chunks():
                fp.write(chunk)

        url = request.build_absolute_uri(f"{settings.MEDIA_URL}{relpath}")
        presentation.thumbnail_url = url
        presentation.save(update_fields=["thumbnail_url"])
        return Response({"thumbnail_url": url})


class PublicLinkViewSet(viewsets.ModelViewSet):
    serializer_class = PublicLinkSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = PublicLink.objects.filter(presentation__owner=self.request.user)
        presentation = self.request.query_params.get("presentation")
        if presentation:
            qs = qs.filter(presentation_id=presentation)
        return qs

    def perform_create(self, serializer):
        presentation = serializer.validated_data["presentation"]
        if presentation.owner_id != self.request.user.id:
            raise PermissionDenied("A apresentação não pertence ao usuário.")
        password = self.request.data.get("password")
        password_hash = make_password(password) if password else ""
        serializer.save(password_hash=password_hash)

    def perform_update(self, serializer):
        password = self.request.data.get("password")
        if password is not None:
            serializer.validated_data["password_hash"] = make_password(password) if password else ""
        serializer.save()

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        link = self.get_object()
        link.is_active = False
        link.revoked_at = timezone.now()
        link.save(update_fields=["is_active", "revoked_at"])
        return Response(PublicLinkSerializer(link).data)


class PresentationAssetViewSet(viewsets.ModelViewSet):
    serializer_class = PresentationAssetSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return PresentationAsset.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        uploaded = serializer.validated_data.get("file")
        validate_image_upload(uploaded, MAX_ASSET_SIZE, label="file")
        serializer.save(
            owner=self.request.user,
            size_bytes=uploaded.size if uploaded else 0,
        )


# ───── Public (no auth) endpoints ──────────────────────────────────────────────

def _resolve_link(token):
    try:
        link = PublicLink.objects.select_related("presentation").get(token=token)
    except PublicLink.DoesNotExist:
        return None, "not-found"
    if not link.is_active:
        return link, "revoked"
    if link.expires_at and link.expires_at < timezone.now():
        return link, "expired"
    return link, None


class _PublicReadThrottle(ScopedRateThrottle):
    scope = "presentations_public_read"


class _PublicUnlockThrottle(ScopedRateThrottle):
    scope = "presentations_public_unlock"


class _PublicHeartbeatThrottle(ScopedRateThrottle):
    scope = "presentations_public_heartbeat"


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([_PublicReadThrottle])
def public_meta(request, token):
    link, err = _resolve_link(token)
    if err == "not-found":
        return Response({"error": "not-found"}, status=status.HTTP_404_NOT_FOUND)
    if err:
        return Response({"error": err, "revoked_at": link.revoked_at, "expires_at": link.expires_at}, status=410)
    p = link.presentation
    return Response({
        "name": p.name,
        "client_name": p.client_name,
        "password_required": bool(link.password_hash),
        "label": link.label,
        "thumbnail_url": p.thumbnail_url or None,
    })


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([_PublicUnlockThrottle])
def public_unlock(request, token):
    link, err = _resolve_link(token)
    if err:
        return Response({"error": err},
                        status=status.HTTP_404_NOT_FOUND if err == "not-found" else 410)
    password = request.data.get("password", "")
    if not link.password_hash or check_password(password, link.password_hash):
        return _serve_content(link, request)
    return Response({"error": "invalid-password"}, status=status.HTTP_401_UNAUTHORIZED)


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([_PublicReadThrottle])
def public_content(request, token):
    link, err = _resolve_link(token)
    if err:
        return Response({"error": err},
                        status=status.HTTP_404_NOT_FOUND if err == "not-found" else 410)
    if link.password_hash:
        return Response({"error": "password-required", "password_required": True},
                        status=status.HTTP_401_UNAUTHORIZED)
    return _serve_content(link, request)


def _serve_content(link, request):
    p = link.presentation
    PublicLink.objects.filter(pk=link.pk).update(
        total_views=F("total_views") + 1,
        last_access_at=timezone.now(),
    )
    ip = (request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
          or request.META.get("REMOTE_ADDR"))
    log = PresentationAccessLog.objects.create(
        public_link=link,
        ip=ip or None,
        user_agent=request.META.get("HTTP_USER_AGENT", "")[:500],
    )
    return Response({
        "session_id": log.id,
        "name": p.name,
        "client_name": p.client_name,
        "canvas_json": p.canvas_json,
        "timeline_json": p.timeline_json,
        "config_json": p.config_json,
    })


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([_PublicHeartbeatThrottle])
def public_heartbeat(request, token):
    session_id = request.data.get("session_id")
    try:
        duration = int(request.data.get("duration_seconds", 0) or 0)
    except (TypeError, ValueError):
        duration = 0
    duration = max(0, min(duration, 24 * 60 * 60))  # cap at 24h
    if not session_id:
        return Response({"ok": True})
    PresentationAccessLog.objects.filter(pk=session_id, public_link__token=token).update(
        duration_seconds=duration,
    )
    return Response({"ok": True})
