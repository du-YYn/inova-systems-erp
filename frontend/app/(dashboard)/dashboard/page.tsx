'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  DollarSign,
  FolderKanban,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  Briefcase,
} from 'lucide-react';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import api from '@/lib/api';

interface Stats {
  mrr: number;
  active_contracts: number;
  expiring_contracts: number;
  total_projects: number;
  active_projects: number;
  received_this_month: number;
  paid_this_month: number;
}

interface CashFlowDay {
  day: string;
  income: number | null;
  expense: number | null;
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

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatCurrencyShort = (v: number) => {
  if (v >= 1000) return `R$${(v / 1000).toFixed(0)}k`;
  return `R$${v.toFixed(0)}`;
};

const statusLabels: Record<string, string> = {
  new: 'Novo', contacted: 'Contatado', qualified: 'Qualificado',
  meeting: 'Reunião', proposal: 'Proposta', negotiation: 'Negociação',
  won: 'Fechado', lost: 'Perdido',
};

const projectStatusLabels: Record<string, string> = {
  planning: 'Planejamento', in_progress: 'Em Andamento',
  on_hold: 'Em Pausa', completed: 'Concluído', cancelled: 'Cancelado',
};

const PIE_COLORS = ['#A6864A', '#3B82F6', '#8B5CF6', '#10B981', '#EF4444'];

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    mrr: 0, active_contracts: 0, expiring_contracts: 0,
    total_projects: 0, active_projects: 0, received_this_month: 0, paid_this_month: 0,
  });
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);

  // Chart data
  const [cashFlowData, setCashFlowData] = useState<CashFlowDay[]>([]);
  const [pipelineData, setPipelineData] = useState<PipelineItem[]>([]);
  const [projectStatusData, setProjectStatusData] = useState<ProjectStatusItem[]>([]);
  const [chartsLoading, setChartsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [contractsData, projectsData, financeData] = await Promise.all([
          api.get<Record<string, number>>('/sales/contracts/dashboard/').catch(() => ({} as Record<string, number>)),
          api.get<Record<string, number>>('/projects/projects/dashboard/').catch(() => ({} as Record<string, number>)),
          api.get<Record<string, number>>('/finance/invoices/dashboard/').catch(() => ({} as Record<string, number>)),
        ]);
        setStats({
          mrr: contractsData.mrr || 0,
          active_contracts: contractsData.active_contracts || 0,
          expiring_contracts: contractsData.expiring_contracts || 0,
          total_projects: projectsData.total_projects || 0,
          active_projects: projectsData.active_projects || 0,
          received_this_month: financeData.received_this_month || 0,
          paid_this_month: financeData.paid_this_month || 0,
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

        // Cash flow chart
        const byDay: CashFlowDay[] = (cashData.by_day || []).map((d) => ({
          day: new Date(d.day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
          income: d.income ? Number(d.income) : 0,
          expense: d.expense ? Number(d.expense) : 0,
        }));
        setCashFlowData(byDay);

        // Pipeline chart
        const prospects: { status: string; estimated_value: number }[] = Array.isArray(prospectsData.results || prospectsData)
          ? (prospectsData.results || prospectsData) as { status: string; estimated_value: number }[] : [];
        const grouped: Record<string, { count: number; value: number }> = {};
        prospects.forEach((p: { status: string; estimated_value: number }) => {
          if (!grouped[p.status]) grouped[p.status] = { count: 0, value: 0 };
          grouped[p.status].count++;
          grouped[p.status].value += p.estimated_value || 0;
        });
        const pipeline = Object.entries(grouped).map(([status, data]) => ({
          status,
          label: statusLabels[status] || status,
          count: data.count,
          value: data.value,
        }));
        setPipelineData(pipeline);

        // Projects status pie
        const projects: { status: string }[] = Array.isArray(projData.results || projData) ? (projData.results || projData) as { status: string }[] : [];
        const groupedProj: Record<string, number> = {};
        projects.forEach((p: { status: string }) => {
          groupedProj[p.status] = (groupedProj[p.status] || 0) + 1;
        });
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

    // Try to get username from accounts/me
    api.get<{ first_name?: string }>('/accounts/profile/')
      .then(data => { if (data?.first_name) setUserName(data.first_name); })
      .catch(() => {});

    fetchStats();
    fetchCharts();
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Bem-vindo{userName ? `, ${userName}` : ''}!
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Visão geral do seu negócio em tempo real.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className="card card-hover p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-11 h-11 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <span className="text-xs text-emerald-600 font-semibold flex items-center gap-0.5 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded-full">
              <ArrowUpRight className="w-3 h-3" /> MRR
            </span>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide">Receita Recorrente</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1.5 tabular-nums">
            {loading ? <span className="skeleton h-7 w-28 block" /> : formatCurrency(stats.mrr)}
          </p>
        </div>

        <div className="card card-hover p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-11 h-11 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
              <Briefcase className="w-5 h-5 text-blue-600" />
            </div>
            {stats.expiring_contracts > 0 && !loading && (
              <span className="text-[11px] text-amber-600 font-semibold bg-amber-50 dark:bg-amber-900/30 px-2 py-1 rounded-full">
                {stats.expiring_contracts} expirando
              </span>
            )}
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide">Contratos Ativos</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1.5 tabular-nums">
            {loading ? <span className="skeleton h-7 w-16 block" /> : stats.active_contracts}
          </p>
        </div>

        <div className="card card-hover p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-11 h-11 bg-violet-50 dark:bg-violet-900/30 rounded-xl flex items-center justify-center">
              <FolderKanban className="w-5 h-5 text-violet-600" />
            </div>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide">Projetos Ativos</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1.5 tabular-nums">
            {loading ? <span className="skeleton h-7 w-20 block" /> : (
              <>{stats.active_projects}<span className="text-gray-400 dark:text-gray-500 text-lg font-normal">/{stats.total_projects}</span></>
            )}
          </p>
        </div>

        <div className="card card-hover p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-11 h-11 bg-accent-gold/10 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-accent-gold" />
            </div>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-xs font-medium uppercase tracking-wide">Receita do Mês</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1.5 tabular-nums">
            {loading ? <span className="skeleton h-7 w-28 block" /> : formatCurrency(stats.received_this_month)}
          </p>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Cash Flow Line Chart */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">Fluxo de Caixa — Mês Atual</h2>
          {chartsLoading ? (
            <div className="h-48 skeleton" />
          ) : cashFlowData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
              Sem dados de transações no mês
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={cashFlowData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={formatCurrencyShort} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 12, border: '1px solid #f0f0f0', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', fontSize: 12 }} />
                <Line type="monotone" dataKey="income" name="Receitas" stroke="#10b981" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="expense" name="Despesas" stroke="#ef4444" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
          {/* Summary below chart */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-50 dark:border-gray-700">
            <div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium">Receitas</p>
              <p className="text-sm font-bold text-emerald-600 tabular-nums">
                {loading ? '...' : formatCurrency(stats.received_this_month)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium">Despesas</p>
              <p className="text-sm font-bold text-red-500 tabular-nums">
                {loading ? '...' : formatCurrency(stats.paid_this_month)}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium">Saldo</p>
              <p className={`text-sm font-bold tabular-nums ${stats.received_this_month - stats.paid_this_month >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {loading ? '...' : formatCurrency(stats.received_this_month - stats.paid_this_month)}
              </p>
            </div>
          </div>
        </div>

        {/* Pipeline Bar Chart */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">Pipeline de Prospecção</h2>
          {chartsLoading ? (
            <div className="h-48 skeleton" />
          ) : pipelineData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
              Nenhum prospect cadastrado
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={pipelineData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} angle={-25} textAnchor="end" axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value: number, name: string) =>
                    name === 'Quantidade' ? [value, name] : [formatCurrency(value), name]}
                  contentStyle={{ borderRadius: 12, border: '1px solid #f0f0f0', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', fontSize: 12 }}
                />
                <Bar dataKey="count" name="Quantidade" fill="#A6864A" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8">
        {/* Projects Pie Chart */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">Status dos Projetos</h2>
          {chartsLoading ? (
            <div className="h-48 skeleton" />
          ) : projectStatusData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
              Nenhum projeto cadastrado
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={projectStatusData} cx="50%" cy="50%" innerRadius={52} outerRadius={82}
                  paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}>
                  {projectStatusData.map((_, index) => (
                    <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #f0f0f0', boxShadow: '0 8px 24px rgba(0,0,0,0.08)', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Quick Actions */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-4">Ações Rápidas</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { href: '/crm',      Icon: Users,       label: 'Novo Prospect' },
              { href: '/sales',    Icon: FileText,    label: 'Nova Proposta' },
              { href: '/projects', Icon: FolderKanban, label: 'Novo Projeto' },
              { href: '/finance',  Icon: DollarSign,  label: 'Financeiro'   },
            ].map(({ href, Icon, label }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-accent-gold/5 border border-transparent hover:border-accent-gold/20 rounded-xl transition-all duration-150"
              >
                <Icon className="w-5 h-5 text-accent-gold" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-gray-900">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
