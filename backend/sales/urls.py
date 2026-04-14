from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CustomerViewSet, ProspectViewSet, ProposalViewSet, ContractViewSet,
    ProspectActivityViewSet, WinLossReasonViewSet, WebsiteLeadCreateView,
    ClientOnboardingViewSet,
)
from .views_public import ProposalPublicView, ProposalPublicHTMLView, ClientOnboardingPublicView

router = DefaultRouter()
router.register(r'customers', CustomerViewSet)
router.register(r'prospects', ProspectViewSet)
router.register(r'proposals', ProposalViewSet)
router.register(r'contracts', ContractViewSet)
router.register(r'prospect-activities', ProspectActivityViewSet)
router.register(r'win-loss', WinLossReasonViewSet)
router.register(r'onboardings', ClientOnboardingViewSet)

urlpatterns = [
    path('proposals/public/<uuid:token>/', ProposalPublicView.as_view(), name='proposal-public'),
    path('proposals/public/<uuid:token>/html/', ProposalPublicHTMLView.as_view(), name='proposal-public-html'),
    path('onboarding/public/<uuid:token>/', ClientOnboardingPublicView.as_view(), name='onboarding-public'),
    path('website-lead/', WebsiteLeadCreateView.as_view(), name='website-lead'),
    path('partner/', include('sales.partner_urls')),
    path('n8n/', include('sales.n8n_urls')),
    path('', include(router.urls)),
]
