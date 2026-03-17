import logging
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema, extend_schema_view
from django.db import models, transaction
from django.db.models import Sum, Count, Avg
from django.db.models.functions import TruncMonth, TruncDay
from django.utils import timezone
from django.utils.dateparse import parse_date
from datetime import timedelta
from decimal import Decimal

from .models import BankAccount, Category, Invoice, Transaction, CostCenter, Budget
from .serializers import (
    BankAccountSerializer, CategorySerializer, InvoiceSerializer,
    TransactionSerializer, CostCenterSerializer, BudgetSerializer
)
from accounts.permissions import IsAdminOrManager, IsAdminOrManagerOrOperator

logger = logging.getLogger('finance')


@extend_schema(tags=['finance'])
class BankAccountViewSet(viewsets.ModelViewSet):
    queryset = BankAccount.objects.filter(is_active=True)
    serializer_class = BankAccountSerializer
    permission_classes = [IsAdminOrManager]


@extend_schema(tags=['finance'])
class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.filter(is_active=True).select_related('parent')
    serializer_class = CategorySerializer
    permission_classes = [IsAdminOrManagerOrOperator]


@extend_schema(tags=['finance'])
class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = Invoice.objects.select_related('customer', 'category', 'bank_account', 'created_by')
    serializer_class = InvoiceSerializer
    permission_classes = [IsAdminOrManager]

    def get_queryset(self):
        queryset = super().get_queryset()
        invoice_type = self.request.query_params.get('invoice_type', None)
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
        invoice_type = serializer.validated_data.get('invoice_type')
        prefix = 'REC' if invoice_type == 'receivable' else 'PAG'
        with transaction.atomic():
            last_invoice = (
                Invoice.objects.select_for_update()
                .filter(invoice_type=invoice_type)
                .order_by('-id')
                .first()
            )
            if last_invoice:
                try:
                    last_seq = int(last_invoice.number.split('-')[1])
                except (IndexError, ValueError):
                    last_seq = 0
            else:
                last_seq = 0
            next_number = f"{prefix}-{last_seq + 1:05d}"
            serializer.save(number=next_number, created_by=self.request.user)

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        today = timezone.now().date()
        month_start = today.replace(day=1)

        queryset = self.get_queryset()
        receivables = queryset.filter(invoice_type='receivable')
        payables = queryset.filter(invoice_type='payable')

        pending_receivables = receivables.filter(status__in=['pending', 'sent']).aggregate(
            total=Sum('total')
        )['total'] or 0

        pending_payables = payables.filter(status__in=['pending', 'sent']).aggregate(
            total=Sum('total')
        )['total'] or 0

        received_this_month = receivables.filter(
            status='paid',
            paid_date__isnull=False,
            paid_date__gte=month_start
        ).aggregate(total=Sum('total'))['total'] or 0

        paid_this_month = payables.filter(
            status='paid',
            paid_date__isnull=False,
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
        with transaction.atomic():
            invoice = Invoice.objects.select_for_update().get(pk=pk)
            if invoice.status == 'paid':
                return Response(
                    {'error': 'Fatura já está marcada como paga'},
                    status=status.HTTP_400_BAD_REQUEST
                )
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

        logger.info(f"Fatura {invoice.number} marcada como paga por {request.user.username}")
        return Response(InvoiceSerializer(invoice).data)


@extend_schema(tags=['finance'])
class TransactionViewSet(viewsets.ModelViewSet):
    queryset = Transaction.objects.select_related('bank_account', 'category', 'customer', 'created_by')
    serializer_class = TransactionSerializer
    permission_classes = [IsAdminOrManager]

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
            parsed = parse_date(from_date)
            if not parsed:
                raise ValidationError({'from': f"Formato de data inválido: {from_date}. Use YYYY-MM-DD."})
            queryset = queryset.filter(date__gte=parsed)
        if to_date:
            parsed = parse_date(to_date)
            if not parsed:
                raise ValidationError({'to': f"Formato de data inválido: {to_date}. Use YYYY-MM-DD."})
            queryset = queryset.filter(date__lte=parsed)

        return queryset

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['get'])
    def cash_flow(self, request):
        from_date = request.query_params.get('from')
        to_date = request.query_params.get('to')

        if not from_date:
            from_date = (timezone.now() - timedelta(days=30)).date()
        else:
            from_date = parse_date(from_date)
            if not from_date:
                return Response({'error': 'Formato de data inválido (from)'}, status=status.HTTP_400_BAD_REQUEST)

        if not to_date:
            to_date = timezone.now().date()
        else:
            to_date = parse_date(to_date)
            if not to_date:
                return Response({'error': 'Formato de data inválido (to)'}, status=status.HTTP_400_BAD_REQUEST)

        transactions = self.get_queryset().filter(date__gte=from_date, date__lte=to_date)

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


@extend_schema(tags=['finance'])
class CostCenterViewSet(viewsets.ModelViewSet):
    queryset = CostCenter.objects.all()
    serializer_class = CostCenterSerializer
    permission_classes = [IsAdminOrManager]


@extend_schema(tags=['finance'])
class BudgetViewSet(viewsets.ModelViewSet):
    queryset = Budget.objects.select_related('category', 'cost_center', 'created_by')
    serializer_class = BudgetSerializer
    permission_classes = [IsAdminOrManager]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['get'])
    def report(self, request):
        from django.db.models import OuterRef, Subquery, DecimalField
        from django.db.models.functions import Coalesce

        actual_subquery = Transaction.objects.filter(
            category=OuterRef('category'),
            date__gte=OuterRef('start_date'),
            date__lte=OuterRef('end_date'),
            transaction_type='expense',
        ).values('category').annotate(total=Sum('amount')).values('total')

        budgets = (
            self.get_queryset()
            .filter(is_active=True)
            .annotate(
                actual_amount=Coalesce(
                    Subquery(actual_subquery, output_field=DecimalField()),
                    Decimal('0'),
                )
            )
        )

        result = []
        for budget in budgets:
            planned = budget.planned or Decimal('0')
            actual = budget.actual_amount
            result.append({
                'id': budget.id,
                'name': budget.name,
                'category': budget.category.name,
                'planned': float(planned),
                'actual': float(actual),
                'remaining': float(planned) - float(actual),
                'progress': float(actual / planned * 100) if planned > 0 else 0
            })

        return Response(result)
