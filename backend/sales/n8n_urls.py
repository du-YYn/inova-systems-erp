from django.urls import path
from .n8n_views import (
    NewLeadsView,
    LeadSearchView,
    LeadUpdateView,
    FollowUpLeadsView,
    SendEmailView,
)

urlpatterns = [
    path('new-leads/', NewLeadsView.as_view(), name='n8n-new-leads'),
    path('leads/search/', LeadSearchView.as_view(), name='n8n-lead-search'),
    path('leads/<int:pk>/update/', LeadUpdateView.as_view(), name='n8n-lead-update'),
    path('leads/follow-up/', FollowUpLeadsView.as_view(), name='n8n-follow-up'),
    path('send-email/', SendEmailView.as_view(), name='n8n-send-email'),
]
