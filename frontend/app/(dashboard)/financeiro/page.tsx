'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Building,
  CheckCircle2,
  Clock,
  Coins,
  FileText,
  Landmark,
  Receipt,
  Scale,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import api from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { Sensitive } from '@/components/ui/Sensitive';

// ─── Types ────────────────────────────────────────────────────────────────────

type BillingCycle = 'pre_cadastro' | 'aguardando_assinatura' | 'cobranca_ativa' | 'paga' | null;

interface CrmInvoice {
  id: number;
  number: string;
  invoice_type: 'receivable' | 'payable';
  description: string;
  customer_name: string | null;
  total: string;
  issue_date: string;
  due_date: string;
  paid_date: string | null;
  status: 'pending' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  billing_cycle?: BillingCycle;
  nfse_number?: string;
  nfse_status?: string;
}

interface DashboardStats {
  pending_receivables: number;
  pending_payables: number;
  received_this_month: number;
  paid_this_month: number;
  balance: number;
  overdue_invoices: number;
}

interface RecurringExpense {
  id: number;
  expense_category: string;
  expense_category_display: string;
  description: string;
  value: string;
  due_day: number;
  is_active: boolean;
}

interface TaxEntry {
  id: number;
  tax_type: string;
  tax_type_display: string;
  reference_month: string;
  rate: string;
  base_amount: string;
  value: string;
}

interface AgingBucket {
  bucket: string;
  count: number;
  total: number;
}

interface AgingResponse {
  summary: AgingBucket[];
  grand_total: number;
}

interface FinIndicators {
  mrr: number;
  churn_rate: number;
  ebitda: number;
  resultado: number;
  margem_ebitda: number;
}

interface FinDashboardResponse {
  period: string;
  indicators: FinIndicators;
  active_customers: number;
  churned_customers: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatCurrency = (value: number | string) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));

const formatDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR');

const unwrapList = <T,>(data: { results?: T[] } | T[]): T[] => {
  if (Array.isArray(data)) return data;
  return Array.isArray(data.results) ? data.results : [];
};

// v32 F4: badges do ciclo de cobrança (pré-cadastro > assinatura > ativa > paga)
const BILLING_CYCLE_BADGES: Record<string, { label: string; className: string }> = {
  pre_cadastro: {
    label: 'Pré-cadastro',
    className: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
  },
  aguardando_assinatura: {
    label: 'Aguardando assinatura',
    className: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300',
  },
  cobranca_ativa: {
    label: 'Cobrança ativa',
    className: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300',
  },
  paga: {
    label: 'Paga',
    className: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300',
  },
};

