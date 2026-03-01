from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import models
from django.db.models import Sum, Count, Avg
from django.db.models.functions import TruncMonth, TruncDay
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal

from .models import BankAccount, Category, Invoice, Transaction, CostCenter, Budget
from .serializers import (
    BankAccountSerializer, CategorySerializer, InvoiceSerializer,
    TransactionSerializer, CostCenterSerializer, BudgetSerializer
)


class BankAccountViewSet(viewsets.ModelViewSet):
    queryset = BankAccount.objects.all()
    serializer_class = BankAccountSerializer
    permission_classes = [IsAuthenticated]


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.filter(is_active=True)
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]


class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = Invoice.objects.all()
    serializer_class = InvoiceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        invoice_type = self.request.query_params.get('type', None)
        status_filter = self.request.query_params.get('status', None)
        customer_id = self.request.query_params.get('customer', None)
        
        if invoice_type:
            queryset = queryset.filter(invoice_type=invoice_type)
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)
            
        return queryset

    def perform_create(self, serializer):
        last_invoice = Invoice.objects.filter(
            invoice_type=serializer.validated_data.get('invoice_type')
        ).order_by('-id').first()
        
        prefix = 'REC' if serializer.validated_data.get('invoice_type') == 'receivable' else 'PAG'
        next_number = f"{prefix}-{int(last_invoice.number.split('-')[1]) + 1 if last_invoice else 1:05d}"
        
        serializer.save(number=next_number, created_by=self.request.user)

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        today = timezone.now().date()
        month_start = today.replace(day=1)
        
        receivables = self.queryset.filter(invoice_type='receivable')
        payables = self.queryset.filter(invoice_type='payable')
        
        pending_receivables = receivables.filter(status__in=['pending', 'sent']).aggregate(
            total=Sum('total')
        )['total'] or 0
        
        pending_payables = payables.filter(status__in=['pending', 'sent']).aggregate(
            total=Sum('total')
        )['total'] or 0
        
        received_this_month = receivables.filter(
            status='paid',
            paid_date__gte=month_start
        ).aggregate(total=Sum('total'))['total'] or 0
        
        paid_this_month = payables.filter(
            status='paid',
            paid_date__gte=month_start
        ).aggregate(total=Sum('total'))['total'] or 0

        overdue = receivables.filter(due_date__lt=today, status='pending').count()

        return Response({
            'pending_receivables': float(pending_receivables),
            'pending_payables': float(pending_payables),
            'received_this_month': float(received_this_month),
            'paid_this_month': float(paid_this_month),
            'overdue_invoices': overdue,
            'balance': float(pending_receivables) - float(pending_payables)
        })

    @action(detail=True, methods=['post'])
    def mark_paid(self, request, pk=None):
        invoice = self.get_object()
        invoice.status = 'paid'
        invoice.paid_date = timezone.now().date()
        invoice.save()
        
        Transaction.objects.create(
            transaction_type='income' if invoice.invoice_type == 'receivable' else 'expense',
            doc_type='invoice',
            invoice=invoice,
            customer=invoice.customer,
            bank_account=invoice.bank_account,
            category=invoice.category,
            date=invoice.paid_date,
            amount=invoice.total,
            description=f"Pagamento {invoice.number}",
            created_by=request.user
        )
        
        return Response(InvoiceSerializer(invoice).data)


class TransactionViewSet(viewsets.ModelViewSet):
    queryset = Transaction.objects.all()
    serializer_class = TransactionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        trans_type = self.request.query_params.get('type', None)
        bank_id = self.request.query_params.get('bank', None)
        from_date = self.request.query_params.get('from', None)
        to_date = self.request.query_params.get('to', None)
        
        if trans_type:
            queryset = queryset.filter(transaction_type=trans_type)
        if bank_id:
            queryset = queryset.filter(bank_account_id=bank_id)
        if from_date:
            queryset = queryset.filter(date__gte=from_date)
        if to_date:
            queryset = queryset.filter(date__lte=to_date)
            
        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['get'])
    def cash_flow(self, request):
        from_date = request.query_params.get('from')
        to_date = request.query_params.get('to')
        
        if not from_date:
            from_date = (timezone.now() - timedelta(days=30)).date()
        if not to_date:
            to_date = timezone.now().date()
        
        transactions = self.queryset.filter(date__gte=from_date, date__lte=to_date)
        
        income = transactions.filter(transaction_type='income').aggregate(total=Sum('amount'))['total'] or 0
        expense = transactions.filter(transaction_type='expense').aggregate(total=Sum('amount'))['total'] or 0
        
        by_category = transactions.values('category__name').annotate(
            total=Sum('amount')
        ).order_by('-total')
        
        by_day = transactions.annotate(day=TruncDay('date')).values('day').annotate(
            income=Sum('amount', filter=models.Q(transaction_type='income')),
            expense=Sum('amount', filter=models.Q(transaction_type='expense'))
        ).order_by('day')
        
        return Response({
            'total_income': float(income),
            'total_expense': float(expense),
            'balance': float(income) - float(expense),
            'by_category': list(by_category),
            'by_day': list(by_day)
        })


class CostCenterViewSet(viewsets.ModelViewSet):
    queryset = CostCenter.objects.all()
    serializer_class = CostCenterSerializer
    permission_classes = [IsAuthenticated]


class BudgetViewSet(viewsets.ModelViewSet):
    queryset = Budget.objects.all()
    serializer_class = BudgetSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['get'])
    def report(self, request):
        budgets = self.queryset.filter(is_active=True)
        
        result = []
        for budget in budgets:
            actual = Transaction.objects.filter(
                category=budget.category,
                date__gte=budget.start_date,
                date__lte=budget.end_date,
                transaction_type='expense'
            ).aggregate(total=Sum('amount'))['total'] or 0
            
            result.append({
                'id': budget.id,
                'name': budget.name,
                'category': budget.category.name,
                'planned': float(budget.planned),
                'actual': float(actual),
                'remaining': float(budget.planned) - float(actual),
                'progress': float(actual / budget.planned * 100) if budget.planned > 0 else 0
            })
        
        return Response(result)
