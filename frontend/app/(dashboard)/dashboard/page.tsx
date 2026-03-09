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

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
  const headers = { 'Content-Type': 'application/json' };

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [contractsRes, projectsRes, financeRes] = await Promise.all([
          fetch(`${apiUrl}/sales/contracts/dashboard/`, { headers, credentials: 'include' }),
          fetch(`${apiUrl}/projects/projects/dashboard/`, { headers, credentials: 'include' }),
          fetch(`${apiUrl}/finance/invoices/dashboard/`, { headers, credentials: 'include' }),
        ]);
        const [contractsData, projectsData, financeData]: [
          Record<string, number>, Record<string, number>, Record<string, number>
        ] = await Promise.all([
          contractsRes.ok ? contractsRes.json() : {},
          projectsRes.ok ? projectsRes.json() : {},
          financeRes.ok ? financeRes.json() : {},
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

        const [cashRes, prospectsRes, projectsRes] = await Promise.all([
          fetch(`${apiUrl}/finance/transactions/cash_flow/?from=${from}&to=${to}`, { headers, credentials: 'include' }),
          fetch(`${apiUrl}/sales/prospects/?page_size=500`, { headers, credentials: 'include' }),
          fetch(`${apiUrl}/projects/projects/?page_size=500`, { headers, credentials: 'include' }),
        ]);

        // Cash flow chart
        if (cashRes.ok) {
          const cashData = await cashRes.json();
          const byDay: CashFlowDay[] = (cashData.by_day || []).map((d: { day: string; income: number | null; expense: number | null }) => ({
            day: new Date(d.day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
            income: d.income ? Number(d.income) : 0,
            expense: d.expense ? Number(d.expense) : 0,
          }));
          setCashFlowData(byDay);
        }

        // Pipeline chart
        if (prospectsRes.ok) {
          const prospectsData = await prospectsRes.json();
          const prospects = Array.isArray(prospectsData.results || prospectsData)
            ? (prospectsData.results || prospectsData) : [];
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
        }

        // Projects status pie
        if (projectsRes.ok) {
          const projData = await projectsRes.json();
          const projects = Array.isArray(projData.results || projData) ? (projData.results || projData) : [];
          const grouped: Record<string, number> = {};
          projects.forEach((p: { status: string }) => {
            grouped[p.status] = (grouped[p.status] || 0) + 1;
          });
          setProjectStatusData(
            Object.entries(grouped).map(([status, count]) => ({
              name: projectStatusLabels[status] || status,
              value: count,
            }))
          );
        }
      } catch (error) {
        console.error('Error fetching chart data:', error);
      } finally {
        setChartsLoading(false);
      }
    };

    // Try to get username from accounts/me
    fetch(`${apiUrl}/accounts/profile/`, { headers, credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.first_name) setUserName(data.first_name); })
      .catch(() => {});

    fetchStats();
    fetchCharts();
  }, []);

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary">
          Bem-vindo{userName ? `, ${userName}` : ''}!
        </h1>
        <p className="text-text-secondary mt-1">Overview do seu negócio</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <span className="text-xs text-green-600 font-medium flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" /> MRR
            </span>
          </div>
          <p className="text-text-secondary text-sm">Receita Recorrente Mensal</p>
          <p className="text-2xl font-semibold text-text-primary mt-1">
            {loading ? <span className="animate-pulse">...</span> : formatCurrency(stats.mrr)}
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
              <Briefcase className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <p className="text-text-secondary text-sm">Contratos Ativos</p>
          <p className="text-2xl font-semibold text-text-primary mt-1">
            {loading ? <span className="animate-pulse">...</span> : stats.active_contracts}
          </p>
          {stats.expiring_contracts > 0 && (
            <p className="text-xs text-orange-600 mt-1">{stats.expiring_contracts} expirando em 30 dias</p>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center">
              <FolderKanban className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <p className="text-text-secondary text-sm">Projetos Ativos</p>
          <p className="text-2xl font-semibold text-text-primary mt-1">
            {loading ? <span className="animate-pulse">...</span> : `${stats.active_projects}/${stats.total_projects}`}
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-[#A6864A]/10 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-[#A6864A]" />
            </div>
          </div>
          <p className="text-text-secondary text-sm">Receita do Mês</p>
          <p className="text-2xl font-semibold text-text-primary mt-1">
            {loading ? <span className="animate-pulse">...</span> : formatCurrency(stats.received_this_month)}
          </p>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Cash Flow Line Chart */}
        <div className="bg-white p-6 rounded-lg border border-gray-100">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Fluxo de Caixa — Mês Atual</h2>
          {chartsLoading ? (
            <div className="h-48 bg-gray-50 rounded-lg animate-pulse" />
          ) : cashFlowData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-text-secondary text-sm">
              Sem dados de transações no mês
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={cashFlowData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={formatCurrencyShort} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Line type="monotone" dataKey="income" name="Receitas" stroke="#16a34a" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="expense" name="Despesas" stroke="#dc2626" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
          {/* Summary below chart */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <ArrowUpRight className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-text-secondary">Receitas</p>
                <p className="text-sm font-semibold text-green-600">
                  {loading ? '...' : formatCurrency(stats.received_this_month)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                <ArrowDownRight className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <p className="text-xs text-text-secondary">Despesas</p>
                <p className="text-sm font-semibold text-red-600">
                  {loading ? '...' : formatCurrency(stats.paid_this_month)}
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs text-text-secondary">Saldo</p>
              <p className={`text-sm font-bold ${stats.received_this_month - stats.paid_this_month >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {loading ? '...' : formatCurrency(stats.received_this_month - stats.paid_this_month)}
              </p>
            </div>
          </div>
        </div>

        {/* Pipeline Bar Chart */}
        <div className="bg-white p-6 rounded-lg border border-gray-100">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Pipeline de Prospecção</h2>
          {chartsLoading ? (
            <div className="h-48 bg-gray-50 rounded-lg animate-pulse" />
          ) : pipelineData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-text-secondary text-sm">
              Nenhum prospect cadastrado
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={pipelineData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} angle={-25} textAnchor="end" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: number, name: string) =>
                    name === 'Quantidade' ? [value, name] : [formatCurrency(value), name]}
                />
                <Bar dataKey="count" name="Quantidade" fill="#A6864A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Projects Pie Chart */}
        <div className="bg-white p-6 rounded-lg border border-gray-100">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Status dos Projetos</h2>
          {chartsLoading ? (
            <div className="h-48 bg-gray-50 rounded-lg animate-pulse" />
          ) : projectStatusData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-text-secondary text-sm">
              Nenhum projeto cadastrado
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={projectStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                  paddingAngle={3} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}>
                  {projectStatusData.map((_, index) => (
                    <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-white p-6 rounded-lg border border-gray-100">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Ações Rápidas</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/crm" className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <Users className="w-5 h-5 text-[#A6864A] mb-2" />
              <span className="text-sm font-medium">Novo Prospect</span>
            </Link>
            <Link href="/sales" className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <FileText className="w-5 h-5 text-[#A6864A] mb-2" />
              <span className="text-sm font-medium">Nova Proposta</span>
            </Link>
            <Link href="/projects" className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <FolderKanban className="w-5 h-5 text-[#A6864A] mb-2" />
              <span className="text-sm font-medium">Novo Projeto</span>
            </Link>
            <Link href="/finance" className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <DollarSign className="w-5 h-5 text-[#A6864A] mb-2" />
              <span className="text-sm font-medium">Financeiro</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
