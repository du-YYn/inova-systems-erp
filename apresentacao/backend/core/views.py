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
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import AcessoLog, Apresentacao, Asset, LinkPublico
from .serializers import (
    ApresentacaoDetailSerializer,
    ApresentacaoListSerializer,
    AssetSerializer,
    LinkPublicoSerializer,
    LoginSerializer,
    UsuarioSerializer,
)
from .upload_validators import (
    MAX_ASSET_SIZE,
    MAX_THUMBNAIL_SIZE,
    validate_image_upload,
)


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"


class MeView(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        return Response(UsuarioSerializer(request.user).data)


class ApresentacaoViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Apresentacao.objects.filter(usuario=self.request.user).prefetch_related("links")

    def get_serializer_class(self):
        if self.action == "list":
            return ApresentacaoListSerializer
        return ApresentacaoDetailSerializer

    def perform_create(self, serializer):
        serializer.save(usuario=self.request.user)

    @action(detail=True, methods=["post"])
    def duplicar(self, request, pk=None):
        original = self.get_object()
        clone = Apresentacao.objects.create(
            usuario=request.user,
            nome=f"{original.nome} (cópia)",
            cliente_nome=original.cliente_nome,
            canvas_json=original.canvas_json,
            timeline_json=original.timeline_json,
            config_json=original.config_json,
        )
        return Response(ApresentacaoDetailSerializer(clone).data, status=201)

    @action(detail=True, methods=["post"], url_path="thumbnail")
    def thumbnail(self, request, pk=None):
        apres = self.get_object()
        arquivo = request.FILES.get("arquivo")
        validate_image_upload(arquivo, MAX_THUMBNAIL_SIZE, label="arquivo")

        relpath = f"thumbnails/{apres.id}.png"
        fullpath = os.path.join(settings.MEDIA_ROOT, relpath)
        os.makedirs(os.path.dirname(fullpath), exist_ok=True)
        with open(fullpath, "wb") as f:
            for chunk in arquivo.chunks():
                f.write(chunk)
        url = request.build_absolute_uri(f"{settings.MEDIA_URL}{relpath}")
        apres.thumbnail_url = url
        apres.save(update_fields=["thumbnail_url"])
        return Response({"thumbnail_url": url})


class LinkPublicoViewSet(viewsets.ModelViewSet):
    serializer_class = LinkPublicoSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = LinkPublico.objects.filter(apresentacao__usuario=self.request.user)
        apres = self.request.query_params.get("apresentacao")
        if apres:
            qs = qs.filter(apresentacao_id=apres)
        return qs

    def perform_create(self, serializer):
        apres = serializer.validated_data["apresentacao"]
        if apres.usuario_id != self.request.user.id:
            raise PermissionDenied("Apresentação não pertence ao usuário.")
        senha = self.request.data.get("senha")
        senha_hash = make_password(senha) if senha else ""
        serializer.save(senha_hash=senha_hash)

    def perform_update(self, serializer):
        senha = self.request.data.get("senha")
        if senha is not None:
            serializer.validated_data["senha_hash"] = make_password(senha) if senha else ""
        serializer.save()

    @action(detail=True, methods=["post"])
    def revogar(self, request, pk=None):
        link = self.get_object()
        link.ativo = False
        link.revogado_em = timezone.now()
        link.save(update_fields=["ativo", "revogado_em"])
        return Response(LinkPublicoSerializer(link).data)


class AssetViewSet(viewsets.ModelViewSet):
    serializer_class = AssetSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Asset.objects.filter(usuario=self.request.user)

    def perform_create(self, serializer):
        arquivo = serializer.validated_data.get("arquivo")
        validate_image_upload(arquivo, MAX_ASSET_SIZE, label="arquivo")
        serializer.save(
            usuario=self.request.user,
            tamanho_bytes=arquivo.size if arquivo else 0,
        )


def _get_link_or_none(token):
    try:
        link = LinkPublico.objects.select_related("apresentacao").get(token=token)
    except LinkPublico.DoesNotExist:
        return None, "nao-encontrado"
    if not link.ativo:
        return link, "revogado"
    if link.expira_em and link.expira_em < timezone.now():
        return link, "expirado"
    return link, None


class _PublicReadThrottle(ScopedRateThrottle):
    scope = "public_read"


class _PublicUnlockThrottle(ScopedRateThrottle):
    scope = "public_unlock"


class _PublicHeartbeatThrottle(ScopedRateThrottle):
    scope = "public_heartbeat"


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([_PublicReadThrottle])
def public_link_meta(request, token):
    link, erro = _get_link_or_none(token)
    if erro == "nao-encontrado":
        return Response({"erro": "nao-encontrado"}, status=status.HTTP_404_NOT_FOUND)
    if erro:
        return Response({"erro": erro, "revogado_em": link.revogado_em, "expira_em": link.expira_em}, status=410)
    apres = link.apresentacao
    return Response({
        "nome": apres.nome,
        "cliente_nome": apres.cliente_nome,
        "precisa_senha": bool(link.senha_hash),
        "rotulo": link.rotulo,
        "thumbnail_url": apres.thumbnail_url or None,
    })


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([_PublicUnlockThrottle])
def public_link_unlock(request, token):
    link, erro = _get_link_or_none(token)
    if erro:
        return Response({"erro": erro}, status=status.HTTP_404_NOT_FOUND if erro == "nao-encontrado" else 410)
    senha = request.data.get("senha", "")
    if not link.senha_hash or check_password(senha, link.senha_hash):
        return _serve_apresentacao(link, request)
    return Response({"erro": "senha-invalida"}, status=status.HTTP_401_UNAUTHORIZED)


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([_PublicReadThrottle])
def public_link_content(request, token):
    link, erro = _get_link_or_none(token)
    if erro:
        return Response({"erro": erro}, status=status.HTTP_404_NOT_FOUND if erro == "nao-encontrado" else 410)
    if link.senha_hash:
        return Response({"erro": "senha-requerida", "precisa_senha": True}, status=status.HTTP_401_UNAUTHORIZED)
    return _serve_apresentacao(link, request)


def _serve_apresentacao(link, request):
    apres = link.apresentacao
    LinkPublico.objects.filter(pk=link.pk).update(
        total_views=F("total_views") + 1,
        ultimo_acesso=timezone.now(),
    )
    ip = request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip() or request.META.get("REMOTE_ADDR")
    log = AcessoLog.objects.create(
        link_publico=link,
        ip=ip or None,
        user_agent=request.META.get("HTTP_USER_AGENT", "")[:500],
    )
    return Response({
        "sessao_id": log.id,
        "nome": apres.nome,
        "cliente_nome": apres.cliente_nome,
        "canvas_json": apres.canvas_json,
        "timeline_json": apres.timeline_json,
        "config_json": apres.config_json,
    })


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([_PublicHeartbeatThrottle])
def public_link_heartbeat(request, token):
    sessao_id = request.data.get("sessao_id")
    try:
        duracao = int(request.data.get("duracao_segundos", 0) or 0)
    except (TypeError, ValueError):
        duracao = 0
    duracao = max(0, min(duracao, 24 * 60 * 60))  # cap em 24h, evita valores absurdos
    if not sessao_id:
        return Response({"ok": True})
    # Só aceita heartbeat para sessões deste link (defesa contra alteração cruzada)
    AcessoLog.objects.filter(pk=sessao_id, link_publico__token=token).update(
        duracao_segundos=duracao,
    )
    return Response({"ok": True})