const CYCLE_FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'Todos' },
  { key: 'pre_cadastro', label: 'Pré-cadastro' },
  { key: 'aguardando_assinatura', label: 'Aguardando assinatura' },
  { key: 'cobranca_ativa', label: 'Cobrança ativa' },
  { key: 'paga', label: 'Paga' },
];

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pendente', className: 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-300' },
  sent: { label: 'Enviada', className: 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300' },
  paid: { label: 'Paga', className: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300' },
  overdue: { label: 'Vencida', className: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300' },
  cancelled: { label: 'Cancelada', className: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400' },
};

const NFSE_BADGES: Record<string, { label: string; className: string }> = {
  issued: { label: 'Emitida', className: 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300' },
  pending: { label: 'Pendente', className: 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300' },
  error: { label: 'Erro', className: 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300' },
  cancelled: { label: 'Cancelada', className: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400' },
  none: { label: 'Sem NFS-e', className: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400' },
};

const AGING_LABELS: Record<string, string> = {
  '0-30': 'Até 30 dias',
  '31-60': '31 a 60 dias',
  '61-90': '61 a 90 dias',
  '90+': 'Mais de 90 dias',
};

type GroupKey = 'receber' | 'pagar' | 'fiscal' | 'cobranca' | 'caixa';

const StatusBadge = ({ status }: { status: string }) => {
  const badge = STATUS_BADGES[status] || STATUS_BADGES.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${badge.className}`}>
      {status === 'paid' ? <CheckCircle2 className="w-3 h-3" /> :
       status === 'overdue' ? <AlertCircle className="w-3 h-3" /> :
       <Clock className="w-3 h-3" />}
      {badge.label}
    </span>
  );
};

const CycleBadge = ({ cycle }: { cycle?: BillingCycle }) => {
  if (!cycle || !BILLING_CYCLE_BADGES[cycle]) {
    return <span className="text-xs text-gray-400 dark:text-gray-500">-</span>;
  }
  const badge = BILLING_CYCLE_BADGES[cycle];
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${badge.className}`}>
      {badge.label}
    </span>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function CrmFinanceiroPage() {
  const toast = useToast();
  const [activeGroup, setActiveGroup] = useState<GroupKey>('receber');
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [receivables, setReceivables] = useState<CrmInvoice[]>([]);
  const [payables, setPayables] = useState<CrmInvoice[]>([]);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);
  const [taxes, setTaxes] = useState<TaxEntry[]>([]);
  const [aging, setAging] = useState<AgingResponse | null>(null);
  const [indicators, setIndicators] = useState<FinDashboardResponse | null>(null);

  const [cycleFilter, setCycleFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const today = new Date();
      const monthRef = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;

      const [statsR, recR, payR, expR, taxR, agingR, finR] = await Promise.allSettled([
        api.get<DashboardStats>('/finance/invoices/dashboard/'),
        api.get<{ results?: CrmInvoice[] }>('/finance/invoices/', { invoice_type: 'receivable', page_size: '200' }),
        api.get<{ results?: CrmInvoice[] }>('/finance/invoices/', { invoice_type: 'payable', page_size: '200' }),
        api.get<{ results?: RecurringExpense[] }>('/finance/recurring-expenses/', { active: 'true', page_size: '200' }),
        api.get<{ results?: TaxEntry[] }>('/finance/taxes/', { month: monthRef, page_size: '200' }),
        api.get<AgingResponse>('/finance/invoices/aging/'),
        api.get<FinDashboardResponse>('/finance/fin-dashboard/'),
      ]);
      if (cancelled) return;

      if (statsR.status === 'fulfilled') setStats(statsR.value);
      if (recR.status === 'fulfilled') setReceivables(unwrapList(recR.value));
      if (payR.status === 'fulfilled') setPayables(unwrapList(payR.value));
      if (expR.status === 'fulfilled') setRecurringExpenses(unwrapList(expR.value));
      if (taxR.status === 'fulfilled') setTaxes(unwrapList(taxR.value));
      if (agingR.status === 'fulfilled') setAging(agingR.value);
      if (finR.status === 'fulfilled') setIndicators(finR.value);

      const failures = [statsR, recR, payR, expR, taxR, agingR, finR].filter(r => r.status === 'rejected');
      if (failures.length > 0) {
        toast.error('Alguns dados financeiros não puderam ser carregados.');
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derivações ─────────────────────────────────────────────────────────────

  const filteredReceivables = useMemo(() => {
    if (!cycleFilter) return receivables;
    return receivables.filter(inv => inv.billing_cycle === cycleFilter);
  }, [receivables, cycleFilter]);

  const cycleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    receivables.forEach(inv => {
      if (inv.billing_cycle) counts[inv.billing_cycle] = (counts[inv.billing_cycle] || 0) + 1;
    });
    return counts;
  }, [receivables]);

  const pendingPayables = useMemo(
    () => payables.filter(inv => inv.status === 'pending' || inv.status === 'sent' || inv.status === 'overdue'),
    [payables],
  );

  const fixedExpensesTotal = useMemo(
    () => recurringExpenses.reduce((sum, exp) => sum + Number(exp.value), 0),
    [recurringExpenses],
  );

  const fixedExpensesByCategory = useMemo(() => {
    const groups: Record<string, { label: string; total: number; count: number }> = {};
    recurringExpenses.forEach(exp => {
      const key = exp.expense_category;
      if (!groups[key]) groups[key] = { label: exp.expense_category_display, total: 0, count: 0 };
      groups[key].total += Number(exp.value);
      groups[key].count += 1;
    });
    return Object.values(groups).sort((a, b) => b.total - a.total);
  }, [recurringExpenses]);

  const taxesTotal = useMemo(
    () => taxes.reduce((sum, t) => sum + Number(t.value), 0),
    [taxes],
  );

  const nfseCounts = useMemo(() => {
    const counts = { issued: 0, pending: 0, error: 0, none: 0 };
    receivables.forEach(inv => {
      if (inv.status === 'cancelled') return;
      if (inv.nfse_status === 'issued') counts.issued += 1;
      else if (inv.nfse_status === 'pending') counts.pending += 1;
      else if (inv.nfse_status === 'error') counts.error += 1;
      else counts.none += 1;
    });
    return counts;
  }, [receivables]);

  const upcomingReceivables = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const limit = new Date(today);
    limit.setDate(limit.getDate() + 30);
    return receivables
      .filter(inv => {
        if (inv.status !== 'pending' && inv.status !== 'sent') return false;
        const due = new Date(`${inv.due_date}T00:00:00`);
        return due >= today && due <= limit;
      })
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  }, [receivables]);

  const overdueReceivables = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return receivables
      .filter(inv => {
        if (inv.status === 'paid' || inv.status === 'cancelled') return false;
        return new Date(`${inv.due_date}T00:00:00`) < today;
      })
      .sort((a, b) => a.due_date.localeCompare(b.due_date));
  }, [receivables]);

  const monthResult = (stats?.received_this_month || 0) - (stats?.paid_this_month || 0);

  // ── Grupos (cards do topo) ─────────────────────────────────────────────────

  const groups: {
    key: GroupKey;
    label: string;
    icon: React.ReactNode;
    metric: React.ReactNode;
    caption: string;
  }[] = [
    {
      key: 'receber',
      label: 'Contas a Receber',
      icon: <Coins className="w-5 h-5" />,
      metric: <Sensitive>{formatCurrency(stats?.pending_receivables || 0)}</Sensitive>,
      caption: 'Em aberto no ciclo F4',
    },
    {
      key: 'pagar',
      label: 'Contas a Pagar',
      icon: <Receipt className="w-5 h-5" />,
      metric: <Sensitive>{formatCurrency(stats?.pending_payables || 0)}</Sensitive>,
      caption: `Fixas: ${formatCurrency(fixedExpensesTotal)}/mês`,
    },
    {
      key: 'fiscal',
      label: 'Faturamento e Fiscal',
      icon: <FileText className="w-5 h-5" />,
      metric: <span>{nfseCounts.issued} NFS-e emitidas</span>,
      caption: `Impostos do mês: ${formatCurrency(taxesTotal)}`,
    },
    {
      key: 'cobranca',
      label: 'Cobrança e Inadimplência',
      icon: <Bell className="w-5 h-5" />,
      metric: <Sensitive>{formatCurrency(aging?.grand_total || 0)}</Sensitive>,
      caption: `${stats?.overdue_invoices || 0} faturas vencidas`,
    },
    {
      key: 'caixa',
      label: 'Fluxo de Caixa e Gestão',
      icon: <Wallet className="w-5 h-5" />,
      metric: <Sensitive>{formatCurrency(monthResult)}</Sensitive>,
      caption: 'Resultado do mês',
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">CRM Financeiro</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Os 5 grupos do processo financeiro, do pré-cadastro ao caixa
          </p>
        </div>
        <Link href="/finance"
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
          <Landmark className="w-4 h-4 text-accent-gold" /> Gestão completa <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Cards dos 5 grupos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {groups.map(group => (
          <button key={group.key} onClick={() => setActiveGroup(group.key)}
            aria-pressed={activeGroup === group.key}
            className={`card p-4 text-left transition-all ${
              activeGroup === group.key
                ? 'ring-2 ring-accent-gold border-transparent'
                : 'hover:border-accent-gold/40'
            }`}>
            <div className={`flex items-center gap-2 mb-3 ${
              activeGroup === group.key ? 'text-accent-gold' : 'text-gray-500 dark:text-gray-400'
            }`}>
              {group.icon}
              <span className="text-xs font-semibold uppercase tracking-wide">{group.label}</span>
            </div>
            {loading ? (
              <div className="h-6 w-24 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
            ) : (
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{group.metric}</p>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{group.caption}</p>
          </button>
        ))}
      </div>

      {/* ─── Grupo: Contas a Receber ───────────────────────────────────────── */}
      {activeGroup === 'receber' && (
        <div className="space-y-4">
          <div className="card p-4 flex flex-wrap gap-2 items-center">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-300 mr-1">Ciclo F4:</span>
            {CYCLE_FILTERS.map(f => (
              <button key={f.key} onClick={() => setCycleFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  cycleFilter === f.key
                    ? 'bg-accent-gold text-white'
                    : 'bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}>
                {f.label}
                {f.key && cycleCounts[f.key] ? ` (${cycleCounts[f.key]})` : ''}
              </button>
            ))}
          </div>

          <div className="card overflow-x-auto">
            {loading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />)}
              </div>
            ) : filteredReceivables.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
                <Coins className="w-12 h-12 mb-3 opacity-30" />
                <p className="font-medium">Nenhuma fatura a receber neste filtro</p>
              </div>
            ) : (
              <table className="w-full table-premium">
                <thead>
                  <tr>
                    <th className="text-left">Número</th>
                    <th className="text-left">Descrição</th>
                    <th className="text-left">Vencimento</th>
                    <th className="text-right">Total</th>
                    <th className="text-left">Status</th>
                    <th className="text-left">Ciclo</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReceivables.map(inv => (
                    <tr key={inv.id}>
                      <td className="py-3 px-4 text-sm font-mono text-gray-900 dark:text-gray-100"><Sensitive>{inv.number}</Sensitive></td>
                      <td className="py-3 px-4">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{inv.description || '-'}</p>
                        {inv.customer_name && <p className="text-xs text-gray-500 dark:text-gray-400"><Sensitive>{inv.customer_name}</Sensitive></p>}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">{inv.due_date ? formatDate(inv.due_date) : '-'}</td>
                      <td className="py-3 px-4 text-right text-sm font-medium text-gray-900 dark:text-gray-100"><Sensitive>{formatCurrency(inv.total)}</Sensitive></td>
                      <td className="py-3 px-4"><StatusBadge status={inv.status} /></td>
                      <td className="py-3 px-4"><CycleBadge cycle={inv.billing_cycle} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ─── Grupo: Contas a Pagar ─────────────────────────────────────────── */}
      {activeGroup === 'pagar' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 card overflow-x-auto">
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Faturas a pagar em aberto</h2>
              <span className="text-xs text-gray-500 dark:text-gray-400">{pendingPayables.length} em aberto</span>
            </div>
            {loading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />)}
              </div>
            ) : pendingPayables.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
                <Receipt className="w-12 h-12 mb-3 opacity-30" />
                <p className="font-medium">Nenhuma fatura a pagar em aberto</p>
              </div>
            ) : (
              <table className="w-full table-premium">
                <thead>
                  <tr>
                    <th className="text-left">Número</th>
                    <th className="text-left">Descrição</th>
                    <th className="text-left">Vencimento</th>
                    <th className="text-right">Total</th>
                    <th className="text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingPayables.map(inv => (
                    <tr key={inv.id}>
                      <td className="py-3 px-4 text-sm font-mono text-gray-900 dark:text-gray-100"><Sensitive>{inv.number}</Sensitive></td>
                      <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-gray-100">{inv.description || '-'}</td>
                      <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">{inv.due_date ? formatDate(inv.due_date) : '-'}</td>
                      <td className="py-3 px-4 text-right text-sm font-medium text-gray-900 dark:text-gray-100"><Sensitive>{formatCurrency(inv.total)}</Sensitive></td>
                      <td className="py-3 px-4"><StatusBadge status={inv.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Building className="w-4 h-4 text-accent-gold" />
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Despesas fixas (resumo)</h2>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
              <Sensitive>{formatCurrency(fixedExpensesTotal)}</Sensitive>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              {recurringExpenses.length} despesas recorrentes ativas por mês
            </p>
            <div className="space-y-2">
              {fixedExpensesByCategory.map(cat => (
                <div key={cat.label} className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <span className="text-sm text-gray-600 dark:text-gray-300">{cat.label} ({cat.count})</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100"><Sensitive>{formatCurrency(cat.total)}</Sensitive></span>
                </div>
              ))}
              {!loading && fixedExpensesByCategory.length === 0 && (
                <p className="text-sm text-gray-400 dark:text-gray-500">Nenhuma despesa fixa cadastrada.</p>
              )}
            </div>
            <Link href="/finance" className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-accent-gold hover:text-accent-gold-dark transition-colors">
              Gerenciar despesas fixas <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}

      {/* ─── Grupo: Faturamento e Fiscal ───────────────────────────────────── */}
      {activeGroup === 'fiscal' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'NFS-e emitidas', value: nfseCounts.issued, className: 'text-green-600 dark:text-green-400' },
              { label: 'NFS-e pendentes', value: nfseCounts.pending, className: 'text-amber-600 dark:text-amber-400' },
              { label: 'NFS-e com erro', value: nfseCounts.error, className: 'text-red-600 dark:text-red-400' },
              { label: 'Sem NFS-e', value: nfseCounts.none, className: 'text-gray-600 dark:text-gray-300' },
            ].map(item => (
              <div key={item.label} className="card p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{item.label}</p>
                <p className={`text-2xl font-bold ${item.className}`}>{loading ? '...' : item.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 card overflow-x-auto">
              <div className="px-5 pt-4 pb-2">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Faturas e status de NFS-e</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Emissão real de NFS-e entra na fase de integrações (Parte 6)
                </p>
              </div>
              {loading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />)}
                </div>
              ) : receivables.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
                  <FileText className="w-12 h-12 mb-3 opacity-30" />
                  <p className="font-medium">Nenhuma fatura de faturamento encontrada</p>
                </div>
              ) : (
                <table className="w-full table-premium">
                  <thead>
                    <tr>
                      <th className="text-left">Número</th>
                      <th className="text-left">Cliente</th>
                      <th className="text-right">Total</th>
                      <th className="text-left">Status</th>
                      <th className="text-left">NFS-e</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receivables.slice(0, 12).map(inv => {
                      const nfse = NFSE_BADGES[inv.nfse_status || 'none'] || NFSE_BADGES.none;
                      return (
                        <tr key={inv.id}>
                          <td className="py-3 px-4 text-sm font-mono text-gray-900 dark:text-gray-100"><Sensitive>{inv.number}</Sensitive></td>
                          <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-200"><Sensitive>{inv.customer_name || '-'}</Sensitive></td>
                          <td className="py-3 px-4 text-right text-sm font-medium text-gray-900 dark:text-gray-100"><Sensitive>{formatCurrency(inv.total)}</Sensitive></td>
                          <td className="py-3 px-4"><StatusBadge status={inv.status} /></td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${nfse.className}`}>
                              {nfse.label}{inv.nfse_number ? ` ${inv.nfse_number}` : ''}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Scale className="w-4 h-4 text-accent-gold" />
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Impostos do mês</h2>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                <Sensitive>{formatCurrency(taxesTotal)}</Sensitive>
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Lançamentos de impostos e guias no mês corrente
              </p>
              <div className="space-y-2">
                {taxes.map(tax => (
                  <div key={tax.id} className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <span className="text-sm text-gray-600 dark:text-gray-300">{tax.tax_type_display}</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100"><Sensitive>{formatCurrency(tax.value)}</Sensitive></span>
                  </div>
                ))}
                {!loading && taxes.length === 0 && (
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    Nenhum lançamento neste mês. Impostos automáticos seguem a configuração de tributação.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Grupo: Cobrança e Inadimplência ───────────────────────────────── */}
      {activeGroup === 'cobranca' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {(aging?.summary || ['0-30', '31-60', '61-90', '90+'].map(b => ({ bucket: b, count: 0, total: 0 }))).map(bucket => (
              <div key={bucket.bucket} className="card p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{AGING_LABELS[bucket.bucket] || bucket.bucket}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  <Sensitive>{formatCurrency(bucket.total)}</Sensitive>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{bucket.count} faturas vencidas</p>
              </div>
            ))}
          </div>

          <div className="card p-4 border-l-4 border-l-accent-gold">
            <div className="flex items-start gap-3">
              <Bell className="w-5 h-5 text-accent-gold mt-0.5 flex-shrink-0" />
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Régua de cobrança (F4)</h2>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  Lembretes automáticos diários: 3 dias antes do vencimento, 1 dia e 7 dias após o vencimento.
                  Apenas faturas com cobrança liberada (contrato assinado) entram na régua.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="card overflow-x-auto">
              <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Vencidas</h2>
                <span className="text-xs text-red-600 dark:text-red-400 font-medium">{overdueReceivables.length} faturas</span>
              </div>
              {overdueReceivables.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                  <CheckCircle2 className="w-10 h-10 mb-2 opacity-30" />
                  <p className="text-sm font-medium">Nenhuma fatura vencida</p>
                </div>
              ) : (
                <table className="w-full table-premium">
                  <thead>
                    <tr>
                      <th className="text-left">Número</th>
                      <th className="text-left">Cliente</th>
                      <th className="text-left">Venceu em</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overdueReceivables.slice(0, 8).map(inv => (
                      <tr key={inv.id}>
                        <td className="py-3 px-4 text-sm font-mono text-gray-900 dark:text-gray-100"><Sensitive>{inv.number}</Sensitive></td>
                        <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-200"><Sensitive>{inv.customer_name || '-'}</Sensitive></td>
                        <td className="py-3 px-4 text-sm text-red-600 dark:text-red-400">{formatDate(inv.due_date)}</td>
                        <td className="py-3 px-4 text-right text-sm font-medium text-gray-900 dark:text-gray-100"><Sensitive>{formatCurrency(inv.total)}</Sensitive></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card overflow-x-auto">
              <div className="px-5 pt-4 pb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">A vencer (30 dias)</h2>
                <span className="text-xs text-gray-500 dark:text-gray-400">{upcomingReceivables.length} faturas</span>
              </div>
              {upcomingReceivables.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                  <Clock className="w-10 h-10 mb-2 opacity-30" />
                  <p className="text-sm font-medium">Nada a vencer nos próximos 30 dias</p>
                </div>
              ) : (
                <table className="w-full table-premium">
                  <thead>
                    <tr>
                      <th className="text-left">Número</th>
                      <th className="text-left">Cliente</th>
                      <th className="text-left">Vence em</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingReceivables.slice(0, 8).map(inv => (
                      <tr key={inv.id}>
                        <td className="py-3 px-4 text-sm font-mono text-gray-900 dark:text-gray-100"><Sensitive>{inv.number}</Sensitive></td>
                        <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-200"><Sensitive>{inv.customer_name || '-'}</Sensitive></td>
                        <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">{formatDate(inv.due_date)}</td>
                        <td className="py-3 px-4 text-right text-sm font-medium text-gray-900 dark:text-gray-100"><Sensitive>{formatCurrency(inv.total)}</Sensitive></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Grupo: Fluxo de Caixa e Gestão ────────────────────────────────── */}
      {activeGroup === 'caixa' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-2 text-green-600 dark:text-green-400">
                <ArrowUpRight className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">Entradas do mês</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                <Sensitive>{formatCurrency(stats?.received_this_month || 0)}</Sensitive>
              </p>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-2 text-red-600 dark:text-red-400">
                <ArrowDownRight className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">Saídas do mês</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                <Sensitive>{formatCurrency(stats?.paid_this_month || 0)}</Sensitive>
              </p>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-2 text-accent-gold">
                <TrendingUp className="w-4 h-4" />
                <span className="text-xs font-semibold uppercase tracking-wide">Resultado do mês</span>
              </div>
              <p className={`text-2xl font-bold ${monthResult >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                <Sensitive>{formatCurrency(monthResult)}</Sensitive>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'MRR', value: formatCurrency(indicators?.indicators.mrr || 0), sensitive: true },
              { label: 'Churn', value: `${(indicators?.indicators.churn_rate || 0).toFixed(1)}%`, sensitive: false },
              { label: 'EBITDA', value: formatCurrency(indicators?.indicators.ebitda || 0), sensitive: true },
              { label: 'Clientes ativos', value: String(indicators?.active_customers || 0), sensitive: false },
            ].map(item => (
              <div key={item.label} className="card p-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{item.label}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {loading ? '...' : item.sensitive ? <Sensitive>{item.value}</Sensitive> : item.value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link href="/finance" className="card card-hover p-4 flex items-center gap-3 group">
              <BarChart3 className="w-5 h-5 text-accent-gold" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">DRE e indicadores</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Visão geral com DRE 12 meses</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-accent-gold transition-colors" />
            </Link>
            <Link href="/dashboard/financeiro" className="card card-hover p-4 flex items-center gap-3 group">
              <TrendingUp className="w-5 h-5 text-accent-gold" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Dashboard Financeiro</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">KPIs e gráficos consolidados</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-accent-gold transition-colors" />
            </Link>
            <Link href="/finance" className="card card-hover p-4 flex items-center gap-3 group">
              <Landmark className="w-5 h-5 text-accent-gold" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Transações e contas</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Lançamentos, bancos e conciliação</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-accent-gold transition-colors" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
