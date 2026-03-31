from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    BankAccountViewSet, CategoryViewSet, InvoiceViewSet,
    TransactionViewSet, CostCenterViewSet, BudgetViewSet,
    TaxConfigViewSet, TaxEntryViewSet, ClientCostViewSet,
    RecurringExpenseViewSet, LoanViewSet, AssetViewSet,
    ProfitDistConfigViewSet, FinanceDashboardView,
)

router = DefaultRouter()
router.register(r'bank-accounts', BankAccountViewSet)
router.register(r'categories', CategoryViewSet)
router.register(r'invoices', InvoiceViewSet)
router.register(r'transactions', TransactionViewSet)
router.register(r'cost-centers', CostCenterViewSet)
router.register(r'budgets', BudgetViewSet)
router.register(r'tax-config', TaxConfigViewSet)
router.register(r'taxes', TaxEntryViewSet)
router.register(r'client-costs', ClientCostViewSet)
router.register(r'recurring-expenses', RecurringExpenseViewSet)
router.register(r'loans', LoanViewSet)
router.register(r'assets', AssetViewSet)
router.register(r'profit-dist', ProfitDistConfigViewSet)
router.register(r'fin-dashboard', FinanceDashboardView, basename='fin-dashboard')

urlpatterns = [
    path('', include(router.urls)),
]
