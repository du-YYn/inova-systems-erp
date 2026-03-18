from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    BankAccountViewSet, CategoryViewSet, InvoiceViewSet,
    TransactionViewSet, CostCenterViewSet, BudgetViewSet
)

router = DefaultRouter()
router.register(r'bank-accounts', BankAccountViewSet)
router.register(r'categories', CategoryViewSet)
router.register(r'invoices', InvoiceViewSet)
router.register(r'transactions', TransactionViewSet)
router.register(r'cost-centers', CostCenterViewSet)
router.register(r'budgets', BudgetViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
