'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  CreditCard,
  TrendingUp,
  FileText,
  AlertCircle,
  X,
  Tag,
  PieChart,
  Building,
  Plus,
  Pencil,
  Trash2,
  Landmark,
  Receipt,
  CheckCircle2,
  Clock,
  ArrowLeftRight,
  Filter,
  XCircle,
  Users,
  Building2,
  User,
  Search,
  Edit,
  Mail,
  Phone,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import FocusTrap from '@/components/ui/FocusTrap';
import api from '@/lib/api';
import { Sensitive } from '@/components/ui/Sensitive';
import { useDemoMode } from '@/components/ui/DemoContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FinanceCustomer {
  id: number;
  customer_type: 'PF' | 'PJ';
  company_name: string;
  trading_name: string;
  name: string;
  document: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  is_active: boolean;
  segment: string;
  source: string;
  created_at: string;
}

const CUSTOMER_EMPTY_FORM = {
  customer_type: 'PJ',
  company_name: '',
  trading_name: '',
  name: '',
  document: '',
  email: '',
  phone: '',
  city: '',
  state: '',
  segment: '',
  notes: '',
};

const CUSTOMER_SEGMENT_LABELS: Record<string, string> = {
  startup: 'Startup', smb: 'Pequena/Média Empresa', enterprise: 'Enterprise',
  government: 'Governo', education: 'Educação', health: 'Saúde',
  finance: 'Financeiro', retail: 'Varejo', industry: 'Indústria',
  tech: 'Tecnologia', other: 'Outro',
};

interface DashboardStats {
  pending_receivables: number;
  pending_payables: number;
  received_this_month: number;
  paid_this_month: number;
  balance: number;
  overdue_invoices: number;
}

interface Invoice {
  id: number;
  number: string;
  description: string;
  customer_name: string | null;
  total: string;
  due_date: string;
  status: string;
}

interface BankAccount {
  id: number;
  name: string;
}

interface Category {
  id: number;
  name: string;
  category_type: 'income' | 'expense' | 'both';
  parent: number | null;
  full_name: string;
  color: string;
  icon: string;
  is_active: boolean;
}

interface Budget {
  id: number;
  name: string;
  period: string;
  start_date: string;
  end_date: string;
  category: number;
  category_name: string;
  cost_center: number | null;
  cost_center_name: string | null;
  planned: string;
  actual: string;
  progress: number;
  is_active: boolean;
}

interface CostCenter {
  id: number;
  name: string;
  code: string;
  description: string;
  is_active: boolean;
}

interface FullInvoice {
  id: number;
  number: string;
  invoice_type: 'receivable' | 'payable';
  description: string;
  customer: number | null;
  customer_name: string | null;
  value: string;
  discount: string;
  total: string;
  issue_date: string;
  due_date: string;
  paid_date: string | null;
  status: 'pending' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  bank_account: number | null;
  bank_account_name: string | null;
  category: number | null;
  category_name: string | null;
}

interface FullTransaction {
  id: number;
  transaction_type: 'income' | 'expense';
  description: string;
  amount: string;
  date: string;
  bank_account: number | null;
  bank_account_name: string | null;
  category: number | null;
  category_name: string | null;
  doc_type: string;
}

interface FullBankAccount {
  id: number;
  name: string;
  bank: string;
  account_type: string;
  agency: string;
  account_number: string;
  pix_key: string;
  balance: string;
  is_active: boolean;
  is_default: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatCurrency = (value: number | string) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));

const formatDate = (date: string) => new Date(date).toLocaleDateString('pt-BR');

const EMPTY_REVENUE = { description: '', amount: '', date: '', bank_account: '' };
const EMPTY_EXPENSE = { description: '', amount: '', date: '', bank_account: '' };

const CATEGORY_TYPES = [
  { value: 'income', label: 'Receita' },
  { value: 'expense', label: 'Despesa' },
  { value: 'both', label: 'Ambos' },
];

const BUDGET_PERIODS = [
  { value: 'monthly', label: 'Mensal' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'yearly', label: 'Anual' },
  { value: 'custom', label: 'Personalizado' },
];

type Tab = 'overview' | 'invoices' | 'transactions' | 'bank_accounts' | 'categories' | 'budgets' | 'cost_centers' | 'customers';

