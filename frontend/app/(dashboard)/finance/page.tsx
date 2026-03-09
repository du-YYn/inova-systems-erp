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

type Tab = 'overview' | 'categories' | 'budgets' | 'cost_centers';

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

      const [statsData, receivablesData, payablesData, bankData] = await Promise.all([
        statsRes.json(), receivablesRes.json(), payablesRes.json(), bankRes.json(),
      ]);

      setStats(statsData);
      setReceivables((receivablesData.results || receivablesData).slice(0, 5));
      setPayables((payablesData.results || payablesData).slice(0, 5));
      const accounts: BankAccount[] = bankData.results || bankData;
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
      const data = await res.json();
      setCategories(data.results || data);
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
      const data = await res.json();
      setBudgets(data.results || data);
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
      const data = await res.json();
      setCostCenters(data.results || data);
    } catch {
      toast.error('Erro ao carregar centros de custo.');
    } finally {
      setLoadingCostCenters(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'categories' && categories.length === 0) fetchCategories();
    if (activeTab === 'budgets') {
      fetchBudgets();
      if (categories.length === 0) fetchCategories();
    }
    if (activeTab === 'cost_centers' && costCenters.length === 0) fetchCostCenters();
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

  // ── Budget progress color ─────────────────────────────────────────────────

  const budgetColor = (progress: number) => {
    if (progress >= 100) return 'bg-red-500';
    if (progress >= 80) return 'bg-orange-400';
    return 'bg-[#A6864A]';
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Visão Geral', icon: <TrendingUp className="w-4 h-4" /> },
    { key: 'categories', label: 'Categorias', icon: <Tag className="w-4 h-4" /> },
    { key: 'budgets', label: 'Orçamentos', icon: <PieChart className="w-4 h-4" /> },
    { key: 'cost_centers', label: 'Centros de Custo', icon: <Building className="w-4 h-4" /> },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Financeiro</h1>
          <p className="text-text-secondary mt-1">Controle de receitas, despesas e orçamentos</p>
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
                : 'text-text-secondary hover:text-text-primary hover:bg-gray-50'
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
                  <p className="text-text-secondary text-sm">Receitas do Mês</p>
                  <p className="text-2xl font-semibold text-text-primary mt-1">{formatCurrency(stats.received_this_month)}</p>
                </div>
                <div className="bg-white p-6 rounded-lg border border-gray-100">
                  <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center mb-4">
                    <ArrowDownRight className="w-6 h-6 text-red-600" />
                  </div>
                  <p className="text-text-secondary text-sm">Despesas do Mês</p>
                  <p className="text-2xl font-semibold text-text-primary mt-1">{formatCurrency(stats.paid_this_month)}</p>
                </div>
                <div className="bg-white p-6 rounded-lg border border-gray-100">
                  <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center mb-4">
                    <DollarSign className="w-6 h-6 text-blue-600" />
                  </div>
                  <p className="text-text-secondary text-sm">A Receber</p>
                  <p className="text-2xl font-semibold text-text-primary mt-1">{formatCurrency(stats.pending_receivables)}</p>
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
                  <p className="text-text-secondary text-sm">A Pagar</p>
                  <p className="text-2xl font-semibold text-text-primary mt-1">{formatCurrency(stats.pending_payables)}</p>
                </div>
              </>
            )}
          </div>

          {/* Receivables and Payables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-lg border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-text-primary mb-4">Contas a Receber</h2>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
                </div>
              ) : receivables.length === 0 ? (
                <p className="text-sm text-text-secondary text-center py-4">Nenhuma conta pendente</p>
              ) : (
                <div className="space-y-3">
                  {receivables.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <DollarSign className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text-primary">{inv.number || inv.description || `Fatura #${inv.id}`}</p>
                          <p className="text-xs text-text-secondary">{inv.customer_name || '—'}{inv.due_date ? ` · Vence ${formatDate(inv.due_date)}` : ''}</p>
                        </div>
                      </div>
                      <span className="text-sm font-medium text-green-600 ml-4">{formatCurrency(inv.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-text-primary mb-4">Contas a Pagar</h2>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
                </div>
              ) : payables.length === 0 ? (
                <p className="text-sm text-text-secondary text-center py-4">Nenhuma conta pendente</p>
              ) : (
                <div className="space-y-3">
                  {payables.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <CreditCard className="w-5 h-5 text-red-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text-primary">{inv.number || inv.description || `Despesa #${inv.id}`}</p>
                          <p className="text-xs text-text-secondary">{inv.due_date ? `Vence ${formatDate(inv.due_date)}` : '—'}</p>
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
          <div className="bg-white rounded-lg border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Ações Rápidas</h2>
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

      {/* ─── Categories Tab ────────────────────────────────────────────────── */}
      {activeTab === 'categories' && (
        <div className="bg-white rounded-lg border border-gray-100">
          {loadingCategories ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          ) : categories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-text-secondary">
              <Tag className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-medium">Nenhuma categoria cadastrada</p>
              <p className="text-sm mt-1">Crie categorias para organizar receitas e despesas</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Nome</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Tipo</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Cor</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-text-secondary">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {categories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <span className="text-sm font-medium text-text-primary">{cat.full_name || cat.name}</span>
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
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-text-secondary hover:text-text-primary">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setConfirmDeleteCategory(cat)}
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-text-secondary hover:text-red-600">
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
            <div className="bg-white rounded-lg border border-gray-100 flex flex-col items-center justify-center py-20 text-text-secondary">
              <PieChart className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-medium">Nenhum orçamento cadastrado</p>
              <p className="text-sm mt-1">Crie orçamentos para monitorar seus gastos por categoria</p>
            </div>
          ) : (
            budgets.map((budget) => {
              const progress = Math.min(budget.progress, 100);
              return (
                <div key={budget.id} className="bg-white rounded-lg border border-gray-100 p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-text-primary">{budget.name}</h3>
                      <p className="text-sm text-text-secondary mt-0.5">
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
                        className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-text-secondary hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
                    <div className={`h-2 rounded-full transition-all ${budgetColor(budget.progress)}`}
                      style={{ width: `${progress}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">Realizado: <span className="font-medium text-text-primary">{formatCurrency(budget.actual)}</span></span>
                    <span className="text-text-secondary">Planejado: <span className="font-medium text-text-primary">{formatCurrency(budget.planned)}</span></span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ─── Cost Centers Tab ─────────────────────────────────────────────── */}
      {activeTab === 'cost_centers' && (
        <div className="bg-white rounded-lg border border-gray-100">
          {loadingCostCenters ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          ) : costCenters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-text-secondary">
              <Building className="w-12 h-12 mb-3 opacity-30" />
              <p className="font-medium">Nenhum centro de custo cadastrado</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Nome</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Código</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Descrição</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-text-secondary">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {costCenters.map((cc) => (
                  <tr key={cc.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 text-sm font-medium text-text-primary">{cc.name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded font-mono">{cc.code || '—'}</span>
                    </td>
                    <td className="py-3 px-4 text-sm text-text-secondary">{cc.description || '—'}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEditCostCenter(cc)}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-text-secondary hover:text-text-primary">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setConfirmDeleteCostCenter(cc)}
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-text-secondary hover:text-red-600">
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

      {/* Revenue Modal */}
      {showRevenueModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-text-primary">Nova Receita</h2>
              <button onClick={() => setShowRevenueModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleCreateRevenue} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Descrição *</label>
                <input type="text" required value={revenueForm.description}
                  onChange={(e) => setRevenueForm({ ...revenueForm, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Valor (R$) *</label>
                <input type="number" step="0.01" required value={revenueForm.amount}
                  onChange={(e) => setRevenueForm({ ...revenueForm, amount: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Data *</label>
                <input type="date" required value={revenueForm.date}
                  onChange={(e) => setRevenueForm({ ...revenueForm, date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500" />
              </div>
              {bankAccounts.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Conta Bancária *</label>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-text-primary">Nova Despesa</h2>
              <button onClick={() => setShowExpenseModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleCreateExpense} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Descrição *</label>
                <input type="text" required value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Valor (R$) *</label>
                <input type="number" step="0.01" required value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Data *</label>
                <input type="date" required value={expenseForm.date}
                  onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500" />
              </div>
              {bankAccounts.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Conta Bancária *</label>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-text-primary">{editingCategory ? 'Editar Categoria' : 'Nova Categoria'}</h2>
              <button onClick={() => setShowCategoryModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Nome *</label>
                <input type="text" required value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A6864A]/30 focus:border-[#A6864A]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Tipo *</label>
                <select value={categoryForm.category_type}
                  onChange={(e) => setCategoryForm({ ...categoryForm, category_type: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A6864A]/30 focus:border-[#A6864A] bg-white">
                  {CATEGORY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Cor</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={categoryForm.color}
                    onChange={(e) => setCategoryForm({ ...categoryForm, color: e.target.value })}
                    className="w-12 h-10 border border-gray-200 rounded-lg cursor-pointer" />
                  <span className="text-sm text-text-secondary">{categoryForm.color}</span>
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-text-primary">Novo Orçamento</h2>
              <button onClick={() => setShowBudgetModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSaveBudget} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Nome *</label>
                <input type="text" required value={budgetForm.name}
                  onChange={(e) => setBudgetForm({ ...budgetForm, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A6864A]/30 focus:border-[#A6864A]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Categoria *</label>
                <select required value={budgetForm.category}
                  onChange={(e) => setBudgetForm({ ...budgetForm, category: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A6864A]/30 focus:border-[#A6864A] bg-white">
                  <option value="">Selecione uma categoria</option>
                  {categories.filter(c => c.category_type !== 'income').map(c => (
                    <option key={c.id} value={c.id}>{c.full_name || c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Período *</label>
                <select value={budgetForm.period}
                  onChange={(e) => setBudgetForm({ ...budgetForm, period: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A6864A]/30 focus:border-[#A6864A] bg-white">
                  {BUDGET_PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Início *</label>
                  <input type="date" required value={budgetForm.start_date}
                    onChange={(e) => setBudgetForm({ ...budgetForm, start_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A6864A]/30 focus:border-[#A6864A]" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Fim *</label>
                  <input type="date" required value={budgetForm.end_date}
                    onChange={(e) => setBudgetForm({ ...budgetForm, end_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A6864A]/30 focus:border-[#A6864A]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Valor Planejado (R$) *</label>
                <input type="number" step="0.01" required value={budgetForm.planned}
                  onChange={(e) => setBudgetForm({ ...budgetForm, planned: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A6864A]/30 focus:border-[#A6864A]" />
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-text-primary">{editingCostCenter ? 'Editar Centro de Custo' : 'Novo Centro de Custo'}</h2>
              <button onClick={() => setShowCostCenterModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSaveCostCenter} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Nome *</label>
                <input type="text" required value={costCenterForm.name}
                  onChange={(e) => setCostCenterForm({ ...costCenterForm, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A6864A]/30 focus:border-[#A6864A]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Código</label>
                <input type="text" value={costCenterForm.code}
                  onChange={(e) => setCostCenterForm({ ...costCenterForm, code: e.target.value })}
                  placeholder="Ex: CC-001"
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A6864A]/30 focus:border-[#A6864A]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Descrição</label>
                <textarea value={costCenterForm.description} rows={3}
                  onChange={(e) => setCostCenterForm({ ...costCenterForm, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A6864A]/30 focus:border-[#A6864A] resize-none" />
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
    </div>
  );
}
