from django.urls import path
from .n8n_views import (
    NewLeadsView,
    LeadSearchView,
    LeadUpdateView,
    FollowUpLeadsView,
    ProposalCreateView,
    SendEmailView,
    MessageCreateView,
)

urlpatterns = [
    path('new-leads/', NewLeadsView.as_view(), name='n8n-new-leads'),
    path('leads/search/', LeadSearchView.as_view(), name='n8n-lead-search'),
    path('leads/<int:pk>/update/', LeadUpdateView.as_view(), name='n8n-lead-update'),
    path('leads/follow-up/', FollowUpLeadsView.as_view(), name='n8n-follow-up'),
    path('proposals/create/', ProposalCreateView.as_view(), name='n8n-proposal-create'),
    path('send-email/', SendEmailView.as_view(), name='n8n-send-email'),
    path('messages/', MessageCreateView.as_view(), name='n8n-message-create'),
]