// ─── Component ────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const toast = useToast();
  const { isDemoMode } = useDemoMode();
  const today = new Date().toISOString().split('T')[0];

  const [activeTab, setActiveTab] = useState<Tab>('overview');

  // Overview state
  const [stats, setStats] = useState<DashboardStats>({
    pending_receivables: 0,
    pending_payables: 0,
    received_this_month: 0,
    paid_this_month: 0,
    balance: 0,
    overdue_invoices: 0,
  });
  const [receivables, setReceivables] = useState<Invoice[]>([]);
  const [payables, setPayables] = useState<Invoice[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRevenueModal, setShowRevenueModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [savingRevenue, setSavingRevenue] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [revenueForm, setRevenueForm] = useState({ ...EMPTY_REVENUE, date: today });
  const [expenseForm, setExpenseForm] = useState({ ...EMPTY_EXPENSE, date: today });

  // Categories state
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState<Category | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    name: '', category_type: 'expense', color: '#A6864A', icon: '',
  });

  // Budgets state
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loadingBudgets, setLoadingBudgets] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  const [confirmDeleteBudget, setConfirmDeleteBudget] = useState<Budget | null>(null);
  const [budgetForm, setBudgetForm] = useState({
    name: '', period: 'monthly', start_date: today, end_date: '', category: '', planned: '',
  });

  // Cost Centers state
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [loadingCostCenters, setLoadingCostCenters] = useState(false);
  const [showCostCenterModal, setShowCostCenterModal] = useState(false);
  const [editingCostCenter, setEditingCostCenter] = useState<CostCenter | null>(null);
  const [savingCostCenter, setSavingCostCenter] = useState(false);
  const [confirmDeleteCostCenter, setConfirmDeleteCostCenter] = useState<CostCenter | null>(null);
  const [costCenterForm, setCostCenterForm] = useState({ name: '', code: '', description: '' });

  // Invoices state
  const [invoices, setInvoices] = useState<FullInvoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [invoiceTypeFilter, setInvoiceTypeFilter] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('');
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<FullInvoice | null>(null);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [markingPaid, setMarkingPaid] = useState<number | null>(null);
  const [confirmDeleteInvoice, setConfirmDeleteInvoice] = useState<FullInvoice | null>(null);
  const [invoiceForm, setInvoiceForm] = useState({
    invoice_type: 'receivable', description: '', value: '', due_date: today,
    issue_date: today, bank_account: '', category: '', customer: '',
  });

  // Transactions state
  const [transactions, setTransactions] = useState<FullTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [txTypeFilter, setTxTypeFilter] = useState('');
  const [txBankFilter, setTxBankFilter] = useState('');
  const [txFromDate, setTxFromDate] = useState('');
  const [txToDate, setTxToDate] = useState('');
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [savingTransaction, setSavingTransaction] = useState(false);
  const [confirmDeleteTransaction, setConfirmDeleteTransaction] = useState<FullTransaction | null>(null);
  const [transactionForm, setTransactionForm] = useState({
    transaction_type: 'income', description: '', amount: '', date: today,
    bank_account: '', category: '',
  });

  // Full Bank Accounts state
  const [fullBankAccounts, setFullBankAccounts] = useState<FullBankAccount[]>([]);
  const [loadingFullBankAccounts, setLoadingFullBankAccounts] = useState(false);
  const [showBankAccountModal, setShowBankAccountModal] = useState(false);
  const [editingBankAccount, setEditingBankAccount] = useState<FullBankAccount | null>(null);
  const [savingBankAccount, setSavingBankAccount] = useState(false);
  const [confirmDeleteBankAccount, setConfirmDeleteBankAccount] = useState<FullBankAccount | null>(null);
  const [bankAccountForm, setBankAccountForm] = useState({
    name: '', bank: '', account_type: 'checking', agency: '', account_number: '', pix_key: '',
  });

  // Customers state
  const [financeCustomers, setFinanceCustomers] = useState<FinanceCustomer[]>([]);
  const [loadingFinanceCustomers, setLoadingFinanceCustomers] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<FinanceCustomer | null>(null);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [confirmDeleteCustomer, setConfirmDeleteCustomer] = useState<FinanceCustomer | null>(null);
  const [customerForm, setCustomerForm] = useState({ ...CUSTOMER_EMPTY_FORM });

  // ── Overview fetch ────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsData, receivablesData, payablesData, bankData] = await Promise.all([
        api.get<DashboardStats>('/finance/invoices/dashboard/'),
        api.get<{ results?: Invoice[] }>('/finance/invoices/', { invoice_type: 'receivable', status: 'pending' }),
        api.get<{ results?: Invoice[] }>('/finance/invoices/', { invoice_type: 'payable', status: 'pending' }),
        api.get<{ results?: BankAccount[] }>('/finance/bank-accounts/'),
      ]);

      setStats(statsData);
      const recList = receivablesData.results || receivablesData;
      const payList = payablesData.results || payablesData;
      setReceivables(Array.isArray(recList) ? recList.slice(0, 5) : []);
      setPayables(Array.isArray(payList) ? payList.slice(0, 5) : []);
      const accounts: BankAccount[] = Array.isArray(bankData.results || bankData) ? (bankData.results || bankData) as BankAccount[] : [];
      setBankAccounts(accounts);
      if (accounts.length > 0) {
        const defaultId = String(accounts[0].id);
        setRevenueForm(f => ({ ...f, bank_account: defaultId }));
        setExpenseForm(f => ({ ...f, bank_account: defaultId }));
      }
    } catch {
      toast.error('Erro ao carregar dados financeiros.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Categories fetch ──────────────────────────────────────────────────────

  const fetchCategories = useCallback(async () => {
    setLoadingCategories(true);
    try {
      const data = await api.get<{ results?: Category[] }>('/finance/categories/');
      const list = data.results || data;
      setCategories(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Erro ao carregar categorias.');
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  // ── Budgets fetch ─────────────────────────────────────────────────────────

  const fetchBudgets = useCallback(async () => {
    setLoadingBudgets(true);
    try {
      const data = await api.get<{ results?: Budget[] }>('/finance/budgets/');
      const list = data.results || data;
      setBudgets(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Erro ao carregar orçamentos.');
    } finally {
      setLoadingBudgets(false);
    }
  }, []);

  // ── Cost Centers fetch ────────────────────────────────────────────────────

  const fetchCostCenters = useCallback(async () => {
    setLoadingCostCenters(true);
    try {
      const data = await api.get<{ results?: CostCenter[] }>('/finance/cost-centers/');
      const list = data.results || data;
      setCostCenters(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Erro ao carregar centros de custo.');
    } finally {
      setLoadingCostCenters(false);
    }
  }, []);

  // ── Invoices fetch ────────────────────────────────────────────────────────

  const fetchInvoices = useCallback(async (typeF = invoiceTypeFilter, statusF = invoiceStatusFilter) => {
    setLoadingInvoices(true);
    try {
      const params: Record<string, string> = {};
      if (typeF) params.invoice_type = typeF;
      if (statusF) params.status = statusF;
      const data = await api.get<{ results?: FullInvoice[] }>('/finance/invoices/', params);
      const list = data.results || data;
      setInvoices(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Erro ao carregar faturas.');
    } finally {
      setLoadingInvoices(false);
    }
  }, [invoiceTypeFilter, invoiceStatusFilter]);

  // ── Transactions fetch ────────────────────────────────────────────────────

  const fetchTransactions = useCallback(async (typeF = txTypeFilter, bankF = txBankFilter, fromF = txFromDate, toF = txToDate) => {
    setLoadingTransactions(true);
    try {
      const params: Record<string, string> = {};
      if (typeF) params.type = typeF;
      if (bankF) params.bank = bankF;
      if (fromF) params.from = fromF;
      if (toF) params.to = toF;
      const data = await api.get<{ results?: FullTransaction[] }>('/finance/transactions/', params);
      const list = data.results || data;
      setTransactions(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Erro ao carregar transações.');
    } finally {
      setLoadingTransactions(false);
    }
  }, [txTypeFilter, txBankFilter, txFromDate, txToDate]);

  // ── Full Bank Accounts fetch ───────────────────────────────────────────────

  const fetchFullBankAccounts = useCallback(async () => {
    setLoadingFullBankAccounts(true);
    try {
      const data = await api.get<{ results?: FullBankAccount[] }>('/finance/bank-accounts/');
      const list = data.results || data;
      setFullBankAccounts(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Erro ao carregar contas bancárias.');
    } finally {
      setLoadingFullBankAccounts(false);
    }
  }, []);

  const fetchFinanceCustomers = useCallback(async () => {
    setLoadingFinanceCustomers(true);
    try {
      const data = await api.get<{ results?: FinanceCustomer[] }>('/sales/customers/', { page_size: '500' });
      const list = data.results ?? data;
      setFinanceCustomers(Array.isArray(list) ? list as FinanceCustomer[] : []);
    } catch {
      toast.error('Erro ao carregar clientes.');
    } finally {
      setLoadingFinanceCustomers(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'categories' && categories.length === 0) fetchCategories();
    if (activeTab === 'budgets') {
      fetchBudgets();
      if (categories.length === 0) fetchCategories();
    }
    if (activeTab === 'cost_centers' && costCenters.length === 0) fetchCostCenters();
    if (activeTab === 'invoices') { fetchInvoices(); fetchFinanceCustomers(); }
    if (activeTab === 'transactions') {
      fetchTransactions();
      if (bankAccounts.length === 0) fetchData();
    }
    if (activeTab === 'bank_accounts') fetchFullBankAccounts();
    if (activeTab === 'customers') fetchFinanceCustomers();
  }, [activeTab]);

  // ── Revenue / Expense handlers ────────────────────────────────────────────

  const handleCreateRevenue = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRevenue(true);
    try {
      await api.post('/finance/transactions/', {
        transaction_type: 'income', doc_type: 'manual',
        description: revenueForm.description, amount: revenueForm.amount,
        date: revenueForm.date, bank_account: Number(revenueForm.bank_account),
      });
      toast.success('Receita criada com sucesso!');
      setShowRevenueModal(false);
      setRevenueForm({ ...EMPTY_REVENUE, date: today, bank_account: revenueForm.bank_account });
      fetchData();
    } catch {
      toast.error('Erro ao criar receita. Verifique os dados e tente novamente.');
    } finally {
      setSavingRevenue(false);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingExpense(true);
    try {
      await api.post('/finance/transactions/', {
        transaction_type: 'expense', doc_type: 'manual',
        description: expenseForm.description, amount: expenseForm.amount,
        date: expenseForm.date, bank_account: Number(expenseForm.bank_account),
      });
      toast.success('Despesa criada com sucesso!');
      setShowExpenseModal(false);
      setExpenseForm({ ...EMPTY_EXPENSE, date: today, bank_account: expenseForm.bank_account });
      fetchData();
    } catch {
      toast.error('Erro ao criar despesa. Verifique os dados e tente novamente.');
    } finally {
      setSavingExpense(false);
    }
  };

  // ── Category handlers ─────────────────────────────────────────────────────

  const openNewCategory = () => {
    setEditingCategory(null);
    setCategoryForm({ name: '', category_type: 'expense', color: '#A6864A', icon: '' });
    setShowCategoryModal(true);
  };

  const openEditCategory = (cat: Category) => {
    setEditingCategory(cat);
    setCategoryForm({ name: cat.name, category_type: cat.category_type, color: cat.color || '#A6864A', icon: cat.icon || '' });
    setShowCategoryModal(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCategory(true);
    try {
      if (editingCategory) {
        await api.patch(`/finance/categories/${editingCategory.id}/`, categoryForm);
      } else {
        await api.post('/finance/categories/', categoryForm);
      }
      toast.success(editingCategory ? 'Categoria atualizada!' : 'Categoria criada!');
      setShowCategoryModal(false);
      fetchCategories();
    } catch {
      toast.error('Erro ao salvar categoria.');
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!confirmDeleteCategory) return;
    try {
      await api.delete(`/finance/categories/${confirmDeleteCategory.id}/`);
      toast.success('Categoria removida.');
      setConfirmDeleteCategory(null);
      fetchCategories();
    } catch {
      toast.error('Erro ao remover categoria.');
    }
  };

  // ── Budget handlers ───────────────────────────────────────────────────────

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBudget(true);
    try {
      await api.post('/finance/budgets/', { ...budgetForm, category: Number(budgetForm.category), planned: budgetForm.planned });
      toast.success('Orçamento criado!');
      setShowBudgetModal(false);
      setBudgetForm({ name: '', period: 'monthly', start_date: today, end_date: '', category: '', planned: '' });
      fetchBudgets();
    } catch {
      toast.error('Erro ao criar orçamento.');
    } finally {
      setSavingBudget(false);
    }
  };

  const handleDeleteBudget = async () => {
    if (!confirmDeleteBudget) return;
    try {
      await api.delete(`/finance/budgets/${confirmDeleteBudget.id}/`);
      toast.success('Orçamento removido.');
      setConfirmDeleteBudget(null);
      fetchBudgets();
    } catch {
      toast.error('Erro ao remover orçamento.');
    }
  };

  // ── Cost Center handlers ──────────────────────────────────────────────────

  const openNewCostCenter = () => {
    setEditingCostCenter(null);
    setCostCenterForm({ name: '', code: '', description: '' });
    setShowCostCenterModal(true);
  };

  const openEditCostCenter = (cc: CostCenter) => {
    setEditingCostCenter(cc);
    setCostCenterForm({ name: cc.name, code: cc.code, description: cc.description });
    setShowCostCenterModal(true);
  };

  const handleSaveCostCenter = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCostCenter(true);
    try {
      if (editingCostCenter) {
        await api.patch(`/finance/cost-centers/${editingCostCenter.id}/`, costCenterForm);
      } else {
        await api.post('/finance/cost-centers/', costCenterForm);
      }
      toast.success(editingCostCenter ? 'Centro de custo atualizado!' : 'Centro de custo criado!');
      setShowCostCenterModal(false);
      fetchCostCenters();
    } catch {
      toast.error('Erro ao salvar centro de custo.');
    } finally {
      setSavingCostCenter(false);
    }
  };

  const handleDeleteCostCenter = async () => {
    if (!confirmDeleteCostCenter) return;
    try {
      await api.delete(`/finance/cost-centers/${confirmDeleteCostCenter.id}/`);
      toast.success('Centro de custo removido.');
      setConfirmDeleteCostCenter(null);
      fetchCostCenters();
    } catch {
      toast.error('Erro ao remover centro de custo.');
    }
  };

  // ── Invoice handlers ──────────────────────────────────────────────────────

  const openNewInvoice = () => {
    setEditingInvoice(null);
    setInvoiceForm({ invoice_type: 'receivable', description: '', value: '', due_date: today, issue_date: today, bank_account: bankAccounts.length > 0 ? String(bankAccounts[0].id) : '', category: '', customer: '' });
    setShowInvoiceModal(true);
  };

  const openEditInvoice = (inv: FullInvoice) => {
    setEditingInvoice(inv);
    setInvoiceForm({
      invoice_type: inv.invoice_type, description: inv.description, value: inv.value,
      due_date: inv.due_date, issue_date: inv.issue_date,
      bank_account: inv.bank_account ? String(inv.bank_account) : '',
      category: inv.category ? String(inv.category) : '',
      customer: inv.customer ? String(inv.customer) : '',
    });
    setShowInvoiceModal(true);
  };

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingInvoice(true);
    try {
      const body: Record<string, unknown> = {
        invoice_type: invoiceForm.invoice_type, description: invoiceForm.description,
        value: invoiceForm.value, due_date: invoiceForm.due_date, issue_date: invoiceForm.issue_date,
      };
      if (invoiceForm.bank_account) body.bank_account = Number(invoiceForm.bank_account);
      if (invoiceForm.category) body.category = Number(invoiceForm.category);
      if (invoiceForm.customer) body.customer = Number(invoiceForm.customer);
      if (editingInvoice) {
        await api.patch(`/finance/invoices/${editingInvoice.id}/`, body);
      } else {
        await api.post('/finance/invoices/', body);
      }
      toast.success(editingInvoice ? 'Fatura atualizada!' : 'Fatura criada!');
      setShowInvoiceModal(false);
      fetchInvoices();
    } catch {
      toast.error('Erro ao salvar fatura.');
    } finally {
      setSavingInvoice(false);
    }
  };

  const handleMarkPaid = async (inv: FullInvoice) => {
    setMarkingPaid(inv.id);
    try {
      await api.post(`/finance/invoices/${inv.id}/mark_paid/`);
      toast.success(`Fatura ${inv.number} marcada como paga!`);
      fetchInvoices();
      fetchData();
    } catch {
      toast.error('Erro ao marcar fatura como paga.');
    } finally {
      setMarkingPaid(null);
    }
  };

  const handleDeleteInvoice = async () => {
    if (!confirmDeleteInvoice) return;
    try {
      await api.delete(`/finance/invoices/${confirmDeleteInvoice.id}/`);
      toast.success('Fatura removida.');
      setConfirmDeleteInvoice(null);
      fetchInvoices();
    } catch {
      toast.error('Erro ao remover fatura.');
    }
  };

  // ── Transaction handlers ──────────────────────────────────────────────────

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTransaction(true);
    try {
      const body: Record<string, unknown> = {
        transaction_type: transactionForm.transaction_type, description: transactionForm.description,
        amount: transactionForm.amount, date: transactionForm.date, doc_type: 'manual',
      };
      if (transactionForm.bank_account) body.bank_account = Number(transactionForm.bank_account);
      if (transactionForm.category) body.category = Number(transactionForm.category);
      await api.post('/finance/transactions/', body);
      toast.success('Transação criada!');
      setShowTransactionModal(false);
      setTransactionForm({ transaction_type: 'income', description: '', amount: '', date: today, bank_account: '', category: '' });
      fetchTransactions();
    } catch {
      toast.error('Erro ao criar transação.');
    } finally {
      setSavingTransaction(false);
    }
  };

  const handleDeleteTransaction = async () => {
    if (!confirmDeleteTransaction) return;
    try {
      await api.delete(`/finance/transactions/${confirmDeleteTransaction.id}/`);
      toast.success('Transação removida.');
      setConfirmDeleteTransaction(null);
      fetchTransactions();
    } catch {
      toast.error('Erro ao remover transação.');
    }
  };

  // ── Bank Account handlers ─────────────────────────────────────────────────

  // ── Customer handlers ─────────────────────────────────────────────────────

  const openNewCustomer = () => {
    setEditingCustomer(null);
    setCustomerForm({ ...CUSTOMER_EMPTY_FORM });
    setShowCustomerModal(true);
  };

  const openEditCustomer = (c: FinanceCustomer) => {
    setEditingCustomer(c);
    setCustomerForm({
      customer_type: c.customer_type, company_name: c.company_name || '',
      trading_name: c.trading_name || '', name: c.name || '',
      document: c.document || '', email: c.email || '', phone: c.phone || '',
      city: c.city || '', state: c.state || '', segment: c.segment || '', notes: '',
    });
    setShowCustomerModal(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCustomer(true);
    try {
      if (editingCustomer) {
        await api.patch(`/sales/customers/${editingCustomer.id}/`, customerForm);
        toast.success('Cliente atualizado!');
      } else {
        await api.post('/sales/customers/', customerForm);
        toast.success('Cliente cadastrado!');
      }
      setShowCustomerModal(false);
      fetchFinanceCustomers();
    } catch {
      toast.error('Erro ao salvar cliente.');
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!confirmDeleteCustomer) return;
    try {
      await api.delete(`/sales/customers/${confirmDeleteCustomer.id}/`);
      toast.success('Cliente removido.');
      setConfirmDeleteCustomer(null);
      fetchFinanceCustomers();
    } catch {
      toast.error('Erro ao remover cliente.');
    }
  };

  const filteredCustomers = financeCustomers.filter(c => {
    if (!customerSearch) return true;
    const q = customerSearch.toLowerCase();
    return (c.company_name || c.name || '').toLowerCase().includes(q) ||
           c.email.toLowerCase().includes(q) ||
           c.document.includes(q);
  });

  const openNewBankAccount = () => {
    setEditingBankAccount(null);
    setBankAccountForm({ name: '', bank: '', account_type: 'checking', agency: '', account_number: '', pix_key: '' });
    setShowBankAccountModal(true);
  };

  const openEditBankAccount = (ba: FullBankAccount) => {
    setEditingBankAccount(ba);
    setBankAccountForm({ name: ba.name, bank: ba.bank || '', account_type: ba.account_type || 'checking', agency: ba.agency || '', account_number: ba.account_number || '', pix_key: ba.pix_key || '' });
    setShowBankAccountModal(true);
  };

  const handleSaveBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBankAccount(true);
    try {
      if (editingBankAccount) {
        await api.patch(`/finance/bank-accounts/${editingBankAccount.id}/`, bankAccountForm);
      } else {
        await api.post('/finance/bank-accounts/', bankAccountForm);
      }
      toast.success(editingBankAccount ? 'Conta atualizada!' : 'Conta criada!');
      setShowBankAccountModal(false);
      fetchFullBankAccounts();
      fetchData();
    } catch {
      toast.error('Erro ao salvar conta bancária.');
    } finally {
      setSavingBankAccount(false);
    }
  };

  const handleDeleteBankAccount = async () => {
    if (!confirmDeleteBankAccount) return;
    try {
      await api.delete(`/finance/bank-accounts/${confirmDeleteBankAccount.id}/`);
      toast.success('Conta removida.');
      setConfirmDeleteBankAccount(null);
      fetchFullBankAccounts();
    } catch {
      toast.error('Erro ao remover conta bancária.');
    }
  };

  // ── Budget progress color ─────────────────────────────────────────────────

  const budgetColor = (progress: number) => {
    if (progress >= 100) return 'bg-red-50 dark:bg-red-900/300';
    if (progress >= 80) return 'bg-orange-400';
    return 'bg-accent-gold';
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Visão Geral', icon: <TrendingUp className="w-4 h-4" /> },
    { key: 'invoices', label: 'Faturas', icon: <Receipt className="w-4 h-4" /> },
    { key: 'transactions', label: 'Transações', icon: <ArrowLeftRight className="w-4 h-4" /> },
    { key: 'bank_accounts', label: 'Contas Bancárias', icon: <Landmark className="w-4 h-4" /> },
    { key: 'categories', label: 'Categorias', icon: <Tag className="w-4 h-4" /> },
    { key: 'budgets', label: 'Orçamentos', icon: <PieChart className="w-4 h-4" /> },
    { key: 'cost_centers', label: 'Centros de Custo', icon: <Building className="w-4 h-4" /> },
    { key: 'customers', label: 'Clientes', icon: <Users className="w-4 h-4" /> },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Financeiro</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Controle de receitas, despesas e orçamentos</p>
        </div>
        {activeTab === 'overview' && (
          <div className="flex items-center gap-3">
            <button onClick={() => setShowRevenueModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
              <ArrowUpRight className="w-5 h-5" /> Nova Receita
            </button>
            <button onClick={() => setShowExpenseModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
              <ArrowDownRight className="w-5 h-5" /> Nova Despesa
            </button>
          </div>
        )}
        {activeTab === 'invoices' && (
          <button onClick={openNewInvoice}
            className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors">
            <Plus className="w-5 h-5" /> Nova Fatura
          </button>
        )}
        {activeTab === 'transactions' && (
          <button onClick={() => setShowTransactionModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors">
            <Plus className="w-5 h-5" /> Nova Transação
          </button>
        )}
        {activeTab === 'bank_accounts' && (
          <button onClick={openNewBankAccount}
            className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors">
            <Plus className="w-5 h-5" /> Nova Conta
          </button>
        )}
        {activeTab === 'categories' && (
          <button onClick={openNewCategory}
            className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors">
            <Plus className="w-5 h-5" /> Nova Categoria
          </button>
        )}
        {activeTab === 'budgets' && (
          <button onClick={() => setShowBudgetModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors">
            <Plus className="w-5 h-5" /> Novo Orçamento
          </button>
        )}
        {activeTab === 'cost_centers' && (
          <button onClick={openNewCostCenter}
            className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors">
            <Plus className="w-5 h-5" /> Novo Centro de Custo
          </button>
        )}
        {activeTab === 'customers' && (
          <button onClick={openNewCustomer}
            className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors">
            <Plus className="w-5 h-5" /> Cadastrar Cliente
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg p-1 w-fit">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-accent-gold text-white'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Overview Tab ─────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
            ) : (
              <>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-100 dark:border-gray-700">
                  <div className="w-12 h-12 bg-green-50 dark:bg-green-900/30 rounded-lg flex items-center justify-center mb-4">
                    <ArrowUpRight className="w-6 h-6 text-green-600" />
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Receitas do Mês</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mt-1"><Sensitive>{formatCurrency(stats.received_this_month)}</Sensitive></p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-100 dark:border-gray-700">
                  <div className="w-12 h-12 bg-red-50 dark:bg-red-900/30 rounded-lg flex items-center justify-center mb-4">
                    <ArrowDownRight className="w-6 h-6 text-red-600" />
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Despesas do Mês</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mt-1"><Sensitive>{formatCurrency(stats.paid_this_month)}</Sensitive></p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-100 dark:border-gray-700">
                  <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-4">
                    <DollarSign className="w-6 h-6 text-blue-600" />
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">A Receber</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mt-1"><Sensitive>{formatCurrency(stats.pending_receivables)}</Sensitive></p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-100 dark:border-gray-700">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-orange-50 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                      <CreditCard className="w-6 h-6 text-orange-600" />
                    </div>
                    {stats.overdue_invoices > 0 && (
                      <span className="px-2 py-1 bg-red-100 dark:bg-red-900/40 text-red-800 text-xs rounded-full flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> <Sensitive>{stats.overdue_invoices}</Sensitive> vencidas
                      </span>
                    )}
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">A Pagar</p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mt-1"><Sensitive>{formatCurrency(stats.pending_payables)}</Sensitive></p>
                </div>
              </>
            )}
          </div>

          {/* Receivables and Payables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Contas a Receber</h2>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />)}
                </div>
              ) : receivables.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Nenhuma conta pendente</p>
              ) : (
                <div className="space-y-3">
                  {receivables.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center flex-shrink-0">
                          <DollarSign className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100"><Sensitive>{inv.number || inv.description || `Fatura #${inv.id}`}</Sensitive></p>
                          <p className="text-xs text-gray-500 dark:text-gray-400"><Sensitive>{inv.customer_name || '—'}</Sensitive>{inv.due_date ? ` · Vence ${formatDate(inv.due_date)}` : ''}</p>
                        </div>
                      </div>
                      <span className="text-sm font-medium text-green-600 ml-4"><Sensitive>{formatCurrency(inv.total)}</Sensitive></span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Contas a Pagar</h2>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />)}
                </div>
              ) : payables.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Nenhuma conta pendente</p>
              ) : (
                <div className="space-y-3">
                  {payables.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center flex-shrink-0">
                          <CreditCard className="w-5 h-5 text-red-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100"><Sensitive>{inv.number || inv.description || `Despesa #${inv.id}`}</Sensitive></p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{inv.due_date ? `Vence ${formatDate(inv.due_date)}` : '—'}</p>
                        </div>
                      </div>
                      <span className="text-sm font-medium text-red-600 ml-4"><Sensitive>{formatCurrency(inv.total)}</Sensitive></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Ações Rápidas</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button onClick={() => setShowRevenueModal(true)}
                className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left">
                <FileText className="w-5 h-5 text-accent-gold mb-2" />
                <span className="text-sm font-medium">Nova Fatura</span>
              </button>
              <button onClick={() => setActiveTab('budgets')}
                className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left">
                <TrendingUp className="w-5 h-5 text-accent-gold mb-2" />
                <span className="text-sm font-medium">Orçamentos</span>
              </button>
              <button onClick={() => setActiveTab('cost_centers')}
                className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left">
                <DollarSign className="w-5 h-5 text-accent-gold mb-2" />
                <span className="text-sm font-medium">Centros de Custo</span>
              </button>
              <button onClick={() => setActiveTab('categories')}
                className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left">
                <Tag className="w-5 h-5 text-accent-gold mb-2" />
                <span className="text-sm font-medium">Categorias</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── Invoices Tab ─────────────────────────────────────────────────── */}
      {activeTab === 'invoices' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="card p-4 flex flex-wrap gap-3 items-center">
            <Filter className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <select value={invoiceTypeFilter}
              onChange={e => { setInvoiceTypeFilter(e.target.value); fetchInvoices(e.target.value, invoiceStatusFilter); }}
              className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900">
              <option value="">Todos os tipos</option>
              <option value="receivable">A Receber</option>
              <option value="payable">A Pagar</option>
            </select>
            <select value={invoiceStatusFilter}
              onChange={e => { setInvoiceStatusFilter(e.target.value); fetchInvoices(invoiceTypeFilter, e.target.value); }}
              className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900">
              <option value="">Todos os status</option>
              <option value="pending">Pendente</option>
              <option value="sent">Enviada</option>
              <option value="paid">Paga</option>
              <option value="overdue">Vencida</option>
              <option value="cancelled">Cancelada</option>
            </select>
            {(invoiceTypeFilter || invoiceStatusFilter) && (
              <button onClick={() => { setInvoiceTypeFilter(''); setInvoiceStatusFilter(''); fetchInvoices('', ''); }}
                className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700">
                <XCircle className="w-4 h-4" /> Limpar
              </button>
            )}
          </div>

          {/* Table */}
          <div className="card">
            {loadingInvoices ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />)}
              </div>
            ) : invoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500 dark:text-gray-400">
                <Receipt className="w-12 h-12 mb-3 opacity-30" />
                <p className="font-medium">Nenhuma fatura encontrada</p>
              </div>
            ) : (
              <table className="w-full table-premium">
                <thead>
                  <tr>
                    <th className="text-left">Número</th>
                    <th className="text-left">Descrição</th>
                    <th className="text-left">Tipo</th>
                    <th className="text-left">Vencimento</th>
                    <th className="text-right">Total</th>
                    <th className="text-left">Status</th>
                    <th className="text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="py-3 px-4 text-sm font-mono text-gray-900 dark:text-gray-100"><Sensitive>{inv.number}</Sensitive></td>
                      <td className="py-3 px-4">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{inv.description || '—'}</p>
                        {inv.customer_name && <p className="text-xs text-gray-500 dark:text-gray-400"><Sensitive>{inv.customer_name}</Sensitive></p>}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${inv.invoice_type === 'receivable' ? 'bg-green-100 dark:bg-green-900/40 text-green-800' : 'bg-red-100 dark:bg-red-900/40 text-red-800'}`}>
                          {inv.invoice_type === 'receivable' ? 'A Receber' : 'A Pagar'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">{inv.due_date ? formatDate(inv.due_date) : '—'}</td>
                      <td className="py-3 px-4 text-right text-sm font-medium text-gray-900 dark:text-gray-100"><Sensitive>{formatCurrency(inv.total)}</Sensitive></td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          inv.status === 'paid' ? 'bg-green-100 dark:bg-green-900/40 text-green-800' :
                          inv.status === 'overdue' ? 'bg-red-100 dark:bg-red-900/40 text-red-800' :
                          inv.status === 'cancelled' ? 'bg-gray-100 dark:bg-gray-700 text-gray-600' :
                          'bg-orange-100 dark:bg-orange-900/40 text-orange-800'
                        }`}>
                          {inv.status === 'paid' ? <CheckCircle2 className="w-3 h-3" /> :
                           inv.status === 'overdue' ? <AlertCircle className="w-3 h-3" /> :
                           <Clock className="w-3 h-3" />}
                          {inv.status === 'paid' ? 'Paga' : inv.status === 'overdue' ? 'Vencida' :
                           inv.status === 'cancelled' ? 'Cancelada' : inv.status === 'sent' ? 'Enviada' : 'Pendente'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1">
                          {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                            <button onClick={() => handleMarkPaid(inv)} disabled={markingPaid === inv.id}
                              title="Marcar como paga"
                              aria-label="Marcar como paga"
                              className="p-1.5 hover:bg-green-50 rounded-lg transition-colors text-gray-500 dark:text-gray-400 hover:text-green-600 disabled:opacity-50">
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => openEditInvoice(inv)}
                            aria-label="Editar"
                            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-900">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => setConfirmDeleteInvoice(inv)}
                            aria-label="Excluir"
                            className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-500 dark:text-gray-400 hover:text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ─── Transactions Tab ──────────────────────────────────────────────── */}
      {activeTab === 'transactions' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="card p-4 flex flex-wrap gap-3 items-center">
            <Filter className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <select value={txTypeFilter}
              onChange={e => { setTxTypeFilter(e.target.value); fetchTransactions(e.target.value, txBankFilter, txFromDate, txToDate); }}
              className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900">
              <option value="">Todos os tipos</option>
              <option value="income">Receita</option>
              <option value="expense">Despesa</option>
            </select>
            <select value={txBankFilter}
              onChange={e => { setTxBankFilter(e.target.value); fetchTransactions(txTypeFilter, e.target.value, txFromDate, txToDate); }}
              className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900">
              <option value="">Todas as contas</option>
              {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <input type="date" value={txFromDate} placeholder="De"
              onChange={e => { setTxFromDate(e.target.value); fetchTransactions(txTypeFilter, txBankFilter, e.target.value, txToDate); }}
              className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm" />
            <input type="date" value={txToDate} placeholder="Até"
              onChange={e => { setTxToDate(e.target.value); fetchTransactions(txTypeFilter, txBankFilter, txFromDate, e.target.value); }}
              className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm" />
            {(txTypeFilter || txBankFilter || txFromDate || txToDate) && (
              <button onClick={() => { setTxTypeFilter(''); setTxBankFilter(''); setTxFromDate(''); setTxToDate(''); fetchTransactions('', '', '', ''); }}
                className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700">
                <XCircle className="w-4 h-4" /> Limpar
              </button>
            )}
          </div>

          {/* Table */}
          <div className="card">
            {loadingTransactions ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />)}
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500 dark:text-gray-400">
                <ArrowLeftRight className="w-12 h-12 mb-3 opacity-30" />
                <p className="font-medium">Nenhuma transação encontrada</p>
              </div>
            ) : (
              <table className="w-full table-premium">
                <thead>
                  <tr>
                    <th className="text-left">Data</th>
                    <th className="text-left">Descrição</th>
                    <th className="text-left">Categoria</th>
                    <th className="text-left">Conta</th>
                    <th className="text-right">Valor</th>
                    <th className="text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDate(tx.date)}</td>
                      <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-gray-100">{tx.description || '—'}</td>
                      <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">{tx.category_name || '—'}</td>
                      <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">{tx.bank_account_name || '—'}</td>
                      <td className="py-3 px-4 text-right">
                        <span className={`text-sm font-semibold ${tx.transaction_type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                          {tx.transaction_type === 'income' ? '+' : '-'}<Sensitive>{formatCurrency(tx.amount)}</Sensitive>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button onClick={() => setConfirmDeleteTransaction(tx)}
                          aria-label="Excluir"
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-500 dark:text-gray-400 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ─── Bank Accounts Tab ────────────────────────────────────────────── */}
      {activeTab === 'bank_accounts' && (
        <div className="card">
          {loadingFullBankAccounts ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />)}
            </div>
          ) : fullBankAccounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500 dark:text-gray-400">
              <Landmark className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-medium">Nenhuma conta bancária cadastrada</p>
              <p className="text-sm mt-1">Cadastre contas para gerenciar seu fluxo de caixa</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Nome</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Banco</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Agência / Conta</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tipo</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Saldo</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {fullBankAccounts.map((ba) => (
                  <tr key={ba.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100"><Sensitive>{ba.name}</Sensitive></span>
                        {ba.is_default && (
                          <span className="px-1.5 py-0.5 bg-accent-gold/10 text-accent-gold text-xs rounded">Padrão</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">{ba.bank || '—'}</td>
                    <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                      <Sensitive>{ba.agency ? `Ag. ${ba.agency}` : ''}{ba.agency && ba.account_number ? ' / ' : ''}{ba.account_number || '—'}</Sensitive>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 text-xs rounded capitalize">
                        {ba.account_type === 'checking' ? 'Corrente' : ba.account_type === 'savings' ? 'Poupança' : ba.account_type || '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`text-sm font-semibold ${Number(ba.balance) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        <Sensitive>{formatCurrency(ba.balance)}</Sensitive>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEditBankAccount(ba)}
                          aria-label="Editar"
                          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-900">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setConfirmDeleteBankAccount(ba)}
                          aria-label="Excluir"
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-500 dark:text-gray-400 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ─── Categories Tab ────────────────────────────────────────────────── */}
      {activeTab === 'categories' && (
        <div className="card">
          {loadingCategories ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />)}
            </div>
          ) : categories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500 dark:text-gray-400">
              <Tag className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-medium">Nenhuma categoria cadastrada</p>
              <p className="text-sm mt-1">Crie categorias para organizar receitas e despesas</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Nome</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tipo</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Cor</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {categories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="py-3 px-4">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{cat.full_name || cat.name}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        cat.category_type === 'income' ? 'bg-green-100 dark:bg-green-900/40 text-green-800' :
                        cat.category_type === 'expense' ? 'bg-red-100 dark:bg-red-900/40 text-red-800' :
                        'bg-blue-100 dark:bg-blue-900/40 text-blue-800'
                      }`}>
                        {cat.category_type === 'income' ? 'Receita' : cat.category_type === 'expense' ? 'Despesa' : 'Ambos'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="w-6 h-6 rounded-full border border-gray-200 dark:border-gray-700" style={{ backgroundColor: cat.color || '#A6864A' }} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEditCategory(cat)}
                          aria-label="Editar"
                          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-900">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setConfirmDeleteCategory(cat)}
                          aria-label="Excluir"
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-500 dark:text-gray-400 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ─── Budgets Tab ──────────────────────────────────────────────────── */}
      {activeTab === 'budgets' && (
        <div className="space-y-4">
          {loadingBudgets ? (
            Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)
          ) : budgets.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-20 text-gray-500 dark:text-gray-400">
              <PieChart className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-medium">Nenhum orçamento cadastrado</p>
              <p className="text-sm mt-1">Crie orçamentos para monitorar seus gastos por categoria</p>
            </div>
          ) : (
            budgets.map((budget) => {
              const progress = Math.min(budget.progress, 100);
              return (
                <div key={budget.id} className="card p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100">{budget.name}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        {budget.category_name} · {formatDate(budget.start_date)} – {formatDate(budget.end_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        budget.progress >= 100 ? 'bg-red-100 dark:bg-red-900/40 text-red-800' :
                        budget.progress >= 80 ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-800' :
                        'bg-green-100 dark:bg-green-900/40 text-green-800'
                      }`}>
                        {budget.progress.toFixed(0)}%
                      </span>
                      <button onClick={() => setConfirmDeleteBudget(budget)}
                        aria-label="Excluir"
                        className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-500 dark:text-gray-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 mb-3">
                    <div className={`h-2 rounded-full transition-all ${budgetColor(budget.progress)}`}
                      style={{ width: `${progress}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Realizado: <span className="font-medium text-gray-900 dark:text-gray-100"><Sensitive>{formatCurrency(budget.actual)}</Sensitive></span></span>
                    <span className="text-gray-500 dark:text-gray-400">Planejado: <span className="font-medium text-gray-900 dark:text-gray-100"><Sensitive>{formatCurrency(budget.planned)}</Sensitive></span></span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ─── Cost Centers Tab ─────────────────────────────────────────────── */}
      {activeTab === 'cost_centers' && (
        <div className="card">
          {loadingCostCenters ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />)}
            </div>
          ) : costCenters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500 dark:text-gray-400">
              <Building className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-medium">Nenhum centro de custo cadastrado</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Nome</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Código</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Descrição</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {costCenters.map((cc) => (
                  <tr key={cc.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-gray-100">{cc.name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 text-xs rounded font-mono">{cc.code || '—'}</span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">{cc.description || '—'}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEditCostCenter(cc)}
                          aria-label="Editar"
                          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-900">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setConfirmDeleteCostCenter(cc)}
                          aria-label="Excluir"
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-500 dark:text-gray-400 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ─── Customers Tab ─────────────────────────────────────────────────── */}
      {activeTab === 'customers' && (
        <div>
          {/* Search bar */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nome, email ou documento..."
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                className="input-field pl-9"
              />
            </div>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {filteredCustomers.length} cliente{filteredCustomers.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="card overflow-hidden">
            {loadingFinanceCustomers ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 skeleton" />)}
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500 dark:text-gray-400">
                <Users className="w-12 h-12 mb-3 opacity-30" />
                <p className="font-medium mb-1">Nenhum cliente encontrado</p>
                <p className="text-sm">Cadastre o primeiro cliente clicando em "Cadastrar Cliente"</p>
              </div>
            ) : (
              <table className="w-full table-premium">
                <thead>
                  <tr>
                    <th className="text-left">Cliente</th>
                    <th className="hidden md:table-cell text-left">Tipo</th>
                    <th className="hidden md:table-cell text-left">Contato</th>
                    <th className="text-left">Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map(c => (
                    <tr key={c.id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${c.customer_type === 'PJ' ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-purple-100 dark:bg-purple-900/40'}`}>
                            {c.customer_type === 'PJ'
                              ? <Building2 className="w-4 h-4 text-blue-600" />
                              : <User className="w-4 h-4 text-purple-600" />}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              <Sensitive>{c.company_name || c.name || '—'}</Sensitive>
                            </p>
                            {c.document && <p className="text-xs text-gray-500 dark:text-gray-400 font-mono"><Sensitive>{c.document}</Sensitive></p>}
                          </div>
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium w-fit ${c.customer_type === 'PJ' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800' : 'bg-purple-100 dark:bg-purple-900/40 text-purple-800'}`}>
                            {c.customer_type === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}
                          </span>
                          {c.source === 'crm' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-900/25 text-amber-700 w-fit">
                              Via CRM
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-4 py-3">
                        {c.email && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-1">
                            <Mail className="w-3 h-3 flex-shrink-0" /><Sensitive>{c.email}</Sensitive>
                          </div>
                        )}
                        {c.phone && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                            <Phone className="w-3 h-3 flex-shrink-0" /><Sensitive>{c.phone}</Sensitive>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${c.is_active ? 'bg-green-100 dark:bg-green-900/40 text-green-800' : 'bg-gray-100 dark:bg-gray-700 text-gray-600'}`}>
                          {c.is_active && <span className="dot-pulse bg-green-500" />}
                          {c.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openEditCustomer(c)} aria-label="Editar"
                            className="p-1.5 text-gray-400 hover:text-accent-gold transition-colors">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => setConfirmDeleteCustomer(c)} aria-label="Excluir"
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════ MODALS ══════════════════════════════════════ */}

      {/* Invoice Modal */}
      {showInvoiceModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <FocusTrap onClose={() => setShowInvoiceModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto shadow-modal animate-modal-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{editingInvoice ? 'Editar Fatura' : 'Nova Fatura'}</h2>
              <button onClick={() => setShowInvoiceModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" aria-label="Fechar">
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleSaveInvoice} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Tipo *</label>
                <select required value={invoiceForm.invoice_type}
                  onChange={e => setInvoiceForm({ ...invoiceForm, invoice_type: e.target.value })}
                  className="input-field bg-white dark:bg-gray-800">
                  <option value="receivable">A Receber</option>
                  <option value="payable">A Pagar</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Descrição *</label>
                <input type="text" required value={invoiceForm.description}
                  onChange={e => setInvoiceForm({ ...invoiceForm, description: e.target.value })}
                  className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Valor (R$) *</label>
                  <input type="number" step="0.01" required value={invoiceForm.value}
                    onChange={e => setInvoiceForm({ ...invoiceForm, value: e.target.value })}
                    className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Emissão *</label>
                  <input type="date" required value={invoiceForm.issue_date}
                    onChange={e => setInvoiceForm({ ...invoiceForm, issue_date: e.target.value })}
                    className="input-field" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Vencimento *</label>
                <input type="date" required value={invoiceForm.due_date}
                  onChange={e => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })}
                  className="input-field" />
              </div>
              {bankAccounts.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Conta Bancária</label>
                  <select value={invoiceForm.bank_account}
                    onChange={e => setInvoiceForm({ ...invoiceForm, bank_account: e.target.value })}
                    className="input-field bg-white dark:bg-gray-800">
                    <option value="">Selecione uma conta</option>
                    {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              {categories.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Categoria</label>
                  <select value={invoiceForm.category}
                    onChange={e => setInvoiceForm({ ...invoiceForm, category: e.target.value })}
                    className="input-field bg-white dark:bg-gray-800">
                    <option value="">Sem categoria</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.full_name || c.name}</option>)}
                  </select>
                </div>
              )}
              {/* Cliente */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Cliente</label>
                  <button type="button" onClick={() => { setEditingCustomer(null); setCustomerForm({ ...CUSTOMER_EMPTY_FORM }); setShowCustomerModal(true); }}
                    className="text-xs text-accent-gold hover:text-accent-gold-dark font-medium flex items-center gap-1 transition-colors">
                    <Plus className="w-3 h-3" /> Novo
                  </button>
                </div>
                <select value={invoiceForm.customer}
                  onChange={e => setInvoiceForm({ ...invoiceForm, customer: e.target.value })}
                  className="input-field bg-white dark:bg-gray-800">
                  <option value="">Sem cliente vinculado</option>
                  {financeCustomers.map(c => (
                    <option key={c.id} value={c.id}>{c.company_name || c.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowInvoiceModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={savingInvoice}
                  className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60">
                  {savingInvoice ? 'Salvando...' : editingInvoice ? 'Atualizar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
          </FocusTrap>
        </div>
      )}

      {/* Transaction Modal */}
      {showTransactionModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <FocusTrap onClose={() => setShowTransactionModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 shadow-modal animate-modal-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Nova Transação</h2>
              <button onClick={() => setShowTransactionModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" aria-label="Fechar">
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleSaveTransaction} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Tipo *</label>
                <select required value={transactionForm.transaction_type}
                  onChange={e => setTransactionForm({ ...transactionForm, transaction_type: e.target.value })}
                  className="input-field bg-white dark:bg-gray-800">
                  <option value="income">Receita</option>
                  <option value="expense">Despesa</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Descrição *</label>
                <input type="text" required value={transactionForm.description}
                  onChange={e => setTransactionForm({ ...transactionForm, description: e.target.value })}
                  className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Valor (R$) *</label>
                  <input type="number" step="0.01" required value={transactionForm.amount}
                    onChange={e => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                    className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Data *</label>
                  <input type="date" required value={transactionForm.date}
                    onChange={e => setTransactionForm({ ...transactionForm, date: e.target.value })}
                    className="input-field" />
                </div>
              </div>
              {bankAccounts.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Conta Bancária</label>
                  <select value={transactionForm.bank_account}
                    onChange={e => setTransactionForm({ ...transactionForm, bank_account: e.target.value })}
                    className="input-field bg-white dark:bg-gray-800">
                    <option value="">Selecione uma conta</option>
                    {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              {categories.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Categoria</label>
                  <select value={transactionForm.category}
                    onChange={e => setTransactionForm({ ...transactionForm, category: e.target.value })}
                    className="input-field bg-white dark:bg-gray-800">
                    <option value="">Sem categoria</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.full_name || c.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowTransactionModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={savingTransaction}
                  className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60">
                  {savingTransaction ? 'Salvando...' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
          </FocusTrap>
        </div>
      )}

      {/* Bank Account Modal */}
      {showBankAccountModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <FocusTrap onClose={() => setShowBankAccountModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto shadow-modal animate-modal-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{editingBankAccount ? 'Editar Conta' : 'Nova Conta Bancária'}</h2>
              <button onClick={() => setShowBankAccountModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" aria-label="Fechar">
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleSaveBankAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Nome da Conta *</label>
                <input type="text" required value={bankAccountForm.name}
                  onChange={e => setBankAccountForm({ ...bankAccountForm, name: e.target.value })}
                  placeholder="Ex: Conta Principal"
                  className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Banco</label>
                <input type="text" value={bankAccountForm.bank}
                  onChange={e => setBankAccountForm({ ...bankAccountForm, bank: e.target.value })}
                  placeholder="Ex: Itaú, Nubank..."
                  className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Tipo de Conta</label>
                <select value={bankAccountForm.account_type}
                  onChange={e => setBankAccountForm({ ...bankAccountForm, account_type: e.target.value })}
                  className="input-field bg-white dark:bg-gray-800">
                  <option value="checking">Conta Corrente</option>
                  <option value="savings">Poupança</option>
                  <option value="investment">Investimento</option>
                  <option value="other">Outro</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Agência</label>
                  <input type="text" value={bankAccountForm.agency}
                    onChange={e => setBankAccountForm({ ...bankAccountForm, agency: e.target.value })}
                    placeholder="0001"
                    className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Número da Conta</label>
                  <input type="text" value={bankAccountForm.account_number}
                    onChange={e => setBankAccountForm({ ...bankAccountForm, account_number: e.target.value })}
                    placeholder="12345-6"
                    className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Chave Pix</label>
                <input type="text" value={bankAccountForm.pix_key}
                  onChange={e => setBankAccountForm({ ...bankAccountForm, pix_key: e.target.value })}
                  placeholder="CPF, CNPJ, e-mail ou telefone"
                  className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowBankAccountModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={savingBankAccount}
                  className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60">
                  {savingBankAccount ? 'Salvando...' : editingBankAccount ? 'Atualizar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
          </FocusTrap>
        </div>
      )}

      {/* Revenue Modal */}
      {showRevenueModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <FocusTrap onClose={() => setShowRevenueModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 shadow-modal animate-modal-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Nova Receita</h2>
              <button onClick={() => setShowRevenueModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" aria-label="Fechar">
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleCreateRevenue} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Descrição *</label>
                <input type="text" required value={revenueForm.description}
                  onChange={(e) => setRevenueForm({ ...revenueForm, description: e.target.value })}
                  className={`w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 ${isDemoMode ? 'sensitive-blur' : ''}`} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Valor (R$) *</label>
                <input type="number" step="0.01" required value={revenueForm.amount}
                  onChange={(e) => setRevenueForm({ ...revenueForm, amount: e.target.value })}
                  className={`w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 ${isDemoMode ? 'sensitive-blur' : ''}`} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Data *</label>
                <input type="date" required value={revenueForm.date}
                  onChange={(e) => setRevenueForm({ ...revenueForm, date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500" />
              </div>
              {bankAccounts.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Conta Bancária *</label>
                  <select required value={revenueForm.bank_account}
                    onChange={(e) => setRevenueForm({ ...revenueForm, bank_account: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 bg-white dark:bg-gray-800">
                    <option value="">Selecione uma conta</option>
                    {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowRevenueModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={savingRevenue}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-60">
                  {savingRevenue ? 'Salvando...' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
          </FocusTrap>
        </div>
      )}

      {/* Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <FocusTrap onClose={() => setShowExpenseModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 shadow-modal animate-modal-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Nova Despesa</h2>
              <button onClick={() => setShowExpenseModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" aria-label="Fechar">
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleCreateExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Descrição *</label>
                <input type="text" required value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className={`w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 ${isDemoMode ? 'sensitive-blur' : ''}`} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Valor (R$) *</label>
                <input type="number" step="0.01" required value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  className={`w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 ${isDemoMode ? 'sensitive-blur' : ''}`} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Data *</label>
                <input type="date" required value={expenseForm.date}
                  onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500" />
              </div>
              {bankAccounts.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Conta Bancária *</label>
                  <select required value={expenseForm.bank_account}
                    onChange={(e) => setExpenseForm({ ...expenseForm, bank_account: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 bg-white dark:bg-gray-800">
                    <option value="">Selecione uma conta</option>
                    {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowExpenseModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={savingExpense}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60">
                  {savingExpense ? 'Salvando...' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
          </FocusTrap>
        </div>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <FocusTrap onClose={() => setShowCategoryModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 shadow-modal animate-modal-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{editingCategory ? 'Editar Categoria' : 'Nova Categoria'}</h2>
              <button onClick={() => setShowCategoryModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" aria-label="Fechar">
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Nome *</label>
                <input type="text" required value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Tipo *</label>
                <select value={categoryForm.category_type}
                  onChange={(e) => setCategoryForm({ ...categoryForm, category_type: e.target.value })}
                  className="input-field bg-white dark:bg-gray-800">
                  {CATEGORY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Cor</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={categoryForm.color}
                    onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                    className="w-12 h-10 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">{categoryForm.color}</span>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowCategoryModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={savingCategory}
                  className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60">
                  {savingCategory ? 'Salvando...' : editingCategory ? 'Atualizar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
          </FocusTrap>
        </div>
      )}

      {/* Budget Modal */}
      {showBudgetModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <FocusTrap onClose={() => setShowBudgetModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-2xl mx-4 shadow-modal animate-modal-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Novo Orçamento</h2>
              <button onClick={() => setShowBudgetModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" aria-label="Fechar">
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleSaveBudget} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Nome *</label>
                <input type="text" required value={budgetForm.name}
                  onChange={(e) => setBudgetForm({ ...budgetForm, name: e.target.value })}
                  className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Categoria *</label>
                <select required value={budgetForm.category}
                  onChange={(e) => setBudgetForm({ ...budgetForm, category: e.target.value })}
                  className="input-field bg-white dark:bg-gray-800">
                  <option value="">Selecione uma categoria</option>
                  {categories.filter(c => c.category_type !== 'income').map(c => (
                    <option key={c.id} value={c.id}>{c.full_name || c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Período *</label>
                <select value={budgetForm.period}
                  onChange={(e) => setBudgetForm({ ...budgetForm, period: e.target.value })}
                  className="input-field bg-white dark:bg-gray-800">
                  {BUDGET_PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Início *</label>
                  <input type="date" required value={budgetForm.start_date}
                    onChange={(e) => setBudgetForm({ ...budgetForm, start_date: e.target.value })}
                    className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Fim *</label>
                  <input type="date" required value={budgetForm.end_date}
                    onChange={(e) => setBudgetForm({ ...budgetForm, end_date: e.target.value })}
                    className="input-field" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Valor Planejado (R$) *</label>
                <input type="number" step="0.01" required value={budgetForm.planned}
                  onChange={(e) => setBudgetForm({ ...budgetForm, planned: e.target.value })}
                  className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowBudgetModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={savingBudget}
                  className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60">
                  {savingBudget ? 'Salvando...' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
          </FocusTrap>
        </div>
      )}

      {/* Cost Center Modal */}
      {showCostCenterModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <FocusTrap onClose={() => setShowCostCenterModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 shadow-modal animate-modal-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{editingCostCenter ? 'Editar Centro de Custo' : 'Novo Centro de Custo'}</h2>
              <button onClick={() => setShowCostCenterModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" aria-label="Fechar">
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleSaveCostCenter} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Nome *</label>
                <input type="text" required value={costCenterForm.name}
                  onChange={(e) => setCostCenterForm({ ...costCenterForm, name: e.target.value })}
                  className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Código</label>
                <input type="text" value={costCenterForm.code}
                  onChange={(e) => setCostCenterForm({ ...costCenterForm, code: e.target.value })}
                  placeholder="Ex: CC-001"
                  className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Descrição</label>
                <textarea value={costCenterForm.description} rows={3}
                  onChange={(e) => setCostCenterForm({ ...costCenterForm, description: e.target.value })}
                  className={`input-field resize-none ${isDemoMode ? 'sensitive-blur' : ''}`} />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowCostCenterModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={savingCostCenter}
                  className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60">
                  {savingCostCenter ? 'Salvando...' : editingCostCenter ? 'Atualizar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
          </FocusTrap>
        </div>
      )}

      {/* Customer Modal */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <FocusTrap onClose={() => setShowCustomerModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto shadow-modal animate-modal-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{editingCustomer ? 'Editar Cliente' : 'Cadastrar Cliente'}</h2>
              <button onClick={() => setShowCustomerModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" aria-label="Fechar">
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleSaveCustomer} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Tipo *</label>
                <select required value={customerForm.customer_type}
                  onChange={e => setCustomerForm({ ...customerForm, customer_type: e.target.value })}
                  className="input-field bg-white dark:bg-gray-800">
                  <option value="PJ">Pessoa Jurídica</option>
                  <option value="PF">Pessoa Física</option>
                </select>
              </div>
              {customerForm.customer_type === 'PJ' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Razão Social *</label>
                    <input type="text" required value={customerForm.company_name}
                      onChange={e => setCustomerForm({ ...customerForm, company_name: e.target.value })}
                      className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Nome Fantasia</label>
                    <input type="text" value={customerForm.trading_name}
                      onChange={e => setCustomerForm({ ...customerForm, trading_name: e.target.value })}
                      className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Nome Completo *</label>
                  <input type="text" required value={customerForm.name}
                    onChange={e => setCustomerForm({ ...customerForm, name: e.target.value })}
                    className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{customerForm.customer_type === 'PJ' ? 'CNPJ' : 'CPF'}</label>
                  <input type="text" value={customerForm.document}
                    onChange={e => setCustomerForm({ ...customerForm, document: e.target.value })}
                    className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Segmento</label>
                  <select value={customerForm.segment}
                    onChange={e => setCustomerForm({ ...customerForm, segment: e.target.value })}
                    className="input-field bg-white dark:bg-gray-800">
                    <option value="">Selecione</option>
                    {Object.entries(CUSTOMER_SEGMENT_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">E-mail</label>
                  <input type="email" value={customerForm.email}
                    onChange={e => setCustomerForm({ ...customerForm, email: e.target.value })}
                    className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Telefone</label>
                  <input type="text" value={customerForm.phone}
                    onChange={e => setCustomerForm({ ...customerForm, phone: e.target.value })}
                    className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Cidade</label>
                  <input type="text" value={customerForm.city}
                    onChange={e => setCustomerForm({ ...customerForm, city: e.target.value })}
                    className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Estado (UF)</label>
                  <input type="text" maxLength={2} value={customerForm.state}
                    onChange={e => setCustomerForm({ ...customerForm, state: e.target.value.toUpperCase() })}
                    className="input-field" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Observações</label>
                <textarea rows={2} value={customerForm.notes}
                  onChange={e => setCustomerForm({ ...customerForm, notes: e.target.value })}
                  className="input-field resize-none" />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowCustomerModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={savingCustomer}
                  className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60">
                  {savingCustomer ? 'Salvando...' : editingCustomer ? 'Atualizar' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
          </FocusTrap>
        </div>
      )}

      {/* Confirm Dialogs */}
      <ConfirmDialog
        open={!!confirmDeleteCategory}
        title="Remover Categoria"
        description={`Deseja remover a categoria "${confirmDeleteCategory?.name}"? Esta ação não pode ser desfeita.`}
        onConfirm={handleDeleteCategory}
        onCancel={() => setConfirmDeleteCategory(null)}
      />
      <ConfirmDialog
        open={!!confirmDeleteBudget}
        title="Remover Orçamento"
        description={`Deseja remover o orçamento "${confirmDeleteBudget?.name}"?`}
        onConfirm={handleDeleteBudget}
        onCancel={() => setConfirmDeleteBudget(null)}
      />
      <ConfirmDialog
        open={!!confirmDeleteCostCenter}
        title="Remover Centro de Custo"
        description={`Deseja remover o centro de custo "${confirmDeleteCostCenter?.name}"?`}
        onConfirm={handleDeleteCostCenter}
        onCancel={() => setConfirmDeleteCostCenter(null)}
      />
      <ConfirmDialog
        open={!!confirmDeleteInvoice}
        title="Remover Fatura"
        description={`Deseja remover a fatura "${confirmDeleteInvoice?.number}"? Esta ação não pode ser desfeita.`}
        onConfirm={handleDeleteInvoice}
        onCancel={() => setConfirmDeleteInvoice(null)}
      />
      <ConfirmDialog
        open={!!confirmDeleteTransaction}
        title="Remover Transação"
        description={`Deseja remover a transação "${confirmDeleteTransaction?.description}"? Esta ação não pode ser desfeita.`}
        onConfirm={handleDeleteTransaction}
        onCancel={() => setConfirmDeleteTransaction(null)}
      />
      <ConfirmDialog
        open={!!confirmDeleteBankAccount}
        title="Remover Conta Bancária"
        description={`Deseja remover a conta "${confirmDeleteBankAccount?.name}"?`}
        onConfirm={handleDeleteBankAccount}
        onCancel={() => setConfirmDeleteBankAccount(null)}
      />
      <ConfirmDialog
        open={!!confirmDeleteCustomer}
        title="Remover Cliente"
        description={`Deseja remover o cliente "${confirmDeleteCustomer?.company_name || confirmDeleteCustomer?.name}"? Esta ação não pode ser desfeita.`}
        onConfirm={handleDeleteCustomer}
        onCancel={() => setConfirmDeleteCustomer(null)}
      />
    </div>
  );
}
