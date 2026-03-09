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
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

// ─── Types ────────────────────────────────────────────────────────────────────

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

type Tab = 'overview' | 'invoices' | 'transactions' | 'bank_accounts' | 'categories' | 'budgets' | 'cost_centers';

// ─── Component ────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const toast = useToast();
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
    issue_date: today, bank_account: '', category: '',
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

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
  const getHeaders = () => ({ 'Content-Type': 'application/json' });

  // ── Overview fetch ────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, receivablesRes, payablesRes, bankRes] = await Promise.all([
        fetch(`${apiUrl}/finance/invoices/dashboard/`, { headers: getHeaders(), credentials: 'include' }),
        fetch(`${apiUrl}/finance/invoices/?invoice_type=receivable&status=pending`, { headers: getHeaders(), credentials: 'include' }),
        fetch(`${apiUrl}/finance/invoices/?invoice_type=payable&status=pending`, { headers: getHeaders(), credentials: 'include' }),
        fetch(`${apiUrl}/finance/bank-accounts/`, { headers: getHeaders(), credentials: 'include' }),
      ]);

      if (!statsRes.ok || !receivablesRes.ok || !payablesRes.ok || !bankRes.ok) throw new Error('Unauthorized');
      const [statsData, receivablesData, payablesData, bankData] = await Promise.all([
        statsRes.json(), receivablesRes.json(), payablesRes.json(), bankRes.json(),
      ]);

      setStats(statsData);
      const recList = receivablesData.results || receivablesData;
      const payList = payablesData.results || payablesData;
      setReceivables(Array.isArray(recList) ? recList.slice(0, 5) : []);
      setPayables(Array.isArray(payList) ? payList.slice(0, 5) : []);
      const accounts: BankAccount[] = Array.isArray(bankData.results || bankData) ? (bankData.results || bankData) : [];
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
      const res = await fetch(`${apiUrl}/finance/categories/`, { headers: getHeaders(), credentials: 'include' });
      if (!res.ok) throw new Error('Unauthorized');
      const data = await res.json();
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
      const res = await fetch(`${apiUrl}/finance/budgets/`, { headers: getHeaders(), credentials: 'include' });
      if (!res.ok) throw new Error('Unauthorized');
      const data = await res.json();
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
      const res = await fetch(`${apiUrl}/finance/cost-centers/`, { headers: getHeaders(), credentials: 'include' });
      if (!res.ok) throw new Error('Unauthorized');
      const data = await res.json();
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
      const params = new URLSearchParams();
      if (typeF) params.set('invoice_type', typeF);
      if (statusF) params.set('status', statusF);
      const res = await fetch(`${apiUrl}/finance/invoices/?${params}`, { headers: getHeaders(), credentials: 'include' });
      if (!res.ok) throw new Error();
      const data = await res.json();
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
      const params = new URLSearchParams();
      if (typeF) params.set('type', typeF);
      if (bankF) params.set('bank', bankF);
      if (fromF) params.set('from', fromF);
      if (toF) params.set('to', toF);
      const res = await fetch(`${apiUrl}/finance/transactions/?${params}`, { headers: getHeaders(), credentials: 'include' });
      if (!res.ok) throw new Error();
      const data = await res.json();
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
      const res = await fetch(`${apiUrl}/finance/bank-accounts/`, { headers: getHeaders(), credentials: 'include' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const list = data.results || data;
      setFullBankAccounts(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Erro ao carregar contas bancárias.');
    } finally {
      setLoadingFullBankAccounts(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'categories' && categories.length === 0) fetchCategories();
    if (activeTab === 'budgets') {
      fetchBudgets();
      if (categories.length === 0) fetchCategories();
    }
    if (activeTab === 'cost_centers' && costCenters.length === 0) fetchCostCenters();
    if (activeTab === 'invoices') fetchInvoices();
    if (activeTab === 'transactions') {
      fetchTransactions();
      if (bankAccounts.length === 0) fetchData();
    }
    if (activeTab === 'bank_accounts') fetchFullBankAccounts();
  }, [activeTab]);

  // ── Revenue / Expense handlers ────────────────────────────────────────────

  const handleCreateRevenue = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRevenue(true);
    try {
      const res = await fetch(`${apiUrl}/finance/transactions/`, {
        method: 'POST', headers: getHeaders(), credentials: 'include',
        body: JSON.stringify({
          transaction_type: 'income', doc_type: 'manual',
          description: revenueForm.description, amount: revenueForm.amount,
          date: revenueForm.date, bank_account: Number(revenueForm.bank_account),
        }),
      });
      if (!res.ok) throw new Error();
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
      const res = await fetch(`${apiUrl}/finance/transactions/`, {
        method: 'POST', headers: getHeaders(), credentials: 'include',
        body: JSON.stringify({
          transaction_type: 'expense', doc_type: 'manual',
          description: expenseForm.description, amount: expenseForm.amount,
          date: expenseForm.date, bank_account: Number(expenseForm.bank_account),
        }),
      });
      if (!res.ok) throw new Error();
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
      const url = editingCategory
        ? `${apiUrl}/finance/categories/${editingCategory.id}/`
        : `${apiUrl}/finance/categories/`;
      const method = editingCategory ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getHeaders(), credentials: 'include', body: JSON.stringify(categoryForm) });
      if (!res.ok) throw new Error();
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
      await fetch(`${apiUrl}/finance/categories/${confirmDeleteCategory.id}/`, {
        method: 'DELETE', credentials: 'include',
      });
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
      const res = await fetch(`${apiUrl}/finance/budgets/`, {
        method: 'POST', headers: getHeaders(), credentials: 'include',
        body: JSON.stringify({ ...budgetForm, category: Number(budgetForm.category), planned: budgetForm.planned }),
      });
      if (!res.ok) throw new Error();
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
      await fetch(`${apiUrl}/finance/budgets/${confirmDeleteBudget.id}/`, { method: 'DELETE', credentials: 'include' });
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
      const url = editingCostCenter
        ? `${apiUrl}/finance/cost-centers/${editingCostCenter.id}/`
        : `${apiUrl}/finance/cost-centers/`;
      const method = editingCostCenter ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getHeaders(), credentials: 'include', body: JSON.stringify(costCenterForm) });
      if (!res.ok) throw new Error();
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
      await fetch(`${apiUrl}/finance/cost-centers/${confirmDeleteCostCenter.id}/`, { method: 'DELETE', credentials: 'include' });
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
    setInvoiceForm({ invoice_type: 'receivable', description: '', value: '', due_date: today, issue_date: today, bank_account: bankAccounts.length > 0 ? String(bankAccounts[0].id) : '', category: '' });
    setShowInvoiceModal(true);
  };

  const openEditInvoice = (inv: FullInvoice) => {
    setEditingInvoice(inv);
    setInvoiceForm({
      invoice_type: inv.invoice_type, description: inv.description, value: inv.value,
      due_date: inv.due_date, issue_date: inv.issue_date,
      bank_account: inv.bank_account ? String(inv.bank_account) : '',
      category: inv.category ? String(inv.category) : '',
    });
    setShowInvoiceModal(true);
  };

  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingInvoice(true);
    try {
      const url = editingInvoice ? `${apiUrl}/finance/invoices/${editingInvoice.id}/` : `${apiUrl}/finance/invoices/`;
      const method = editingInvoice ? 'PATCH' : 'POST';
      const body: Record<string, unknown> = {
        invoice_type: invoiceForm.invoice_type, description: invoiceForm.description,
        value: invoiceForm.value, due_date: invoiceForm.due_date, issue_date: invoiceForm.issue_date,
      };
      if (invoiceForm.bank_account) body.bank_account = Number(invoiceForm.bank_account);
      if (invoiceForm.category) body.category = Number(invoiceForm.category);
      const res = await fetch(url, { method, headers: getHeaders(), credentials: 'include', body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
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
      const res = await fetch(`${apiUrl}/finance/invoices/${inv.id}/mark_paid/`, { method: 'POST', headers: getHeaders(), credentials: 'include' });
      if (!res.ok) throw new Error();
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
      await fetch(`${apiUrl}/finance/invoices/${confirmDeleteInvoice.id}/`, { method: 'DELETE', credentials: 'include' });
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
      const res = await fetch(`${apiUrl}/finance/transactions/`, { method: 'POST', headers: getHeaders(), credentials: 'include', body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
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
      await fetch(`${apiUrl}/finance/transactions/${confirmDeleteTransaction.id}/`, { method: 'DELETE', credentials: 'include' });
      toast.success('Transação removida.');
      setConfirmDeleteTransaction(null);
      fetchTransactions();
    } catch {
      toast.error('Erro ao remover transação.');
    }
  };

  // ── Bank Account handlers ─────────────────────────────────────────────────

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
      const url = editingBankAccount ? `${apiUrl}/finance/bank-accounts/${editingBankAccount.id}/` : `${apiUrl}/finance/bank-accounts/`;
      const method = editingBankAccount ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getHeaders(), credentials: 'include', body: JSON.stringify(bankAccountForm) });
      if (!res.ok) throw new Error();
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
      await fetch(`${apiUrl}/finance/bank-accounts/${confirmDeleteBankAccount.id}/`, { method: 'DELETE', credentials: 'include' });
      toast.success('Conta removida.');
      setConfirmDeleteBankAccount(null);
      fetchFullBankAccounts();
    } catch {
      toast.error('Erro ao remover conta bancária.');
    }
  };

  // ── Budget progress color ─────────────────────────────────────────────────

  const budgetColor = (progress: number) => {
    if (progress >= 100) return 'bg-red-500';
    if (progress >= 80) return 'bg-orange-400';
    return 'bg-[#A6864A]';
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
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
          <p className="text-sm text-gray-500 mt-1">Controle de receitas, despesas e orçamentos</p>
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
            className="flex items-center gap-2 px-4 py-2 bg-[#A6864A] text-white rounded-lg hover:bg-[#8a6e3c] transition-colors">
            <Plus className="w-5 h-5" /> Nova Fatura
          </button>
        )}
        {activeTab === 'transactions' && (
          <button onClick={() => setShowTransactionModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#A6864A] text-white rounded-lg hover:bg-[#8a6e3c] transition-colors">
            <Plus className="w-5 h-5" /> Nova Transação
          </button>
        )}
        {activeTab === 'bank_accounts' && (
          <button onClick={openNewBankAccount}
            className="flex items-center gap-2 px-4 py-2 bg-[#A6864A] text-white rounded-lg hover:bg-[#8a6e3c] transition-colors">
            <Plus className="w-5 h-5" /> Nova Conta
          </button>
        )}
        {activeTab === 'categories' && (
          <button onClick={openNewCategory}
            className="flex items-center gap-2 px-4 py-2 bg-[#A6864A] text-white rounded-lg hover:bg-[#8a6e3c] transition-colors">
            <Plus className="w-5 h-5" /> Nova Categoria
          </button>
        )}
        {activeTab === 'budgets' && (
          <button onClick={() => setShowBudgetModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#A6864A] text-white rounded-lg hover:bg-[#8a6e3c] transition-colors">
            <Plus className="w-5 h-5" /> Novo Orçamento
          </button>
        )}
        {activeTab === 'cost_centers' && (
          <button onClick={openNewCostCenter}
            className="flex items-center gap-2 px-4 py-2 bg-[#A6864A] text-white rounded-lg hover:bg-[#8a6e3c] transition-colors">
            <Plus className="w-5 h-5" /> Novo Centro de Custo
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white border border-gray-100 rounded-lg p-1 w-fit">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-[#A6864A] text-white'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
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
                <div className="bg-white p-6 rounded-lg border border-gray-100">
                  <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mb-4">
                    <ArrowUpRight className="w-6 h-6 text-green-600" />
                  </div>
                  <p className="text-gray-500 text-sm">Receitas do Mês</p>
                  <p className="text-2xl font-semibold text-gray-900 mt-1">{formatCurrency(stats.received_this_month)}</p>
                </div>
                <div className="bg-white p-6 rounded-lg border border-gray-100">
                  <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center mb-4">
                    <ArrowDownRight className="w-6 h-6 text-red-600" />
                  </div>
                  <p className="text-gray-500 text-sm">Despesas do Mês</p>
                  <p className="text-2xl font-semibold text-gray-900 mt-1">{formatCurrency(stats.paid_this_month)}</p>
                </div>
                <div className="bg-white p-6 rounded-lg border border-gray-100">
                  <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center mb-4">
                    <DollarSign className="w-6 h-6 text-blue-600" />
                  </div>
                  <p className="text-gray-500 text-sm">A Receber</p>
                  <p className="text-2xl font-semibold text-gray-900 mt-1">{formatCurrency(stats.pending_receivables)}</p>
                </div>
                <div className="bg-white p-6 rounded-lg border border-gray-100">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center">
                      <CreditCard className="w-6 h-6 text-orange-600" />
                    </div>
                    {stats.overdue_invoices > 0 && (
                      <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {stats.overdue_invoices} vencidas
                      </span>
                    )}
                  </div>
                  <p className="text-gray-500 text-sm">A Pagar</p>
                  <p className="text-2xl font-semibold text-gray-900 mt-1">{formatCurrency(stats.pending_payables)}</p>
                </div>
              </>
            )}
          </div>

          {/* Receivables and Payables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Contas a Receber</h2>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
                </div>
              ) : receivables.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">Nenhuma conta pendente</p>
              ) : (
                <div className="space-y-3">
                  {receivables.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <DollarSign className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{inv.number || inv.description || `Fatura #${inv.id}`}</p>
                          <p className="text-xs text-gray-500">{inv.customer_name || '—'}{inv.due_date ? ` · Vence ${formatDate(inv.due_date)}` : ''}</p>
                        </div>
                      </div>
                      <span className="text-sm font-medium text-green-600 ml-4">{formatCurrency(inv.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Contas a Pagar</h2>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
                </div>
              ) : payables.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">Nenhuma conta pendente</p>
              ) : (
                <div className="space-y-3">
                  {payables.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <CreditCard className="w-5 h-5 text-red-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{inv.number || inv.description || `Despesa #${inv.id}`}</p>
                          <p className="text-xs text-gray-500">{inv.due_date ? `Vence ${formatDate(inv.due_date)}` : '—'}</p>
                        </div>
                      </div>
                      <span className="text-sm font-medium text-red-600 ml-4">{formatCurrency(inv.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Ações Rápidas</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <button onClick={() => setShowRevenueModal(true)}
                className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left">
                <FileText className="w-5 h-5 text-accent-gold mb-2" />
                <span className="text-sm font-medium">Nova Fatura</span>
              </button>
              <button onClick={() => setActiveTab('budgets')}
                className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left">
                <TrendingUp className="w-5 h-5 text-accent-gold mb-2" />
                <span className="text-sm font-medium">Orçamentos</span>
              </button>
              <button onClick={() => setActiveTab('cost_centers')}
                className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left">
                <DollarSign className="w-5 h-5 text-accent-gold mb-2" />
                <span className="text-sm font-medium">Centros de Custo</span>
              </button>
              <button onClick={() => setActiveTab('categories')}
                className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left">
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
            <Filter className="w-4 h-4 text-gray-500" />
            <select value={invoiceTypeFilter}
              onChange={e => { setInvoiceTypeFilter(e.target.value); fetchInvoices(e.target.value, invoiceStatusFilter); }}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white text-gray-900">
              <option value="">Todos os tipos</option>
              <option value="receivable">A Receber</option>
              <option value="payable">A Pagar</option>
            </select>
            <select value={invoiceStatusFilter}
              onChange={e => { setInvoiceStatusFilter(e.target.value); fetchInvoices(invoiceTypeFilter, e.target.value); }}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white text-gray-900">
              <option value="">Todos os status</option>
              <option value="pending">Pendente</option>
              <option value="sent">Enviada</option>
              <option value="paid">Paga</option>
              <option value="overdue">Vencida</option>
              <option value="cancelled">Cancelada</option>
            </select>
            {(invoiceTypeFilter || invoiceStatusFilter) && (
              <button onClick={() => { setInvoiceTypeFilter(''); setInvoiceStatusFilter(''); fetchInvoices('', ''); }}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
                <XCircle className="w-4 h-4" /> Limpar
              </button>
            )}
          </div>

          {/* Table */}
          <div className="card">
            {loadingInvoices ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
              </div>
            ) : invoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                <Receipt className="w-12 h-12 mb-3 opacity-30" />
                <p className="font-medium">Nenhuma fatura encontrada</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Número</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Descrição</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Vencimento</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4 text-sm font-mono text-gray-900">{inv.number}</td>
                      <td className="py-3 px-4">
                        <p className="text-sm font-medium text-gray-900">{inv.description || '—'}</p>
                        {inv.customer_name && <p className="text-xs text-gray-500">{inv.customer_name}</p>}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${inv.invoice_type === 'receivable' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {inv.invoice_type === 'receivable' ? 'A Receber' : 'A Pagar'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500">{inv.due_date ? formatDate(inv.due_date) : '—'}</td>
                      <td className="py-3 px-4 text-right text-sm font-medium text-gray-900">{formatCurrency(inv.total)}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                          inv.status === 'paid' ? 'bg-green-100 text-green-800' :
                          inv.status === 'overdue' ? 'bg-red-100 text-red-800' :
                          inv.status === 'cancelled' ? 'bg-gray-100 text-gray-600' :
                          'bg-orange-100 text-orange-800'
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
                              className="p-1.5 hover:bg-green-50 rounded-lg transition-colors text-gray-500 hover:text-green-600 disabled:opacity-50">
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => openEditInvoice(inv)}
                            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-900">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => setConfirmDeleteInvoice(inv)}
                            className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-500 hover:text-red-600">
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
            <Filter className="w-4 h-4 text-gray-500" />
            <select value={txTypeFilter}
              onChange={e => { setTxTypeFilter(e.target.value); fetchTransactions(e.target.value, txBankFilter, txFromDate, txToDate); }}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white text-gray-900">
              <option value="">Todos os tipos</option>
              <option value="income">Receita</option>
              <option value="expense">Despesa</option>
            </select>
            <select value={txBankFilter}
              onChange={e => { setTxBankFilter(e.target.value); fetchTransactions(txTypeFilter, e.target.value, txFromDate, txToDate); }}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white text-gray-900">
              <option value="">Todas as contas</option>
              {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <input type="date" value={txFromDate} placeholder="De"
              onChange={e => { setTxFromDate(e.target.value); fetchTransactions(txTypeFilter, txBankFilter, e.target.value, txToDate); }}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
            <input type="date" value={txToDate} placeholder="Até"
              onChange={e => { setTxToDate(e.target.value); fetchTransactions(txTypeFilter, txBankFilter, txFromDate, e.target.value); }}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
            {(txTypeFilter || txBankFilter || txFromDate || txToDate) && (
              <button onClick={() => { setTxTypeFilter(''); setTxBankFilter(''); setTxFromDate(''); setTxToDate(''); fetchTransactions('', '', '', ''); }}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
                <XCircle className="w-4 h-4" /> Limpar
              </button>
            )}
          </div>

          {/* Table */}
          <div className="card">
            {loadingTransactions ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                <ArrowLeftRight className="w-12 h-12 mb-3 opacity-30" />
                <p className="font-medium">Nenhuma transação encontrada</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Descrição</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoria</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Conta</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-4 text-sm text-gray-500 whitespace-nowrap">{formatDate(tx.date)}</td>
                      <td className="py-3 px-4 text-sm font-medium text-gray-900">{tx.description || '—'}</td>
                      <td className="py-3 px-4 text-sm text-gray-500">{tx.category_name || '—'}</td>
                      <td className="py-3 px-4 text-sm text-gray-500">{tx.bank_account_name || '—'}</td>
                      <td className="py-3 px-4 text-right">
                        <span className={`text-sm font-semibold ${tx.transaction_type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                          {tx.transaction_type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button onClick={() => setConfirmDeleteTransaction(tx)}
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-500 hover:text-red-600">
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
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          ) : fullBankAccounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <Landmark className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-medium">Nenhuma conta bancária cadastrada</p>
              <p className="text-sm mt-1">Cadastre contas para gerenciar seu fluxo de caixa</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Banco</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Agência / Conta</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Saldo</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {fullBankAccounts.map((ba) => (
                  <tr key={ba.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{ba.name}</span>
                        {ba.is_default && (
                          <span className="px-1.5 py-0.5 bg-[#A6864A]/10 text-[#A6864A] text-xs rounded">Padrão</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">{ba.bank || '—'}</td>
                    <td className="py-3 px-4 text-sm text-gray-500">
                      {ba.agency ? `Ag. ${ba.agency}` : ''}{ba.agency && ba.account_number ? ' / ' : ''}{ba.account_number || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded capitalize">
                        {ba.account_type === 'checking' ? 'Corrente' : ba.account_type === 'savings' ? 'Poupança' : ba.account_type || '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className={`text-sm font-semibold ${Number(ba.balance) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(ba.balance)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEditBankAccount(ba)}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-900">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setConfirmDeleteBankAccount(ba)}
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-500 hover:text-red-600">
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
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          ) : categories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <Tag className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-medium">Nenhuma categoria cadastrada</p>
              <p className="text-sm mt-1">Crie categorias para organizar receitas e despesas</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cor</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {categories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <span className="text-sm font-medium text-gray-900">{cat.full_name || cat.name}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        cat.category_type === 'income' ? 'bg-green-100 text-green-800' :
                        cat.category_type === 'expense' ? 'bg-red-100 text-red-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {cat.category_type === 'income' ? 'Receita' : cat.category_type === 'expense' ? 'Despesa' : 'Ambos'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="w-6 h-6 rounded-full border border-gray-200" style={{ backgroundColor: cat.color || '#A6864A' }} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEditCategory(cat)}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-900">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setConfirmDeleteCategory(cat)}
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-500 hover:text-red-600">
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
            <div className="card flex flex-col items-center justify-center py-20 text-gray-500">
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
                      <h3 className="font-semibold text-gray-900">{budget.name}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {budget.category_name} · {formatDate(budget.start_date)} – {formatDate(budget.end_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        budget.progress >= 100 ? 'bg-red-100 text-red-800' :
                        budget.progress >= 80 ? 'bg-orange-100 text-orange-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {budget.progress.toFixed(0)}%
                      </span>
                      <button onClick={() => setConfirmDeleteBudget(budget)}
                        className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-500 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
                    <div className={`h-2 rounded-full transition-all ${budgetColor(budget.progress)}`}
                      style={{ width: `${progress}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Realizado: <span className="font-medium text-gray-900">{formatCurrency(budget.actual)}</span></span>
                    <span className="text-gray-500">Planejado: <span className="font-medium text-gray-900">{formatCurrency(budget.planned)}</span></span>
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
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          ) : costCenters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <Building className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-medium">Nenhum centro de custo cadastrado</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Código</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Descrição</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {costCenters.map((cc) => (
                  <tr key={cc.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">{cc.name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded font-mono">{cc.code || '—'}</span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">{cc.description || '—'}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEditCostCenter(cc)}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-900">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setConfirmDeleteCostCenter(cc)}
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-500 hover:text-red-600">
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

      {/* ═══════════════════════ MODALS ══════════════════════════════════════ */}

      {/* Invoice Modal */}
      {showInvoiceModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto shadow-modal animate-modal-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">{editingInvoice ? 'Editar Fatura' : 'Nova Fatura'}</h2>
              <button onClick={() => setShowInvoiceModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSaveInvoice} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo *</label>
                <select required value={invoiceForm.invoice_type}
                  onChange={e => setInvoiceForm({ ...invoiceForm, invoice_type: e.target.value })}
                  className="input-field bg-white">
                  <option value="receivable">A Receber</option>
                  <option value="payable">A Pagar</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Descrição *</label>
                <input type="text" required value={invoiceForm.description}
                  onChange={e => setInvoiceForm({ ...invoiceForm, description: e.target.value })}
                  className="input-field" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Valor (R$) *</label>
                  <input type="number" step="0.01" required value={invoiceForm.value}
                    onChange={e => setInvoiceForm({ ...invoiceForm, value: e.target.value })}
                    className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Emissão *</label>
                  <input type="date" required value={invoiceForm.issue_date}
                    onChange={e => setInvoiceForm({ ...invoiceForm, issue_date: e.target.value })}
                    className="input-field" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Vencimento *</label>
                <input type="date" required value={invoiceForm.due_date}
                  onChange={e => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })}
                  className="input-field" />
              </div>
              {bankAccounts.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Conta Bancária</label>
                  <select value={invoiceForm.bank_account}
                    onChange={e => setInvoiceForm({ ...invoiceForm, bank_account: e.target.value })}
                    className="input-field bg-white">
                    <option value="">Selecione uma conta</option>
                    {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              {categories.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Categoria</label>
                  <select value={invoiceForm.category}
                    onChange={e => setInvoiceForm({ ...invoiceForm, category: e.target.value })}
                    className="input-field bg-white">
                    <option value="">Sem categoria</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.full_name || c.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowInvoiceModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={savingInvoice}
                  className="flex-1 px-4 py-2 bg-[#A6864A] text-white rounded-lg hover:bg-[#8a6e3c] transition-colors disabled:opacity-60">
                  {savingInvoice ? 'Salvando...' : editingInvoice ? 'Atualizar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transaction Modal */}
      {showTransactionModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Nova Transação</h2>
              <button onClick={() => setShowTransactionModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSaveTransaction} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo *</label>
                <select required value={transactionForm.transaction_type}
                  onChange={e => setTransactionForm({ ...transactionForm, transaction_type: e.target.value })}
                  className="input-field bg-white">
                  <option value="income">Receita</option>
                  <option value="expense">Despesa</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Descrição *</label>
                <input type="text" required value={transactionForm.description}
                  onChange={e => setTransactionForm({ ...transactionForm, description: e.target.value })}
                  className="input-field" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Valor (R$) *</label>
                  <input type="number" step="0.01" required value={transactionForm.amount}
                    onChange={e => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                    className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data *</label>
                  <input type="date" required value={transactionForm.date}
                    onChange={e => setTransactionForm({ ...transactionForm, date: e.target.value })}
                    className="input-field" />
                </div>
              </div>
              {bankAccounts.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Conta Bancária</label>
                  <select value={transactionForm.bank_account}
                    onChange={e => setTransactionForm({ ...transactionForm, bank_account: e.target.value })}
                    className="input-field bg-white">
                    <option value="">Selecione uma conta</option>
                    {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              {categories.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Categoria</label>
                  <select value={transactionForm.category}
                    onChange={e => setTransactionForm({ ...transactionForm, category: e.target.value })}
                    className="input-field bg-white">
                    <option value="">Sem categoria</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.full_name || c.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowTransactionModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={savingTransaction}
                  className="flex-1 px-4 py-2 bg-[#A6864A] text-white rounded-lg hover:bg-[#8a6e3c] transition-colors disabled:opacity-60">
                  {savingTransaction ? 'Salvando...' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bank Account Modal */}
      {showBankAccountModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto shadow-modal animate-modal-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">{editingBankAccount ? 'Editar Conta' : 'Nova Conta Bancária'}</h2>
              <button onClick={() => setShowBankAccountModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSaveBankAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome da Conta *</label>
                <input type="text" required value={bankAccountForm.name}
                  onChange={e => setBankAccountForm({ ...bankAccountForm, name: e.target.value })}
                  placeholder="Ex: Conta Principal"
                  className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Banco</label>
                <input type="text" value={bankAccountForm.bank}
                  onChange={e => setBankAccountForm({ ...bankAccountForm, bank: e.target.value })}
                  placeholder="Ex: Itaú, Nubank..."
                  className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo de Conta</label>
                <select value={bankAccountForm.account_type}
                  onChange={e => setBankAccountForm({ ...bankAccountForm, account_type: e.target.value })}
                  className="input-field bg-white">
                  <option value="checking">Conta Corrente</option>
                  <option value="savings">Poupança</option>
                  <option value="investment">Investimento</option>
                  <option value="other">Outro</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Agência</label>
                  <input type="text" value={bankAccountForm.agency}
                    onChange={e => setBankAccountForm({ ...bankAccountForm, agency: e.target.value })}
                    placeholder="0001"
                    className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Número da Conta</label>
                  <input type="text" value={bankAccountForm.account_number}
                    onChange={e => setBankAccountForm({ ...bankAccountForm, account_number: e.target.value })}
                    placeholder="12345-6"
                    className="input-field" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Chave Pix</label>
                <input type="text" value={bankAccountForm.pix_key}
                  onChange={e => setBankAccountForm({ ...bankAccountForm, pix_key: e.target.value })}
                  placeholder="CPF, CNPJ, e-mail ou telefone"
                  className="input-field" />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowBankAccountModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={savingBankAccount}
                  className="flex-1 px-4 py-2 bg-[#A6864A] text-white rounded-lg hover:bg-[#8a6e3c] transition-colors disabled:opacity-60">
                  {savingBankAccount ? 'Salvando...' : editingBankAccount ? 'Atualizar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Revenue Modal */}
      {showRevenueModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Nova Receita</h2>
              <button onClick={() => setShowRevenueModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleCreateRevenue} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Descrição *</label>
                <input type="text" required value={revenueForm.description}
                  onChange={(e) => setRevenueForm({ ...revenueForm, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Valor (R$) *</label>
                <input type="number" step="0.01" required value={revenueForm.amount}
                  onChange={(e) => setRevenueForm({ ...revenueForm, amount: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data *</label>
                <input type="date" required value={revenueForm.date}
                  onChange={(e) => setRevenueForm({ ...revenueForm, date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500" />
              </div>
              {bankAccounts.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Conta Bancária *</label>
                  <select required value={revenueForm.bank_account}
                    onChange={(e) => setRevenueForm({ ...revenueForm, bank_account: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 bg-white">
                    <option value="">Selecione uma conta</option>
                    {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowRevenueModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={savingRevenue}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-60">
                  {savingRevenue ? 'Salvando...' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Nova Despesa</h2>
              <button onClick={() => setShowExpenseModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleCreateExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Descrição *</label>
                <input type="text" required value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Valor (R$) *</label>
                <input type="number" step="0.01" required value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Data *</label>
                <input type="date" required value={expenseForm.date}
                  onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500" />
              </div>
              {bankAccounts.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Conta Bancária *</label>
                  <select required value={expenseForm.bank_account}
                    onChange={(e) => setExpenseForm({ ...expenseForm, bank_account: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500 bg-white">
                    <option value="">Selecione uma conta</option>
                    {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowExpenseModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={savingExpense}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60">
                  {savingExpense ? 'Salvando...' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">{editingCategory ? 'Editar Categoria' : 'Nova Categoria'}</h2>
              <button onClick={() => setShowCategoryModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome *</label>
                <input type="text" required value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo *</label>
                <select value={categoryForm.category_type}
                  onChange={(e) => setCategoryForm({ ...categoryForm, category_type: e.target.value })}
                  className="input-field bg-white">
                  {CATEGORY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cor</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={categoryForm.color}
                    onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                    className="w-12 h-10 border border-gray-200 rounded-lg cursor-pointer" />
                  <span className="text-sm text-gray-500">{categoryForm.color}</span>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowCategoryModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={savingCategory}
                  className="flex-1 px-4 py-2 bg-[#A6864A] text-white rounded-lg hover:bg-[#8a6e3c] transition-colors disabled:opacity-60">
                  {savingCategory ? 'Salvando...' : editingCategory ? 'Atualizar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Budget Modal */}
      {showBudgetModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Novo Orçamento</h2>
              <button onClick={() => setShowBudgetModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSaveBudget} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome *</label>
                <input type="text" required value={budgetForm.name}
                  onChange={(e) => setBudgetForm({ ...budgetForm, name: e.target.value })}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Categoria *</label>
                <select required value={budgetForm.category}
                  onChange={(e) => setBudgetForm({ ...budgetForm, category: e.target.value })}
                  className="input-field bg-white">
                  <option value="">Selecione uma categoria</option>
                  {categories.filter(c => c.category_type !== 'income').map(c => (
                    <option key={c.id} value={c.id}>{c.full_name || c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Período *</label>
                <select value={budgetForm.period}
                  onChange={(e) => setBudgetForm({ ...budgetForm, period: e.target.value })}
                  className="input-field bg-white">
                  {BUDGET_PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Início *</label>
                  <input type="date" required value={budgetForm.start_date}
                    onChange={(e) => setBudgetForm({ ...budgetForm, start_date: e.target.value })}
                    className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Fim *</label>
                  <input type="date" required value={budgetForm.end_date}
                    onChange={(e) => setBudgetForm({ ...budgetForm, end_date: e.target.value })}
                    className="input-field" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Valor Planejado (R$) *</label>
                <input type="number" step="0.01" required value={budgetForm.planned}
                  onChange={(e) => setBudgetForm({ ...budgetForm, planned: e.target.value })}
                  className="input-field" />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowBudgetModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={savingBudget}
                  className="flex-1 px-4 py-2 bg-[#A6864A] text-white rounded-lg hover:bg-[#8a6e3c] transition-colors disabled:opacity-60">
                  {savingBudget ? 'Salvando...' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cost Center Modal */}
      {showCostCenterModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">{editingCostCenter ? 'Editar Centro de Custo' : 'Novo Centro de Custo'}</h2>
              <button onClick={() => setShowCostCenterModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSaveCostCenter} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome *</label>
                <input type="text" required value={costCenterForm.name}
                  onChange={(e) => setCostCenterForm({ ...costCenterForm, name: e.target.value })}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Código</label>
                <input type="text" value={costCenterForm.code}
                  onChange={(e) => setCostCenterForm({ ...costCenterForm, code: e.target.value })}
                  placeholder="Ex: CC-001"
                  className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Descrição</label>
                <textarea value={costCenterForm.description} rows={3}
                  onChange={(e) => setCostCenterForm({ ...costCenterForm, description: e.target.value })}
                  className="input-field resize-none" />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowCostCenterModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={savingCostCenter}
                  className="flex-1 px-4 py-2 bg-[#A6864A] text-white rounded-lg hover:bg-[#8a6e3c] transition-colors disabled:opacity-60">
                  {savingCostCenter ? 'Salvando...' : editingCostCenter ? 'Atualizar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
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
    </div>
  );
}
