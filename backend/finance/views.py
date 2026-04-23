import logging
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema
from django.db import models, transaction
from django.db.models import Sum
from django.db.models.functions import TruncDay
from django.utils import timezone
from django.utils.dateparse import parse_date
from datetime import timedelta
from decimal import Decimal

from .models import (
    BankAccount, Category, Invoice, Transaction, CostCenter, Budget,
    TaxConfig, TaxEntry, ClientCost, RecurringExpense, Loan, LoanInstallment,
    Asset, ProfitDistConfig, ProfitDistPartner,
    PaymentProvider, PaymentProviderRate,
)
from .serializers import (
    BankAccountSerializer, CategorySerializer, InvoiceSerializer,
    TransactionSerializer, CostCenterSerializer, BudgetSerializer,
    TaxConfigSerializer, TaxEntrySerializer, ClientCostSerializer,
    RecurringExpenseSerializer, LoanSerializer, LoanInstallmentSerializer,
    AssetSerializer, ProfitDistConfigSerializer, ProfitDistPartnerSerializer,
    PaymentProviderSerializer, PaymentProviderRateSerializer,
)
from accounts.permissions import (
    IsAdminOrManager, IsAdminOrManagerOrOperator, IsAdminOrReadOnly,
)

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
    @action(detail=False, methods=['get'], url_path='aging')
    def aging(self, request):
        """Relatório de inadimplência — receivables vencidas agrupadas por período."""
        from datetime import date

        today = date.today()

        overdue_qs = Invoice.objects.filter(
            invoice_type='receivable',
            status__in=['overdue', 'pending'],
            due_date__lt=today,
        ).select_related('customer')

        def get_age_bucket(due_date):
            days = (today - due_date).days
            if days <= 30:
                return '0-30'
            elif days <= 60:
                return '31-60'
            elif days <= 90:
                return '61-90'
            else:
                return '90+'

        buckets = {'0-30': [], '31-60': [], '61-90': [], '90+': []}
        totals = {'0-30': 0, '31-60': 0, '61-90': 0, '90+': 0}

        for inv in overdue_qs:
            bucket = get_age_bucket(inv.due_date)
            buckets[bucket].append({
                'id': inv.id,
                'number': inv.number,
                'customer': inv.customer.company_name if inv.customer else '',
                'due_date': inv.due_date.isoformat(),
                'total': float(inv.total),
                'days_overdue': (today - inv.due_date).days,
            })
            totals[bucket] += float(inv.total)

        return Response({
            'summary': [
                {'bucket': k, 'count': len(v), 'total': totals[k]}
                for k, v in buckets.items()
            ],
            'details': buckets,
            'grand_total': sum(totals.values()),
        })

    @extend_schema(tags=['finance'])
    @action(detail=False, methods=['get'], url_path='dre')
    def dre(self, request):
        """DRE - Demonstrativo de Resultado do Exercício."""
        from datetime import date

        year = int(request.query_params.get('year', date.today().year))
        month = request.query_params.get('month')

        base_filter = {}
        if month:
            base_filter['issue_date__year'] = year
            base_filter['issue_date__month'] = int(month)
        else:
            base_filter['issue_date__year'] = year

        # Receita Bruta (faturas recebidas)
        receita_bruta = Invoice.objects.filter(
            invoice_type='receivable', status='paid', **base_filter
        ).aggregate(total=Sum('total'))['total'] or 0

        # Impostos/deduções
        deducoes = Invoice.objects.filter(
            invoice_type='receivable', status='paid', **base_filter
        ).aggregate(total=Sum('tax'))['total'] or 0

        receita_liquida = float(receita_bruta) - float(deducoes)

        # Despesas operacionais (faturas pagas a pagar)
        despesas_operacionais = Invoice.objects.filter(
            invoice_type='payable', status='paid', **base_filter
        ).aggregate(total=Sum('total'))['total'] or 0

        # Custo de pessoal (a partir de transações categorizadas como pessoal)
        transaction_filter = {
            k.replace('issue_date', 'date'): v for k, v in base_filter.items()
        }
        custo_pessoal = Transaction.objects.filter(
            transaction_type='expense',
            category__name__icontains='pessoal',
            **transaction_filter
        ).aggregate(total=Sum('amount'))['total'] or 0

        ebitda = receita_liquida - float(despesas_operacionais) - float(custo_pessoal)
        lucro_liquido = ebitda
        margem_liquida = (
            lucro_liquido / float(receita_bruta) * 100
        ) if float(receita_bruta) > 0 else 0

        period_label = (
            f"{year}" if not month
            else f"{int(month):02d}/{year}"
        )

        return Response({
            'period': period_label,
            'receita_bruta': float(receita_bruta),
            'deducoes': float(deducoes),
            'receita_liquida': receita_liquida,
            'despesas_operacionais': float(despesas_operacionais),
            'custo_pessoal': float(custo_pessoal),
            'ebitda': ebitda,
            'lucro_liquido': lucro_liquido,
            'margem_liquida': round(margem_liquida, 2),
        })


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
    @action(detail=False, methods=['get'], url_path='forecast')
    def forecast(self, request):
        """Previsão de receita MRR para os próximos 12 meses."""
        from sales.models import Contract, Proposal
        from datetime import date

        try:
            from dateutil.relativedelta import relativedelta
            _has_dateutil = True
        except ImportError:
            _has_dateutil = False

        today = date.today()

        # Contratos ativos com valor mensal
        active_contracts = Contract.objects.filter(
            status='active',
            monthly_value__gt=0,
        )

        mrr = sum(float(c.monthly_value) for c in active_contracts)

        # Propostas aprovadas (futuro pipeline)
        pipeline_value = Proposal.objects.filter(
            status='approved',
        ).aggregate(total=Sum('total_value'))['total'] or 0

        months = []
        base_month = today.replace(day=1)

        for i in range(12):
            if _has_dateutil:
                target_month = base_month + relativedelta(months=i)
            else:
                month_num = (today.month + i - 1) % 12 + 1
                year_num = today.year + (today.month + i - 1) // 12
                target_month = date(year_num, month_num, 1)

            month_contracts = active_contracts.filter(
                start_date__lte=target_month,
            ).filter(
                models.Q(end_date__isnull=True) | models.Q(end_date__gte=target_month)
            )
            month_mrr = sum(float(c.monthly_value) for c in month_contracts)

            months.append({
                'month': target_month.strftime('%Y-%m'),
                'mrr': month_mrr,
                'active_contracts': month_contracts.count(),
            })

        return Response({
            'current_mrr': mrr,
            'active_contracts': active_contracts.count(),
            'pipeline_value': float(pipeline_value),
            'forecast': months,
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


# ═══════════════════════════════════════════════════════════════════════════════
# NOVOS VIEWSETS — Módulo Financeiro Reestruturado
# ═══════════════════════════════════════════════════════════════════════════════


@extend_schema(tags=['finance'])
class TaxConfigViewSet(viewsets.ModelViewSet):
    queryset = TaxConfig.objects.all()
    serializer_class = TaxConfigSerializer
    permission_classes = [IsAdminOrManager]

    def list(self, request, *args, **kwargs):
        config = TaxConfig.objects.first()
        if not config:
            config = TaxConfig.objects.create()
        return Response(TaxConfigSerializer(config).data)

    def create(self, request, *args, **kwargs):
        config = TaxConfig.objects.first()
        if config:
            ser = TaxConfigSerializer(config, data=request.data, partial=True)
            ser.is_valid(raise_exception=True)
            ser.save()
            return Response(ser.data)
        return super().create(request, *args, **kwargs)


@extend_schema(tags=['finance'])
class TaxEntryViewSet(viewsets.ModelViewSet):
    queryset = TaxEntry.objects.all()
    serializer_class = TaxEntrySerializer
    permission_classes = [IsAdminOrManager]

    def get_queryset(self):
        qs = super().get_queryset()
        month = self.request.query_params.get('month')
        if month:
            qs = qs.filter(reference_month=month)
        return qs

    def perform_create(self, serializer):
        data = serializer.validated_data
        rate = data.get('rate', 0)
        base = data.get('base_amount', 0)
        value = data.get('value', 0)
        if rate and base and not value:
            value = base * rate / 100
        serializer.save(created_by=self.request.user, value=value)


@extend_schema(tags=['finance'])
class ClientCostViewSet(viewsets.ModelViewSet):
    queryset = ClientCost.objects.select_related('customer')
    serializer_class = ClientCostSerializer
    permission_classes = [IsAdminOrManager]

    def get_queryset(self):
        qs = super().get_queryset()
        month = self.request.query_params.get('month')
        customer_id = self.request.query_params.get('customer')
        if month:
            qs = qs.filter(reference_month=month)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


@extend_schema(tags=['finance'])
class RecurringExpenseViewSet(viewsets.ModelViewSet):
    queryset = RecurringExpense.objects.all()
    serializer_class = RecurringExpenseSerializer
    permission_classes = [IsAdminOrManager]

    def get_queryset(self):
        qs = super().get_queryset()
        category = self.request.query_params.get('category')
        active_only = self.request.query_params.get('active')
        if category:
            qs = qs.filter(expense_category=category)
        if active_only == 'true':
            qs = qs.filter(is_active=True)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


@extend_schema(tags=['finance'])
class LoanViewSet(viewsets.ModelViewSet):
    queryset = Loan.objects.prefetch_related('installments')
    serializer_class = LoanSerializer
    permission_classes = [IsAdminOrManager]

    def perform_create(self, serializer):
        loan = serializer.save(created_by=self.request.user)
        # Auto-calculate installment value and generate installments
        loan.installment_value = loan.total_amount / loan.num_installments
        loan.save(update_fields=['installment_value'])

        installments = []
        for i in range(loan.num_installments):
            month_offset = i
            year = loan.start_date.year + (loan.start_date.month + month_offset - 1) // 12
            month = (loan.start_date.month + month_offset - 1) % 12 + 1
            day = min(loan.start_date.day, 28)
            from datetime import date
            due = date(year, month, day)
            installments.append(LoanInstallment(
                loan=loan, number=i + 1, due_date=due, value=loan.installment_value,
            ))
        LoanInstallment.objects.bulk_create(installments)

    @action(detail=True, methods=['post'], url_path='pay/(?P<installment_id>[0-9]+)')
    def pay_installment(self, request, pk=None, installment_id=None):
        inst = LoanInstallment.objects.filter(loan_id=pk, id=installment_id).first()
        if not inst:
            return Response({'error': 'Parcela não encontrada'}, status=status.HTTP_404_NOT_FOUND)
        inst.is_paid = True
        inst.paid_date = timezone.now().date()
        inst.save(update_fields=['is_paid', 'paid_date'])
        return Response(LoanInstallmentSerializer(inst).data)


@extend_schema(tags=['finance'])
class AssetViewSet(viewsets.ModelViewSet):
    queryset = Asset.objects.all()
    serializer_class = AssetSerializer
    permission_classes = [IsAdminOrManager]

    def perform_create(self, serializer):
        asset = serializer.save(created_by=self.request.user)
        asset.monthly_depreciation = asset.calc_monthly_depreciation()
        asset.save(update_fields=['monthly_depreciation'])

    def perform_update(self, serializer):
        asset = serializer.save()
        asset.monthly_depreciation = asset.calc_monthly_depreciation()
        asset.save(update_fields=['monthly_depreciation'])


@extend_schema(tags=['finance'])
class ProfitDistConfigViewSet(viewsets.ModelViewSet):
    queryset = ProfitDistConfig.objects.prefetch_related('partners')
    serializer_class = ProfitDistConfigSerializer
    permission_classes = [IsAdminOrManager]

    @action(detail=True, methods=['post'], url_path='partners')
    def add_partner(self, request, pk=None):
        config = self.get_object()
        ser = ProfitDistPartnerSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save(config=config)
        return Response(ProfitDistConfigSerializer(config).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path='partners/(?P<partner_id>[0-9]+)')
    def remove_partner(self, request, pk=None, partner_id=None):
        ProfitDistPartner.objects.filter(config_id=pk, id=partner_id).delete()
        config = self.get_object()
        return Response(ProfitDistConfigSerializer(config).data)

    @action(detail=False, methods=['get'], url_path='calculate')
    def calculate(self, request):
        """Calcula distribuição de lucros para um resultado informado."""
        resultado = float(request.query_params.get('resultado', 0))
        config = ProfitDistConfig.objects.prefetch_related('partners').first()
        if not config:
            return Response({'error': 'Configure a distribuição de lucros primeiro.'}, status=status.HTTP_400_BAD_REQUEST)

        if resultado <= 0:
            return Response({
                'resultado': resultado,
                'working_capital': 0, 'reserve_fund': 0,
                'directors_total': 0, 'partners': [], 'excess': 0,
            })

        wc = resultado * float(config.working_capital_pct) / 100
        rf = resultado * float(config.reserve_fund_pct) / 100
        directors_raw = resultado * float(config.directors_pct) / 100
        directors = min(directors_raw, float(config.directors_cap))
        excess = directors_raw - directors

        partners = config.partners.filter(is_active=True)
        partner_values = [
            {'name': p.name, 'share_pct': float(p.share_pct), 'value': directors * float(p.share_pct) / 100}
            for p in partners
        ]

        return Response({
            'resultado': resultado,
            'working_capital': round(wc, 2),
            'reserve_fund': round(rf, 2),
            'directors_total': round(directors, 2),
            'partners': partner_values,
            'excess': round(excess, 2),
        })


def _calc_dre_month(year, month, active_customers, rob_f, churn_value, tax_config=None):
    """Calcula DRE para um mês específico. Retorna dict com planejado e realizado."""
    from datetime import date
    from finance.models import Invoice
    ref = date(year, month, 1)

    # ── REALIZADO: baseado em faturas e dados efetivos do mês ──
    # ROB realizado = faturas receivable com due_date neste mês
    rob_real = float(
        Invoice.objects.filter(
            invoice_type='receivable',
            due_date__year=year, due_date__month=month,
        ).aggregate(t=Sum('total'))['t'] or 0
    )

    # Custos variáveis do mês (reference_month)
    freq_divisor = {
        'one_time': 0, 'monthly': 1, 'quarterly': 3,
        'semiannual': 6, 'yearly': 12,
    }
    cv = 0.0
    for cc in ClientCost.objects.filter(reference_month=ref):
        divisor = freq_divisor.get(cc.frequency, 1)
        cv += float(cc.value) / divisor if divisor > 0 else float(cc.value)

    # Desp. operacionais e depreciação: só aparecem a partir do mês atual
    # Meses passados sem faturas = tudo zero
    from datetime import date as _date
    today = _date.today()
    current_month_start = today.replace(day=1)
    month_start = _date(year, month, 1)
    is_current_or_future = month_start >= current_month_start

    if is_current_or_future or rob_real > 0:
        desp_op = float(
            RecurringExpense.objects.filter(is_active=True).aggregate(
                t=Sum('value')
            )['t'] or 0
        )
        deprec = float(
            Asset.objects.filter(is_active=True).aggregate(
                t=Sum('monthly_depreciation')
            )['t'] or 0
        )
    else:
        desp_op = 0.0
        deprec = 0.0

    # Desp. financeiras (parcelas do mês)
    desp_fin = float(
        LoanInstallment.objects.filter(
            due_date__year=year, due_date__month=month,
            loan__is_active=True,
        ).aggregate(t=Sum('value'))['t'] or 0
    )

    # Deduções sobre ROB realizado
    if tax_config and rob_real > 0:
        tax_data = tax_config.calculate(rob_real)
        deducoes_real = tax_data['total']
    else:
        deducoes_real = 0.0

    # Cálculos DRE realizado
    rol_r = rob_real - deducoes_real
    lb_r = rol_r - cv
    mc_r = (lb_r / rob_real * 100) if rob_real > 0 else 0
    ebitda_r = lb_r - desp_op
    me_r = (ebitda_r / rol_r * 100) if rol_r > 0 else 0
    ebit_r = ebitda_r - deprec - desp_fin
    res_r = ebit_r

    # ── PLANEJADO: só mostra receita planejada se tem faturas no mês ──
    # Se não tem nenhuma fatura no mês, ROB planejado = 0
    has_invoices = Invoice.objects.filter(
        invoice_type='receivable',
        due_date__year=year, due_date__month=month,
    ).exists()
    plan_rob = rob_f if has_invoices else 0.0

    if tax_config and plan_rob > 0:
        tax_plan = tax_config.calculate(plan_rob)
        deducoes_plan = tax_plan['total']
    else:
        deducoes_plan = 0.0

    p_rol = plan_rob - deducoes_plan
    p_lb = p_rol - cv

    def row(rob, churn, ded, r, c_v, lb, m_c, do, eb, m_e, dep, df, ebi, res):
        return {
            'rob': round(rob, 2), 'churn': round(churn, 2),
            'deducoes': round(ded, 2), 'rol': round(r, 2),
            'custos_variaveis': round(c_v, 2),
            'lucro_bruto': round(lb, 2),
            'margem_contribuicao': round(m_c, 2),
            'despesas_operacionais': round(do, 2),
            'ebitda': round(eb, 2), 'margem_ebitda': round(m_e, 2),
            'depreciacao': round(dep, 2),
            'despesas_financeiras': round(df, 2),
            'ebit': round(ebi, 2),
            'ir_csll': 0, 'resultado_liquido': round(res, 2),
        }
    p_mc = (p_lb / plan_rob * 100) if plan_rob > 0 else 0
    p_ebitda = p_lb - desp_op
    p_me = (p_ebitda / p_rol * 100) if p_rol > 0 else 0
    p_ebit = p_ebitda - deprec - desp_fin

    return {
        'month': f"{year}-{month:02d}",
        'label': f"{month:02d}/{year}",
        'realizado': row(
            rob_real, 0, deducoes_real, rol_r, cv, lb_r, mc_r,
            desp_op, ebitda_r, me_r, deprec, desp_fin, ebit_r, res_r,
        ),
        'planejado': row(
            plan_rob, 0, deducoes_plan, p_rol, cv, p_lb, p_mc,
            desp_op, p_ebitda, p_me, deprec, desp_fin, p_ebit, p_ebit,
        ),
    }


@extend_schema(tags=['finance'])
class FinanceDashboardView(viewsets.ViewSet):
    """Dashboard financeiro consolidado — DRE 12 meses, indicadores, MRR, distribuição."""
    permission_classes = [IsAdminOrManager]

    def list(self, request):
        from sales.models import Customer
        from datetime import date

        today = date.today()
        year = int(request.query_params.get('year', today.year))
        current_month = int(request.query_params.get('month', today.month))
        ref_date = date(year, current_month, 1)

        active_customers = Customer.objects.filter(is_active=True)
        rob = sum(float(c.contract_value) for c in active_customers if c.contract_value)
        rob_f = float(rob) if rob else 0
        # MRR = faturas receivable do mês atual (realizado, não projeção)
        from finance.models import Invoice
        mrr_real = float(
            Invoice.objects.filter(
                invoice_type='receivable',
                due_date__year=year, due_date__month=current_month,
            ).aggregate(t=Sum('total'))['t'] or 0
        )
        # mrr_plan disponível se necessário no futuro
        # sum(float(c.contract_value) for c in active_customers
        #     if c.contract_value and c.billing_frequency == 'monthly')

        churned = Customer.objects.filter(is_active=False, contract_value__gt=0)
        churn_value = float(sum(float(c.contract_value) for c in churned))
        churn_rate = (churn_value / rob_f * 100) if rob_f > 0 else 0

        # ── DRE 12 meses ──────────────────────────────────────────────────
        tax_cfg = TaxConfig.objects.first()
        dre_months = []
        for m in range(1, 13):
            dre_months.append(_calc_dre_month(year, m, active_customers, rob_f, churn_value, tax_cfg))

        # ── Indicadores do mês selecionado
        cur = next((d for d in dre_months if d['month'] == f"{year}-{current_month:02d}"), dre_months[0])
        r = cur['realizado']

        custos_fixos = r['despesas_operacionais'] + r['despesas_financeiras'] + r['depreciacao']
        mc = r['margem_contribuicao']
        break_even = (custos_fixos / (mc / 100)) if mc > 0 else 0

        # ── Clientes para Receita Recorrente (custos convertidos para mensal)
        freq_div = {'one_time': 0, 'monthly': 1, 'quarterly': 3, 'semiannual': 6, 'yearly': 12}
        customers_data = []
        for c in active_customers:
            costs = 0.0
            for cc in ClientCost.objects.filter(customer=c, reference_month=ref_date):
                d = freq_div.get(cc.frequency, 1)
                costs += float(cc.value) / d if d > 0 else float(cc.value)
            customers_data.append({
                'id': c.id, 'name': c.company_name or c.name,
                'ticket': float(c.contract_value or 0), 'costs': costs,
                'margin': float(c.contract_value or 0) - costs,
                'billing_frequency': c.billing_frequency, 'is_active': c.is_active,
            })

        return Response({
            'period': f"{current_month:02d}/{year}",
            'indicators': {
                'rob': r['rob'], 'rol': r['rol'], 'ebitda': r['ebitda'],
                'resultado': r['resultado_liquido'], 'mrr': round(mrr_real, 2),
                'churn_rate': round(churn_rate, 2), 'churn_value': round(churn_value, 2),
                'margem_contribuicao': r['margem_contribuicao'],
                'margem_ebitda': r['margem_ebitda'], 'break_even': round(break_even, 2),
            },
            'dre_months': dre_months,
            'customers': customers_data,
            'active_customers': active_customers.count(),
            'churned_customers': churned.count(),
        })

    @action(detail=False, methods=['get'], url_path='dre-pdf')
    def dre_pdf(self, request):
        """Exporta DRE 12 meses em PDF."""
        import io
        from datetime import date
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        )
        from reportlab.lib.units import cm
        from sales.models import Customer
        from django.http import HttpResponse

        year = int(request.query_params.get('year', date.today().year))
        active_customers = Customer.objects.filter(is_active=True)
        rob_f = sum(float(c.contract_value) for c in active_customers if c.contract_value) or 0
        churned = Customer.objects.filter(is_active=False, contract_value__gt=0)
        churn_val = float(sum(float(c.contract_value) for c in churned))

        months = []
        for m in range(1, 13):
            months.append(_calc_dre_month(year, m, active_customers, rob_f, churn_val))

        month_labels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                        'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
        rows_def = [
            ('Receita Bruta (ROB)', 'rob'), ('(-) Churn', 'churn'),
            ('(-) Deduções', 'deducoes'), ('= ROL', 'rol'),
            ('(-) Custos Variáveis', 'custos_variaveis'),
            ('= Lucro Bruto', 'lucro_bruto'),
            ('(-) Desp. Operacionais', 'despesas_operacionais'),
            ('= EBITDA', 'ebitda'), ('(-) Depreciação', 'depreciacao'),
            ('(-) Desp. Financeiras', 'despesas_financeiras'),
            ('= EBIT', 'ebit'), ('= Resultado Líquido', 'resultado_liquido'),
        ]

        # Build table data
        header = ['Descrição'] + month_labels
        data = [header]
        bold_keys = {'rob', 'rol', 'lucro_bruto', 'ebitda', 'ebit', 'resultado_liquido'}
        for label, key in rows_def:
            row = [label]
            for dm in months:
                v = dm['realizado'].get(key, 0)
                row.append(f"R$ {v:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.'))
            data.append(row)

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=landscape(A4),
                                rightMargin=1 * cm, leftMargin=1 * cm,
                                topMargin=1.5 * cm, bottomMargin=1 * cm)
        styles = getSampleStyleSheet()
        story = []
        story.append(Paragraph(f'DRE — {year}', styles['Title']))
        story.append(Paragraph('Inova Systems Solutions', styles['Normal']))
        story.append(Spacer(1, 0.5 * cm))

        col_widths = [4.5 * cm] + [1.9 * cm] * 12
        table = Table(data, colWidths=col_widths)
        style_cmds = [
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#A6864A')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 7),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('GRID', (0, 0), (-1, -1), 0.3, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9F9F9')]),
            ('PADDING', (0, 0), (-1, -1), 4),
        ]
        # Bold rows
        for i, (_, key) in enumerate(rows_def):
            if key in bold_keys:
                style_cmds.append(('FONTNAME', (0, i + 1), (-1, i + 1), 'Helvetica-Bold'))
                style_cmds.append(('BACKGROUND', (0, i + 1), (-1, i + 1), colors.HexColor('#F0EDE6')))
        table.setStyle(TableStyle(style_cmds))
        story.append(table)
        doc.build(story)

        buffer.seek(0)
        response = HttpResponse(buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="dre-{year}.pdf"'
        return response


@extend_schema(tags=['finance'])
class PaymentProviderViewSet(viewsets.ModelViewSet):
    """Catálogo de bancos/gateways de pagamento.

    Todos os usuários autenticados leem (precisam para o modal de ativação
    de contrato). Apenas admin edita/cadastra — é config sensível.
    """
    queryset = PaymentProvider.objects.prefetch_related('rates')
    serializer_class = PaymentProviderSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.method in ('GET', 'HEAD', 'OPTIONS'):
            include_inactive = self.request.query_params.get('include_inactive') == '1'
            if not include_inactive:
                qs = qs.filter(is_active=True)
        return qs

    @action(
        detail=True, methods=['post'], url_path='simulate',
        permission_classes=[permissions.IsAuthenticated],
    )
    def simulate(self, request, pk=None):
        """Simula cobrança com as taxas deste provider.

        Body:
        - `method`: 'pix' | 'credit_card' | 'boleto'
        - `gross`: valor bruto desejado (R$, string decimal)
        - `installments`: número de parcelas (int, default 1)
        - `anticipate`: bool (cartão apenas) — True = empresa recebe à vista
        - `repass_fee`: bool (cartão apenas) — True = taxa embutida no preço ao cliente

        Retorna o dict calculado por `finance.pricing`, com schedule e details.
        """
        from .pricing import calculate_card, calculate_boleto, calculate_pix

        provider = self.get_object()
        data = request.data or {}

        method = data.get('method')
        if method not in ('pix', 'credit_card', 'boleto'):
            raise ValidationError({'method': 'Deve ser pix, credit_card ou boleto.'})

        try:
            gross = Decimal(str(data.get('gross', '0')))
        except Exception:
            raise ValidationError({'gross': 'Valor decimal inválido.'})
        if gross <= 0:
            raise ValidationError({'gross': 'Deve ser maior que zero.'})

        try:
            installments = int(data.get('installments', 1) or 1)
        except (TypeError, ValueError):
            raise ValidationError({'installments': 'Número inteiro inválido.'})
        if installments < 1:
            raise ValidationError({'installments': 'Deve ser >= 1.'})

        rate = provider.rates.filter(method=method).first()
        if not rate:
            raise ValidationError({
                'method': f'Provider {provider.code} não tem taxas cadastradas para {method}.',
            })

        try:
            if method == 'pix':
                result = calculate_pix(gross=gross, fee_fixed=rate.fixed_fee)
            elif method == 'boleto':
                result = calculate_boleto(
                    gross=gross, installments=installments,
                    fee_fixed=rate.fixed_fee,
                )
            else:  # credit_card
                anticipate = bool(data.get('anticipate', False))
                repass_fee = bool(data.get('repass_fee', False))
                result = calculate_card(
                    gross=gross, installments=installments,
                    fee_pct=rate.installment_fee_pct,
                    fee_fixed=rate.installment_fee_fixed,
                    anticipation_monthly_pct=rate.anticipation_monthly_pct,
                    anticipate=anticipate, repass_fee=repass_fee,
                )
        except ValueError as exc:
            raise ValidationError({'detail': str(exc)})

        result['provider'] = {
            'id': provider.id,
            'code': provider.code,
            'name': provider.name,
        }
        return Response(result)


@extend_schema(tags=['finance'])
class PaymentProviderRateViewSet(viewsets.ModelViewSet):
    """Taxas por método de cada provider. Só admin edita."""
    queryset = PaymentProviderRate.objects.select_related('provider')
    serializer_class = PaymentProviderRateSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        qs = super().get_queryset()
        provider_id = self.request.query_params.get('provider')
        if provider_id:
            qs = qs.filter(provider_id=provider_id)
        return qs
