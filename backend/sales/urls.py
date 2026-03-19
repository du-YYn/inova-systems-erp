from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CustomerViewSet, ProspectViewSet, ProposalViewSet, ContractViewSet,
    ProspectActivityViewSet, WinLossReasonViewSet, WebsiteLeadCreateView,
)

router = DefaultRouter()
router.register(r'customers', CustomerViewSet)
router.register(r'prospects', ProspectViewSet)
router.register(r'proposals', ProposalViewSet)
router.register(r'contracts', ContractViewSet)
router.register(r'prospect-activities', ProspectActivityViewSet)
router.register(r'win-loss', WinLossReasonViewSet)

urlpatterns = [
    path('website-lead/', WebsiteLeadCreateView.as_view(), name='website-lead'),
    path('', include(router.urls)),
]
