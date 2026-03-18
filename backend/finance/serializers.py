from rest_framework import serializers
from .models import BankAccount, Category, Invoice, Transaction, CostCenter, Budget


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
