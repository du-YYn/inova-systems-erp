from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CustomerViewSet, ProspectViewSet, ProposalViewSet, ContractViewSet

router = DefaultRouter()
router.register(r'customers', CustomerViewSet)
router.register(r'prospects', ProspectViewSet)
router.register(r'proposals', ProposalViewSet)
router.register(r'contracts', ContractViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
