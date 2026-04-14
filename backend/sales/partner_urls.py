from django.urls import path
from .partner_views import (
    partner_leads, partner_commissions, partner_dashboard,
    register_partner, update_partner, delete_partner,
)

urlpatterns = [
    # Admin: gestão de parceiros
    path('register/', register_partner, name='partner-register'),
    path('<int:pk>/update/', update_partner, name='partner-update'),
    path('<int:pk>/delete/', delete_partner, name='partner-delete'),
    # Parceiro: seus dados
    path('leads/', partner_leads, name='partner-leads'),
    path('commissions/', partner_commissions, name='partner-commissions'),
    path('dashboard/', partner_dashboard, name='partner-dashboard'),
]
