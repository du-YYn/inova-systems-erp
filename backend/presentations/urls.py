from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    PresentationAssetViewSet,
    PresentationViewSet,
    PublicLinkViewSet,
    public_content,
    public_heartbeat,
    public_meta,
    public_unlock,
)

router = DefaultRouter()
router.register("presentations", PresentationViewSet,      basename="presentation")
router.register("links",         PublicLinkViewSet,         basename="presentation-link")
router.register("assets",        PresentationAssetViewSet,  basename="presentation-asset")

urlpatterns = [
    path("", include(router.urls)),
]

public_urlpatterns = [
    path("<uuid:token>/meta/",      public_meta,      name="presentations-public-meta"),
    path("<uuid:token>/unlock/",    public_unlock,    name="presentations-public-unlock"),
    path("<uuid:token>/content/",   public_content,   name="presentations-public-content"),
    path("<uuid:token>/heartbeat/", public_heartbeat, name="presentations-public-heartbeat"),
]
