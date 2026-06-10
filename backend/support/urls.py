from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SLAPolicyViewSet, SupportCategoryViewSet, SupportTicketViewSet,
    TicketCommentViewSet, KnowledgeBaseArticleViewSet, PedidoUpdateViewSet,
)
from .views_public import PublicTicketCreateView

router = DefaultRouter()
router.register(r'sla-policies', SLAPolicyViewSet)
router.register(r'categories', SupportCategoryViewSet)
router.register(r'tickets', SupportTicketViewSet)
router.register(r'comments', TicketCommentViewSet)
router.register(r'kb', KnowledgeBaseArticleViewSet)
router.register(r'pedidos-update', PedidoUpdateViewSet)

urlpatterns = [
    # v32 F6 (doc 05 §9): canal público de chamados — token por cliente.
    path(
        'public/tickets/<uuid:customer_token>/',
        PublicTicketCreateView.as_view(),
        name='support-public-ticket',
    ),
    path('', include(router.urls)),
]
