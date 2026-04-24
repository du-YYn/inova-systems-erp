from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .sso import sso_exchange
from .views import (
    ApresentacaoViewSet,
    AssetViewSet,
    LinkPublicoViewSet,
    LoginView,
    MeView,
    public_link_content,
    public_link_heartbeat,
    public_link_meta,
    public_link_unlock,
)

router = DefaultRouter()
router.register("apresentacoes", ApresentacaoViewSet, basename="apresentacao")
router.register("links", LinkPublicoViewSet, basename="link")
router.register("assets", AssetViewSet, basename="asset")
router.register("me", MeView, basename="me")

urlpatterns = [
    path("auth/login/", LoginView.as_view(), name="login"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="refresh"),
    path("sso/exchange/", sso_exchange, name="sso-exchange"),
    path("public/<uuid:token>/meta/", public_link_meta, name="public-meta"),
    path("public/<uuid:token>/unlock/", public_link_unlock, name="public-unlock"),
    path("public/<uuid:token>/content/", public_link_content, name="public-content"),
    path("public/<uuid:token>/heartbeat/", public_link_heartbeat, name="public-heartbeat"),
    path("", include(router.urls)),
]
