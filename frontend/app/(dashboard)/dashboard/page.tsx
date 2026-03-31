'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  TrendingUp, TrendingDown,
  DollarSign, FolderKanban, Users,
  ArrowUpRight, ArrowDownRight,
  FileText, Briefcase, Minus,
} from 'lucide-react';

import {
  ResponsiveContainer,
  LineChart, AreaChart, Area,
  Line,
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
  Legend,
} from 'recharts';
import api from '@/lib/api';
import { Sensitive } from '@/components/ui/Sensitive';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface Stats {
  mrr: number;
  active_contracts: number;
  expiring_contracts: number;
  total_projects: number;
  active_projects: number;
  received_this_month: number;
  paid_this_month: number;
  proposals_sent_count: number;
  proposals_sent_value: number;
  proposals_approved_count: number;
  ebitda: number;
  resultado: number;
}

interface CashFlowDay {
  day: string;
  income: number;
  expense: number;
}

interface PipelineItem {
  status: string;
  label: string;
  count: number;
  value: number;
}

interface ProjectStatusItem {
  name: string;
  value: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatCurrencyShort = (v: number) => {
  if (v >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `R$${(v / 1000).toFixed(0)}k`;
  return `R$${v.toFixed(0)}`;
};

const statusLabels: Record<string, string> = {
  new: 'Lead Recebido', qualifying: 'Em Qualificação', qualified: 'Qualificado',
  disqualified: 'Não Qualificado', scheduled: 'Agendado', pre_meeting: 'Pré-Reunião',
  no_show: 'Não Compareceu', meeting_done: 'Reunião Realizada', proposal: 'Proposta Enviada',
  won: 'Fechado', not_closed: 'Não Fechou', lost: 'Perdido', follow_up: 'Em Follow-up',
};

const projectStatusLabels: Record<string, string> = {
  planning: 'Planejamento', kickoff: 'Kickoff', requirements: 'Requisitos',
  development: 'Desenvolvimento', testing: 'Testes/QA', deployment: 'Implantação',
  completed: 'Concluído', on_hold: 'Em Espera',
};

const PIE_COLORS = ['#A6864A', '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444'];

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-card-deep p-3 text-xs min-w-[140px]">
      {label && <p className="text-gray-400 dark:text-gray-500 font-medium mb-2">{label}</p>}
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-4 mb-1 last:mb-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.color }} />
            <span className="text-gray-500 dark:text-gray-400">{entry.name}</span>
          </div>
          <span className="font-bold text-gray-900 dark:text-gray-100 tabular-nums">
            {typeof entry.value === 'number' && entry.value > 999
              ? formatCurrency(entry.value)
              : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function PipelineTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-card-deep p-3 text-xs min-w-[160px]">
      {label && <p className="text-gray-700 dark:text-gray-200 font-semibold mb-2">{label}</p>}
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-gray-500 dark:text-gray-400">{entry.name}</span>
          </div>
          <span className="font-bold text-gray-900 dark:text-gray-100 tabular-nums">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  loading,
  delta,
  progress,
  progressColor = 'bg-accent-gold',
  badge,
  sub,
}: {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  value: React.ReactNode;
  loading: boolean;
  delta?: { value: number; label?: string };
  progress?: { current: number; total: number };
  progressColor?: string;
  badge?: React.ReactNode;
  sub?: React.ReactNode;
}) {
  const pct = progress ? Math.min(100, Math.round((progress.current / Math.max(progress.total, 1)) * 100)) : null;

  return (
    <div className="card card-hover p-6 group">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-11 h-11 ${iconBg} rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <div className="flex flex-col items-end gap-1">
          {badge}
          {delta !== undefined && !loading && (
            <span className={delta.value > 0 ? 'delta-up' : delta.value < 0 ? 'delta-down' : 'delta-neutral'}>
              {delta.value > 0 ? <ArrowUpRight className="w-3 h-3" /> : delta.value < 0 ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              {Math.abs(delta.value)}%{delta.label ? ` ${delta.label}` : ''}
            </span>
          )}
        </div>
      </div>

      <p className="text-gray-500 dark:text-gray-400 text-xs font-semibold uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1.5 tabular-nums animate-count-in">
        {loading ? <span className="skeleton h-7 w-28 block" /> : value}
      </p>

      {sub && !loading && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>
      )}

      {pct !== null && !loading && (
        <div className="kpi-progress">
          <div
            className={`kpi-progress-fill ${progressColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {pct !== null && !loading && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 tabular-nums">
          {progress!.current} de {progress!.total} ({pct}%)
        </p>
      )}
    </div>
  );
}

// ─── Empty Chart State ─────────────────────────────────────────────────────────

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-52 flex flex-col items-center justify-center gap-3">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="opacity-30">
        <rect x="4" y="20" width="6" height="16" rx="2" fill="currentColor" className="text-gray-400"/>
        <rect x="14" y="12" width="6" height="24" rx="2" fill="currentColor" className="text-gray-400"/>
        <rect x="24" y="6" width="6" height="30" rx="2" fill="currentColor" className="text-gray-400"/>
        <rect x="34" y="14" width="4" height="22" rx="2" fill="currentColor" className="text-gray-300"/>
      </svg>
      <p className="text-sm text-gray-400 dark:text-gray-500">{message}</p>
    </div>
  );
}

// ─── Page Component ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    mrr: 0, active_contracts: 0, expiring_contracts: 0,
    total_projects: 0, active_projects: 0, received_this_month: 0, paid_this_month: 0,
    proposals_sent_count: 0, proposals_sent_value: 0, proposals_approved_count: 0,
  });
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);

  const [cashFlowData, setCashFlowData] = useState<CashFlowDay[]>([]);
  const [pipelineData, setPipelineData] = useState<PipelineItem[]>([]);
  const [projectStatusData, setProjectStatusData] = useState<ProjectStatusItem[]>([]);
  const [chartsLoading, setChartsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [contractsData, projectsData, financeData, proposalsData, finDashData] = await Promise.all([
          api.get<Record<string, number>>('/sales/contracts/dashboard/').catch(() => ({} as Record<string, number>)),
          api.get<Record<string, number>>('/projects/projects/dashboard/').catch(() => ({} as Record<string, number>)),
          api.get<Record<string, number>>('/finance/invoices/dashboard/').catch(() => ({} as Record<string, number>)),
          api.get<Record<string, number>>('/sales/proposals/dashboard/').catch(() => ({} as Record<string, number>)),
          api.get<{ indicators?: Record<string, number> }>('/finance/fin-dashboard/').catch(() => ({ indicators: {} })),
        ]);
        const ind = finDashData.indicators || {};
        setStats({
          mrr:                      contractsData.mrr || 0,
          active_contracts:         contractsData.active_contracts || 0,
          expiring_contracts:       contractsData.expiring_contracts || 0,
          total_projects:           projectsData.total_projects || 0,
          active_projects:          projectsData.active_projects || 0,
          received_this_month:      financeData.received_this_month || 0,
          paid_this_month:          financeData.paid_this_month || 0,
          proposals_sent_count:     proposalsData.sent_count || 0,
          proposals_sent_value:     proposalsData.sent_value || 0,
          proposals_approved_count: proposalsData.approved_count || 0,
          ebitda:                   ind.ebitda || 0,
          resultado:                ind.resultado || 0,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };

    const fetchCharts = async () => {
      try {
        const now = new Date();
        const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const to = now.toISOString().split('T')[0];

        const [cashData, prospectsData, projData] = await Promise.all([
          api.get<{ by_day?: { day: string; income: number | null; expense: number | null }[] }>('/finance/transactions/cash_flow/', { from, to }).catch(() => ({ by_day: [] })),
          api.get<{ results?: { status: string; estimated_value: number }[] }>('/sales/prospects/', { page_size: '500' }).catch(() => ({ results: [] })),
          api.get<{ results?: { status: string }[] }>('/projects/projects/', { page_size: '500' }).catch(() => ({ results: [] })),
        ]);

        const byDay: CashFlowDay[] = (cashData.by_day || []).map((d) => ({
          day:     new Date(d.day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          income:  d.income  ? Number(d.income)  : 0,
          expense: d.expense ? Number(d.expense) : 0,
        }));
        setCashFlowData(byDay);

        const prospects: { status: string; estimated_value: number }[] = Array.isArray(prospectsData.results ?? prospectsData)
          ? (prospectsData.results ?? prospectsData) as { status: string; estimated_value: number }[] : [];
        const grouped: Record<string, { count: number; value: number }> = {};
        prospects.forEach((p) => {
          if (!grouped[p.status]) grouped[p.status] = { count: 0, value: 0 };
          grouped[p.status].count++;
          grouped[p.status].value += p.estimated_value || 0;
        });
        setPipelineData(
          Object.entries(grouped).map(([status, data]) => ({
            status,
            label: statusLabels[status] || status,
            count: data.count,
            value: data.value,
          }))
        );

        const projects: { status: string }[] = Array.isArray(projData.results ?? projData) ? (projData.results ?? projData) as { status: string }[] : [];
        const groupedProj: Record<string, number> = {};
        projects.forEach((p) => { groupedProj[p.status] = (groupedProj[p.status] || 0) + 1; });
        setProjectStatusData(
          Object.entries(groupedProj).map(([status, count]) => ({
            name: projectStatusLabels[status] || status,
            value: count,
          }))
        );
      } catch (error) {
        console.error('Error fetching chart data:', error);
      } finally {
        setChartsLoading(false);
      }
    };

    api.get<{ first_name?: string }>('/accounts/profile/')
      .then(data => { if (data?.first_name) setUserName(data.first_name); })
      .catch(() => {});

    fetchStats();
    fetchCharts();
  }, []);

  // Derived metrics
  const balance = stats.received_this_month - stats.paid_this_month;
  const balancePositive = balance >= 0;
  const coverageRatio = stats.paid_this_month > 0
    ? Math.round((stats.received_this_month / stats.paid_this_month) * 100)
    : null;

  return (
    <div className="animate-fade-in">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
          Bem-vindo{userName ? <>, <Sensitive>{userName}</Sensitive></> : ''}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Visão geral do seu negócio em tempo real.</p>
      </div>

      {/* ─── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-5 mb-8">

        {/* MRR */}
        <KpiCard
          icon={DollarSign}
          iconBg="bg-emerald-50 dark:bg-emerald-900/25"
          iconColor="text-emerald-600"
          label="Receita Recorrente"
          loading={loading}
          value={<Sensitive>{formatCurrency(stats.mrr)}</Sensitive>}
          sub="Contratos ativos recorrentes"
        />

        {/* Contratos */}
        <KpiCard
          icon={Briefcase}
          iconBg="bg-blue-50 dark:bg-blue-900/25"
          iconColor="text-blue-600"
          label="Contratos Ativos"
          loading={loading}
          value={<Sensitive>{stats.active_contracts}</Sensitive>}
          badge={
            stats.expiring_contracts > 0 && !loading ? (
              <span className="text-[11px] text-amber-600 font-semibold bg-amber-50 dark:bg-amber-900/25 px-2 py-0.5 rounded-full">
                <Sensitive>{stats.expiring_contracts}</Sensitive> expirando
              </span>
            ) : undefined
          }
          sub={stats.expiring_contracts > 0 ? `${stats.expiring_contracts} vencem em 30 dias` : 'Nenhum expirando em breve'}
        />

        {/* Projetos */}
        <KpiCard
          icon={FolderKanban}
          iconBg="bg-violet-50 dark:bg-violet-900/25"
          iconColor="text-violet-600"
          label="Projetos Ativos"
          loading={loading}
          value={
            <>
              <Sensitive>{stats.active_projects}</Sensitive>
              <span className="text-gray-400 dark:text-gray-500 text-lg font-normal">
                /<Sensitive>{stats.total_projects}</Sensitive>
              </span>
            </>
          }
          progress={{ current: stats.active_projects, total: stats.total_projects }}
          progressColor="bg-violet-500"
        />

        {/* Propostas em Pipeline */}
        <KpiCard
          icon={FileText}
          iconBg="bg-amber-50 dark:bg-amber-900/25"
          iconColor="text-amber-600"
          label="Propostas em Pipeline"
          loading={loading}
          value={<Sensitive>{stats.proposals_sent_count}</Sensitive>}
          badge={
            stats.proposals_approved_count > 0 && !loading ? (
              <span className="text-[11px] text-emerald-600 font-semibold bg-emerald-50 dark:bg-emerald-900/25 px-2 py-0.5 rounded-full">
                <Sensitive>{stats.proposals_approved_count}</Sensitive> aprovadas
              </span>
            ) : undefined
          }
          sub={!loading
            ? stats.proposals_sent_value > 0
              ? formatCurrencyShort(stats.proposals_sent_value) + ' em aberto'
              : 'Nenhuma proposta ativa'
            : undefined}
        />

        {/* Receita do mês */}
        <KpiCard
          icon={balancePositive ? TrendingUp : TrendingDown}
          iconBg={balancePositive ? 'bg-accent-gold/10' : 'bg-red-50 dark:bg-red-900/25'}
          iconColor={balancePositive ? 'text-accent-gold' : 'text-red-500'}
          label="Receita do Mês"
          loading={loading}
          value={<Sensitive>{formatCurrency(stats.received_this_month)}</Sensitive>}
          sub={!loading ? (
            coverageRatio !== null
              ? `Cobre ${coverageRatio}% das despesas`
              : 'Sem despesas registradas'
          ) : undefined}
          delta={!loading && stats.paid_this_month > 0 ? {
            value: Math.round(((stats.received_this_month - stats.paid_this_month) / Math.max(stats.paid_this_month, 1)) * 100),
            label: 'vs despesas',
          } : undefined}
        />
      </div>

      {/* ─── Financial Indicators ─────────────────────────────────────────── */}
      {(stats.ebitda !== 0 || stats.resultado !== 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-accent-gold/10 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-accent-gold" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold">EBITDA</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100"><Sensitive>{formatCurrency(stats.ebitda)}</Sensitive></p>
              </div>
            </div>
            <p className="text-xs text-gray-400">Lucro operacional antes de depreciação e financeiro</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stats.resultado >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/25' : 'bg-red-50 dark:bg-red-900/25'}`}>
                {stats.resultado >= 0 ? <ArrowUpRight className="w-5 h-5 text-emerald-600" /> : <ArrowDownRight className="w-5 h-5 text-red-500" />}
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-semibold">Resultado Líquido</p>
                <p className={`text-xl font-bold ${stats.resultado >= 0 ? 'text-emerald-600' : 'text-red-500'}`}><Sensitive>{formatCurrency(stats.resultado)}</Sensitive></p>
              </div>
            </div>
            <p className="text-xs text-gray-400">Resultado final do mês após todas as deduções</p>
          </div>
        </div>
      )}

      {/* ─── Charts Row 1 ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">

        {/* Cash Flow Area Chart */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">Fluxo de Caixa</h2>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Mês atual — receitas vs despesas</p>
            </div>
            {!loading && (
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${balancePositive ? 'bg-emerald-50 dark:bg-emerald-900/25 text-emerald-700' : 'bg-red-50 dark:bg-red-900/25 text-red-600'}`}>
                Saldo {formatCurrencyShort(balance)}
              </span>
            )}
          </div>

          {chartsLoading ? (
            <div className="h-52 skeleton" />
          ) : cashFlowData.length === 0 ? (
            <EmptyChart message="Sem transações no mês" />
          ) : (
            <ResponsiveContainer width="100%" height={208}>
              <AreaChart data={cashFlowData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.18}/>
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.14}/>
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="0" stroke="#f0f0f0" strokeOpacity={0.6} horizontal vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatCurrencyShort} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={56} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="income"  name="Receitas"  stroke="#10b981" strokeWidth={2.5} fill="url(#incomeGrad)"  dot={false} activeDot={{ r: 4, strokeWidth: 2 }} />
                <Area type="monotone" dataKey="expense" name="Despesas"  stroke="#ef4444" strokeWidth={2}   fill="url(#expenseGrad)" dot={false} activeDot={{ r: 4, strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}

          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-50 dark:border-gray-700/50">
            {[
              { label: 'Receitas', value: stats.received_this_month, color: 'text-emerald-600' },
              { label: 'Despesas', value: stats.paid_this_month,     color: 'text-red-500'     },
              { label: 'Saldo',    value: balance,                    color: balancePositive ? 'text-emerald-600' : 'text-red-500' },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide font-semibold">{label}</p>
                <p className={`text-sm font-bold tabular-nums ${color}`}>
                  {loading ? '...' : <Sensitive>{formatCurrency(value)}</Sensitive>}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline Bar Chart */}
        <div className="card p-6">
          <div className="mb-5">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">Pipeline de Prospecção</h2>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Leads por etapa do funil</p>
          </div>

          {chartsLoading ? (
            <div className="h-52 skeleton" />
          ) : pipelineData.length === 0 ? (
            <EmptyChart message="Nenhum prospect cadastrado" />
          ) : (
            <ResponsiveContainer width="100%" height={208}>
              <BarChart data={pipelineData} margin={{ top: 4, right: 4, bottom: 24, left: 0 }}>
                <CartesianGrid strokeDasharray="0" stroke="#f0f0f0" strokeOpacity={0.6} horizontal vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} angle={-28} textAnchor="end" axisLine={false} tickLine={false} interval={0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={28} />
                <Tooltip content={<PipelineTooltip />} cursor={{ fill: 'rgba(166,134,74,0.06)' }} />
                <Bar dataKey="count" name="Leads" fill="#A6864A" radius={[6,6,0,0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ─── Charts Row 2 ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">

        {/* Projects Donut */}
        <div className="card p-6">
          <div className="mb-5">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">Status dos Projetos</h2>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Distribuição por fase atual</p>
          </div>

          {chartsLoading ? (
            <div className="h-52 skeleton" />
          ) : projectStatusData.length === 0 ? (
            <EmptyChart message="Nenhum projeto cadastrado" />
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="55%" height={200}>
                <PieChart>
                  <Pie
                    data={projectStatusData}
                    cx="50%" cy="50%"
                    innerRadius={52} outerRadius={80}
                    paddingAngle={3} dataKey="value"
                    strokeWidth={2}
                  >
                    {projectStatusData.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {projectStatusData.map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[index % PIE_COLORS.length] }} />
                      <span className="text-gray-600 dark:text-gray-300 truncate">{item.name}</span>
                    </div>
                    <span className="font-bold text-gray-800 dark:text-gray-100 tabular-nums ml-2">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="card p-6">
          <div className="mb-5">
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">Ações Rápidas</h2>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Acesso direto às principais áreas</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { href: '/crm',              Icon: Users,        label: 'Novo Prospect', color: 'hover:border-blue-200   hover:bg-blue-50/60   dark:hover:bg-blue-900/10',   iconBg: 'bg-blue-50   dark:bg-blue-900/20',   iconColor: 'text-blue-600'   },
              { href: '/crm?tab=propostas',Icon: FileText,     label: 'Nova Proposta', color: 'hover:border-violet-200 hover:bg-violet-50/60 dark:hover:bg-violet-900/10', iconBg: 'bg-violet-50 dark:bg-violet-900/20', iconColor: 'text-violet-600' },
              { href: '/projects',         Icon: FolderKanban, label: 'Novo Projeto',  color: 'hover:border-emerald-200 hover:bg-emerald-50/60 dark:hover:bg-emerald-900/10',iconBg:'bg-emerald-50 dark:bg-emerald-900/20',iconColor:'text-emerald-600'},
              { href: '/finance',          Icon: DollarSign,   label: 'Financeiro',    color: 'hover:border-amber-200  hover:bg-amber-50/60  dark:hover:bg-amber-900/10',  iconBg: 'bg-amber-50  dark:bg-amber-900/20',  iconColor: 'text-amber-600'  },
            ].map(({ href, Icon, label, color, iconBg, iconColor }) => (
              <Link
                key={href}
                href={href}
                className={`group flex flex-col gap-3 p-4 bg-gray-50 dark:bg-gray-700/40 border border-transparent ${color} rounded-xl transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card`}
              >
                <div className={`w-8 h-8 ${iconBg} rounded-lg flex items-center justify-center transition-transform duration-200 group-hover:scale-110`}>
                  <Icon className={`w-4 h-4 ${iconColor}`} />
                </div>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 group-hover:text-gray-900 dark:group-hover:text-white">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
