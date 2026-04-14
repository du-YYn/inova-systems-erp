from django.urls import path
from .partner_views import partner_leads, partner_commissions, partner_dashboard

urlpatterns = [
    path('leads/', partner_leads, name='partner-leads'),
    path('commissions/', partner_commissions, name='partner-commissions'),
    path('dashboard/', partner_dashboard, name='partner-dashboard'),
]
