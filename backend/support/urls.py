from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SLAPolicyViewSet, SupportCategoryViewSet, SupportTicketViewSet,
    TicketCommentViewSet, KnowledgeBaseArticleViewSet,
)

router = DefaultRouter()
router.register(r'sla-policies', SLAPolicyViewSet)
router.register(r'categories', SupportCategoryViewSet)
router.register(r'tickets', SupportTicketViewSet)
router.register(r'comments', TicketCommentViewSet)
router.register(r'kb', KnowledgeBaseArticleViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
