from rest_framework import serializers
from .models import (
    BankAccount, Category, Invoice, Transaction, CostCenter, Budget,
    TaxConfig, TaxEntry, ClientCost, RecurringExpense, Loan, LoanInstallment,
    Asset, ProfitDistConfig, ProfitDistPartner,
)


class BankAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankAccount
        fields = ['id', 'name', 'bank', 'account_type', 'agency', 'account_number',
                  'pix_key', 'is_active', 'is_default', 'balance', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class CategorySerializer(serializers.ModelSerializer):
    children = serializers.SerializerMethodField()
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ['id', 'name', 'category_type', 'parent', 'children', 'full_name',
                  'color', 'icon', 'is_active']
        read_only_fields = ['id']

    def get_children(self, obj):
        children = obj.children.filter(is_active=True)
        return CategorySerializer(children, many=True).data

    def get_full_name(self, obj):
        if obj.parent:
            return f"{obj.parent.name} > {obj.name}"
        return obj.name


class InvoiceSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.company_name', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    bank_account_name = serializers.CharField(source='bank_account.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    project_name = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = ['id', 'invoice_type', 'document_type', 'contract', 'customer', 'customer_name',
                  'project', 'project_name',
                  'number', 'series', 'issue_date', 'due_date', 'paid_date',
                  'value', 'discount', 'interest', 'tax', 'total',
                  'category', 'category_name', 'bank_account', 'bank_account_name',
                  'description', 'items', 'status', 'paid_amount', 'payment_method',
                  'payment_details', 'is_recurring', 'notes',
                  'nfse_number', 'nfse_status', 'nfse_xml_url', 'nfse_pdf_url',
                  'created_by', 'created_by_name',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'number', 'created_by', 'created_at', 'updated_at']

    def get_project_name(self, obj):
        if obj.project_id:
            return obj.project.name
        return None

    def validate_value(self, v):
        if v is not None and v < 0:
            raise serializers.ValidationError('Valor não pode ser negativo.')
        return v

    def validate(self, data):
        value = data.get('value', 0) or 0
        discount = data.get('discount', 0) or 0
        interest = data.get('interest', 0) or 0
        tax = data.get('tax', 0) or 0
        expected_total = value - discount + interest + tax
        if 'total' in data and data['total'] is not None:
            if abs(float(data['total']) - float(expected_total)) > 0.01:
                data['total'] = expected_total
        else:
            data['total'] = expected_total
        return data


class TransactionSerializer(serializers.ModelSerializer):
    bank_account_name = serializers.CharField(source='bank_account.name', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    customer_name = serializers.CharField(source='customer.company_name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    project_name = serializers.SerializerMethodField()

    class Meta:
        model = Transaction
        fields = ['id', 'transaction_type', 'doc_type', 'invoice', 'customer', 'customer_name',
                  'contract', 'bank_account', 'bank_account_name', 'bank_account_to',
                  'category', 'category_name', 'project', 'project_name',
                  'date', 'amount', 'description',
                  'notes', 'tags', 'created_by', 'created_by_name', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']

    def get_project_name(self, obj):
        if obj.project_id:
            return obj.project.name
        return None

    def validate_amount(self, v):
        if v is not None and v < 0:
            raise serializers.ValidationError('Valor não pode ser negativo.')
        return v


class CostCenterSerializer(serializers.ModelSerializer):
    class Meta:
        model = CostCenter
        fields = ['id', 'name', 'code', 'description', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']


class BudgetSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    cost_center_name = serializers.CharField(source='cost_center.name', read_only=True)
    progress = serializers.SerializerMethodField()

    class Meta:
        model = Budget
        fields = ['id', 'name', 'period', 'start_date', 'end_date', 'category', 'category_name',
                  'cost_center', 'cost_center_name', 'planned', 'actual', 'progress',
                  'is_active', 'created_by', 'created_at']
        read_only_fields = ['id', 'created_by', 'created_at']

    def get_progress(self, obj):
        if obj.planned and obj.planned > 0:
            return float((obj.actual / obj.planned) * 100)
        return 0

    def validate(self, data):
        if data.get('start_date') and data.get('end_date') and data['start_date'] > data['end_date']:
            raise serializers.ValidationError('Data de início deve ser anterior à data de término.')
        return data


class TaxConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaxConfig
        fields = ['id', 'das_rate', 'inss_base', 'inss_rate', 'bank_fees', 'asaas_fees', 'updated_at']
        read_only_fields = ['id', 'updated_at']


class TaxEntrySerializer(serializers.ModelSerializer):
    tax_type_display = serializers.CharField(source='get_tax_type_display', read_only=True)

    class Meta:
        model = TaxEntry
        fields = ['id', 'tax_type', 'tax_type_display', 'reference_month', 'rate',
                  'base_amount', 'value', 'notes', 'created_by', 'created_at']
        read_only_fields = ['id', 'created_by', 'created_at']

    def validate_rate(self, v):
        if v is not None and v < 0:
            raise serializers.ValidationError('Alíquota não pode ser negativa.')
        return v

    def validate_value(self, v):
        if v is not None and v < 0:
            raise serializers.ValidationError('Valor não pode ser negativo.')
        return v


class ClientCostSerializer(serializers.ModelSerializer):
    customer_name = serializers.SerializerMethodField()
    cost_category_display = serializers.CharField(source='get_cost_category_display', read_only=True)

    class Meta:
        model = ClientCost
        fields = ['id', 'customer', 'customer_name', 'cost_category', 'cost_category_display',
                  'description', 'value', 'is_recurring', 'reference_month', 'notes',
                  'created_by', 'created_at']
        read_only_fields = ['id', 'created_by', 'created_at']

    def get_customer_name(self, obj):
        return obj.customer.company_name or obj.customer.name or ''

    def validate_value(self, v):
        if v is not None and v < 0:
            raise serializers.ValidationError('Valor não pode ser negativo.')
        return v


class RecurringExpenseSerializer(serializers.ModelSerializer):
    expense_category_display = serializers.CharField(source='get_expense_category_display', read_only=True)

    class Meta:
        model = RecurringExpense
        fields = ['id', 'expense_category', 'expense_category_display', 'description',
                  'value', 'due_day', 'is_recurring', 'is_active', 'notes',
                  'created_by', 'created_at']
        read_only_fields = ['id', 'created_by', 'created_at']

    def validate_value(self, v):
        if v is not None and v < 0:
            raise serializers.ValidationError('Valor não pode ser negativo.')
        return v

    def validate_due_day(self, v):
        if v < 1 or v > 31:
            raise serializers.ValidationError('Dia de vencimento deve ser entre 1 e 31.')
        return v


class LoanInstallmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = LoanInstallment
        fields = ['id', 'number', 'due_date', 'value', 'is_paid', 'paid_date']
        read_only_fields = ['id']


class LoanSerializer(serializers.ModelSerializer):
    installments = LoanInstallmentSerializer(many=True, read_only=True)
    paid_count = serializers.SerializerMethodField()

    class Meta:
        model = Loan
        fields = ['id', 'partner', 'card_bank', 'description', 'total_amount',
                  'num_installments', 'installment_value', 'start_date',
                  'is_active', 'notes', 'installments', 'paid_count',
                  'created_by', 'created_at']
        read_only_fields = ['id', 'installment_value', 'created_by', 'created_at']

    def get_paid_count(self, obj):
        return obj.installments.filter(is_paid=True).count()

    def validate_total_amount(self, v):
        if v is not None and v <= 0:
            raise serializers.ValidationError('Valor total deve ser positivo.')
        return v

    def validate_num_installments(self, v):
        if v is not None and v <= 0:
            raise serializers.ValidationError('Número de parcelas deve ser maior que zero.')
        return v


class AssetSerializer(serializers.ModelSerializer):
    asset_type_display = serializers.CharField(source='get_asset_type_display', read_only=True)
    total_value = serializers.SerializerMethodField()
    life_used_months = serializers.SerializerMethodField()

    class Meta:
        model = Asset
        fields = [
            'id', 'asset_type', 'asset_type_display', 'name',
            'quantity', 'unit_value', 'useful_life_months',
            'setup_cost', 'amortization_months', 'license_unit_cost',
            'annual_cost', 'renewal_date',
            'acquisition_date', 'monthly_depreciation', 'total_value',
            'life_used_months', 'is_active', 'notes', 'created_by', 'created_at',
        ]
        read_only_fields = ['id', 'monthly_depreciation', 'created_by', 'created_at']

    def get_total_value(self, obj):
        if obj.asset_type == 'physical':
            return float(obj.unit_value * obj.quantity)
        elif obj.asset_type == 'software':
            return float(obj.setup_cost or 0)
        elif obj.asset_type == 'annual_license':
            return float(obj.annual_cost or 0)
        return 0

    def get_life_used_months(self, obj):
        from django.utils import timezone
        if not obj.acquisition_date:
            return 0
        delta = timezone.now().date() - obj.acquisition_date
        months_used = delta.days // 30
        if obj.asset_type == 'physical' and obj.useful_life_months:
            return min(months_used, obj.useful_life_months)
        if obj.asset_type == 'software' and obj.amortization_months:
            return min(months_used, obj.amortization_months)
        if obj.asset_type == 'annual_license':
            return min(months_used, 12)
        return months_used


class ProfitDistPartnerSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProfitDistPartner
        fields = ['id', 'name', 'share_pct', 'is_active']


class ProfitDistConfigSerializer(serializers.ModelSerializer):
    partners = ProfitDistPartnerSerializer(many=True, read_only=True)

    class Meta:
        model = ProfitDistConfig
        fields = ['id', 'working_capital_pct', 'reserve_fund_pct', 'directors_pct',
                  'directors_cap', 'partners', 'updated_at']
