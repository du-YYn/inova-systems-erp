'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  BarChart2,
  TrendingUp,
  Clock,
  DollarSign,
  Download,
  AlertCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { Sensitive } from '@/components/ui/Sensitive';
import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CashFlowDay {
  day: string;
  income: number;
  expense: number;
}

interface HoursByProject {
  project: string;
  hours: number;
}

interface ProjectBudget {
  name: string;
  status: string;
  budget_value: number;
  spent: number;
  remaining: number;
}

type ReportTab = 'cashflow' | 'hours' | 'pipeline' | 'rentabilidade' | 'dre' | 'aging' | 'forecast';

interface ProjectProfitability {
  project_id: number;
  project_name: string;
  revenue: number;
  labor_cost: number;
  direct_expenses: number;
  total_cost: number;
  gross_margin: number;
  margin_pct: number;
  total_hours: number;
}

interface DREData {
  year: number; month: number;
  receita_bruta: number; deducoes: number; receita_liquida: number;
  despesas_operacionais: number; ebitda: number; lucro_liquido: number; margem_liquida: number;
}

interface AgingBucket {
  bucket: string;
  count: number;
  total: number;
  invoices: Array<{ id: number; number: string; customer_name: string; due_date: string; total: number; days_overdue: number }>;
}

interface ForecastMonth {
  month: string;
  mrr: number;
  active_contracts: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const formatCurrencyShort = (v: number) => {
  if (Math.abs(v) >= 1000) return `R$${(v / 1000).toFixed(0)}k`;
  return `R$${v.toFixed(0)}`;
};

const today = new Date().toISOString().split('T')[0];
const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

const PIPELINE_STATUS_LABELS: Record<string, string> = {
  lead_received: 'Lead Recebido',   qualifying:    'Em Qualificação',
  qualified:     'Qualificado',     not_qualified: 'Não Qualificado',
  scheduled:     'Agendado',        pre_meeting:   'Pré-Reunião',
  no_show:       'Não Compareceu',  meeting_done:  'Reunião Realizada',
  proposal_sent: 'Proposta Enviada', closed:       'Fechado',
  not_closed:    'Não Fechou',      follow_up:     'Em Follow-up',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function RelatoriosPage() {
  const [activeTab, setActiveTab] = useState<ReportTab>('cashflow');

  // Cash flow state
  const [cashFromDate, setCashFromDate] = useState(firstOfMonth);
  const [cashToDate, setCashToDate] = useState(today);
  const [cashFlowData, setCashFlowData] = useState<CashFlowDay[]>([]);
  const [cashSummary, setCashSummary] = useState({ income: 0, expense: 0, balance: 0 });
  const [loadingCash, setLoadingCash] = useState(false);

  // Hours state
  const [hoursByProject, setHoursByProject] = useState<HoursByProject[]>([]);
  const [projectBudgets, setProjectBudgets] = useState<ProjectBudget[]>([]);
  const [loadingHours, setLoadingHours] = useState(false);

  // Pipeline state
  const [pipelineData, setPipelineData] = useState<{ label: string; count: number; value: number }[]>([]);
  const [loadingPipeline, setLoadingPipeline] = useState(false);

  // Rentabilidade state
  const [profitabilityData, setProfitabilityData] = useState<ProjectProfitability[]>([]);
  const [loadingProfitability, setLoadingProfitability] = useState(false);

  // DRE state
  const [dreData, setDreData] = useState<DREData | null>(null);
  const [dreYear, setDreYear] = useState(new Date().getFullYear());
  const [dreMonth, setDreMonth] = useState(new Date().getMonth() + 1);
  const [loadingDre, setLoadingDre] = useState(false);

  // Aging state
  const [agingData, setAgingData] = useState<AgingBucket[]>([]);
  const [loadingAging, setLoadingAging] = useState(false);

  // Forecast state
  const [forecastData, setForecastData] = useState<ForecastMonth[]>([]);
  const [forecastSummary, setForecastSummary] = useState({ current_mrr: 0, pipeline_value: 0 });
  const [loadingForecast, setLoadingForecast] = useState(false);

  // ── Cash Flow ─────────────────────────────────────────────────────────────

  const fetchCashFlow = useCallback(async (from = cashFromDate, to = cashToDate) => {
    setLoadingCash(true);
    try {
      const data = await api.get<{ by_day?: { day: string; income: number | null; expense: number | null }[]; total_income?: number; total_expense?: number; balance?: number }>('/finance/transactions/cash_flow/', { from, to });
      const byDay: CashFlowDay[] = (data.by_day || []).map((d: { day: string; income: number | null; expense: number | null }) => ({
        day: new Date(d.day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        income: d.income ? Number(d.income) : 0,
        expense: d.expense ? Number(d.expense) : 0,
      }));
      setCashFlowData(byDay);
      setCashSummary({
        income: data.total_income || 0,
        expense: data.total_expense || 0,
        balance: data.balance || 0,
      });
    } catch {
      // silent
    } finally {
      setLoadingCash(false);
    }
  }, [cashFromDate, cashToDate]);

  // ── Hours by Project ──────────────────────────────────────────────────────

  const fetchHours = useCallback(async () => {
    setLoadingHours(true);
    try {
      const data = await api.get<{ results?: Array<{ id: number; name: string; total_hours?: number; budget_value?: number; status: string }> }>('/projects/projects/', { page_size: '100' });
      const projects = (data.results || []) as Array<{ id: number; name: string; total_hours?: number; budget_value?: number; status: string }>;

      const hoursMap: HoursByProject[] = projects
        .filter(p => (p.total_hours || 0) > 0)
        .map(p => ({
          project: p.name.length > 20 ? p.name.slice(0, 20) + '…' : p.name,
          hours: Number(p.total_hours) || 0,
        }))
        .sort((a: HoursByProject, b: HoursByProject) => b.hours - a.hours)
        .slice(0, 10);

      const budgets: ProjectBudget[] = projects.map(p => ({
        name: p.name,
        status: p.status,
        budget_value: Number(p.budget_value) || 0,
        spent: 0,
        remaining: Number(p.budget_value) || 0,
      }));

      setHoursByProject(hoursMap);
      setProjectBudgets(budgets.slice(0, 10));
    } catch {
      // silent
    } finally {
      setLoadingHours(false);
    }
  }, []);

  // ── Pipeline ──────────────────────────────────────────────────────────────

  const fetchPipeline = useCallback(async () => {
    setLoadingPipeline(true);
    try {
      const data = await api.get<{ results?: Array<{ status: string; estimated_value: number }> }>('/sales/prospects/', { page_size: '500' });
      const prospects = (data.results || []) as Array<{ status: string; estimated_value: number }>;

      const grouped: Record<string, { count: number; value: number }> = {};
      prospects.forEach((p: { status: string; estimated_value: number }) => {
        if (!grouped[p.status]) grouped[p.status] = { count: 0, value: 0 };
        grouped[p.status].count++;
        grouped[p.status].value += p.estimated_value || 0;
      });

      const pipeline = Object.entries(grouped).map(([status, d]) => ({
        label: PIPELINE_STATUS_LABELS[status] || status,
        count: d.count,
        value: d.value,
      }));
      setPipelineData(pipeline);
    } catch {
      // silent
    } finally {
      setLoadingPipeline(false);
    }
  }, []);

  // ── Rentabilidade ─────────────────────────────────────────────────────────

  const fetchProfitability = useCallback(async () => {
    setLoadingProfitability(true);
    try {
      const data = await api.get<{ results?: Array<{ id: number; name: string; budget_value?: number; total_hours?: number }> }>('/projects/projects/', { page_size: '100' });
      const projects = (data.results || []) as Array<{ id: number; name: string; budget_value?: number; total_hours?: number }>;

      const candidates = projects
        .filter(p => (p.budget_value || 0) > 0 || (p.total_hours || 0) > 0)
        .slice(0, 10);

      const results: ProjectProfitability[] = [];
      await Promise.all(
        candidates.map(async p => {
          try {
            const d = await api.get<Record<string, number>>(`/projects/projects/${p.id}/profitability/`);
            results.push({
              project_id: p.id,
              project_name: p.name,
              revenue: Number(d.revenue) || 0,
              labor_cost: Number(d.labor_cost) || 0,
              direct_expenses: Number(d.direct_expenses) || 0,
              total_cost: Number(d.total_cost) || 0,
              gross_margin: Number(d.gross_margin) || 0,
              margin_pct: Number(d.margin_pct) || 0,
              total_hours: Number(d.total_hours) || 0,
            });
          } catch {
            // silent
          }
        })
      );
      setProfitabilityData(results.sort((a, b) => b.revenue - a.revenue));
    } catch {
      // silent
    } finally {
      setLoadingProfitability(false);
    }
  }, []);

  // ── DRE ───────────────────────────────────────────────────────────────────

  const fetchDre = useCallback(async (year = dreYear, month = dreMonth) => {
    setLoadingDre(true);
    try {
      const d = await api.get<Record<string, number>>('/finance/invoices/dre/', { year: String(year), month: String(month) });
      setDreData({
        year: d.year || year,
        month: d.month || month,
        receita_bruta: Number(d.receita_bruta) || 0,
        deducoes: Number(d.deducoes) || 0,
        receita_liquida: Number(d.receita_liquida) || 0,
        despesas_operacionais: Number(d.despesas_operacionais) || 0,
        ebitda: Number(d.ebitda) || 0,
        lucro_liquido: Number(d.lucro_liquido) || 0,
        margem_liquida: Number(d.margem_liquida) || 0,
      });
    } catch {
      // silent
    } finally {
      setLoadingDre(false);
    }
  }, [dreYear, dreMonth]);

  // ── Aging ─────────────────────────────────────────────────────────────────

  const fetchAging = useCallback(async () => {
    setLoadingAging(true);
    try {
      const d = await api.get<{
        summary: Array<{ bucket: string; count: number; total: number }>;
        details: Record<string, Array<{ id: number; number: string; customer: string; due_date: string; total: number; days_overdue: number }>>;
        grand_total: number;
      }>('/finance/invoices/aging/');
      const buckets: AgingBucket[] = (d.summary || []).map(s => ({
        bucket: s.bucket,
        count: s.count,
        total: s.total,
        invoices: (d.details?.[s.bucket] || []).map(inv => ({
          id: inv.id,
          number: inv.number,
          customer_name: inv.customer,
          due_date: inv.due_date,
          total: inv.total,
          days_overdue: inv.days_overdue,
        })),
      }));
      setAgingData(buckets);
    } catch {
      // silent
    } finally {
      setLoadingAging(false);
    }
  }, []);

  // ── Forecast ──────────────────────────────────────────────────────────────

  const fetchForecast = useCallback(async () => {
    setLoadingForecast(true);
    try {
      const d = await api.get<{
        current_mrr: number;
        active_contracts: number;
        pipeline_value: number;
        forecast: ForecastMonth[];
      }>('/finance/transactions/forecast/');
      setForecastSummary({
        current_mrr: Number(d.current_mrr) || 0,
        pipeline_value: Number(d.pipeline_value) || 0,
      });
      const months: ForecastMonth[] = (d.forecast || []).map((m: ForecastMonth) => ({
        month: m.month,
        mrr: Number(m.mrr) || 0,
        active_contracts: Number(m.active_contracts) || 0,
      }));
      setForecastData(months);
    } catch {
      // silent
    } finally {
      setLoadingForecast(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'cashflow') fetchCashFlow();
    if (activeTab === 'hours') fetchHours();
    if (activeTab === 'pipeline') fetchPipeline();
    if (activeTab === 'rentabilidade') fetchProfitability();
    if (activeTab === 'dre') fetchDre();
    if (activeTab === 'aging') fetchAging();
    if (activeTab === 'forecast') fetchForecast();
  }, [activeTab]);

  const tabs = [
    { key: 'cashflow' as ReportTab, label: 'Fluxo de Caixa', icon: <TrendingUp className="w-4 h-4" /> },
    { key: 'hours' as ReportTab, label: 'Horas por Projeto', icon: <Clock className="w-4 h-4" /> },
    { key: 'pipeline' as ReportTab, label: 'Pipeline CRM', icon: <BarChart2 className="w-4 h-4" /> },
    { key: 'rentabilidade' as ReportTab, label: 'Rentabilidade', icon: <DollarSign className="w-4 h-4" /> },
    { key: 'dre' as ReportTab, label: 'DRE', icon: <BarChart2 className="w-4 h-4" /> },
    { key: 'aging' as ReportTab, label: 'Inadimplência', icon: <AlertCircle className="w-4 h-4" /> },
    { key: 'forecast' as ReportTab, label: 'Forecast MRR', icon: <TrendingUp className="w-4 h-4" /> },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Relatórios</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Análises e indicadores do seu negócio</p>
        </div>
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

      {/* ─── Cash Flow Tab ────────────────────────────────────────────────── */}
      {activeTab === 'cashflow' && (
        <div className="space-y-6">
          {/* Date filters */}
          <div className="card p-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 dark:text-gray-400">De:</label>
              <input type="date" value={cashFromDate}
                onChange={e => { setCashFromDate(e.target.value); fetchCashFlow(e.target.value, cashToDate); }}
                className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 dark:text-gray-400">Até:</label>
              <input type="date" value={cashToDate}
                onChange={e => { setCashToDate(e.target.value); fetchCashFlow(cashFromDate, e.target.value); }}
                className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm" />
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card p-5">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Receitas</p>
              <p className="text-2xl font-bold text-green-600"><Sensitive>{formatCurrency(cashSummary.income)}</Sensitive></p>
            </div>
            <div className="card p-5">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Despesas</p>
              <p className="text-2xl font-bold text-red-600"><Sensitive>{formatCurrency(cashSummary.expense)}</Sensitive></p>
            </div>
            <div className="card p-5">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Saldo</p>
              <p className={`text-2xl font-bold ${cashSummary.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                <Sensitive>{formatCurrency(cashSummary.balance)}</Sensitive>
              </p>
            </div>
          </div>

          {/* Chart */}
          <div className="card p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Receitas x Despesas por Dia</h2>
            {loadingCash ? (
              <div className="h-64 bg-gray-50 dark:bg-gray-700/50 rounded-lg animate-pulse" />
            ) : cashFlowData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
                Sem dados para o período selecionado
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={cashFlowData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={formatCurrencyShort} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="income" name="Receitas" stroke="#16a34a" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="expense" name="Despesas" stroke="#dc2626" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* ─── Hours by Project Tab ──────────────────────────────────────────── */}
      {activeTab === 'hours' && (
        <div className="space-y-6">
          {loadingHours ? (
            <div className="grid grid-cols-2 gap-6">
              {Array.from({ length: 2 }).map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : (
            <>
              <div className="card p-6">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Horas Lançadas por Projeto (Top 10)</h2>
                {hoursByProject.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-gray-500 dark:text-gray-400">
                    Nenhuma hora lançada
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={hoursByProject} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11 }} unit="h" />
                      <YAxis type="category" dataKey="project" tick={{ fontSize: 11 }} width={80} />
                      <Tooltip formatter={(v: number) => [`${v}h`, 'Horas']} />
                      <Bar dataKey="hours" name="Horas" fill="#A6864A" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="card">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Orçamento por Projeto</h2>
                </div>
                {projectBudgets.length === 0 ? (
                  <div className="py-10 text-center text-gray-500 dark:text-gray-400">Nenhum projeto com orçamento</div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-700">
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Projeto</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Orçamento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                      {projectBudgets.map((p, i) => (
                        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-gray-100"><Sensitive>{p.name}</Sensitive></td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              p.status === 'completed' ? 'bg-green-100 text-green-800' :
                              p.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                              p.status === 'on_hold' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
                            }`}>
                              {p.status === 'completed' ? 'Concluído' : p.status === 'in_progress' ? 'Em andamento' :
                               p.status === 'on_hold' ? 'Em pausa' : p.status === 'planning' ? 'Planejamento' : p.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right text-sm font-medium text-gray-900 dark:text-gray-100">
                            <Sensitive>{p.budget_value > 0 ? formatCurrency(p.budget_value) : '—'}</Sensitive>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Pipeline Tab ──────────────────────────────────────────────────────────── */}
      {activeTab === 'pipeline' && (
        <div className="space-y-6">
          {/* Summary totals */}
          {!loadingPipeline && pipelineData.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="card p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Prospects</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  <Sensitive>{pipelineData.reduce((s, d) => s + d.count, 0)}</Sensitive>
                </p>
              </div>
              <div className="card p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">Valor Total</p>
                <p className="text-xl font-bold text-accent-gold">
                  <Sensitive>{formatCurrency(pipelineData.reduce((s, d) => s + d.value, 0))}</Sensitive>
                </p>
              </div>
              <div className="card p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">Fechados</p>
                <p className="text-xl font-bold text-green-600">
                  <Sensitive>{pipelineData.find(d => d.label === 'Fechado')?.count || 0}</Sensitive>
                </p>
              </div>
              <div className="card p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">Em Proposta</p>
                <p className="text-xl font-bold text-orange-600">
                  <Sensitive>{pipelineData.find(d => d.label === 'Proposta')?.count || 0}</Sensitive>
                </p>
              </div>
            </div>
          )}

          <div className="card p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Prospects por Fase do Pipeline</h2>
            {loadingPipeline ? (
              <div className="h-64 bg-gray-50 dark:bg-gray-700/50 rounded-lg animate-pulse" />
            ) : pipelineData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">Nenhum prospect encontrado</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={pipelineData} margin={{ top: 5, right: 20, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Quantidade" fill="#A6864A" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Pipeline value table */}
          {!loadingPipeline && pipelineData.length > 0 && (
            <div className="card">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Fase</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Qtd</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Valor Est.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {pipelineData.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-gray-100">{row.label}</td>
                      <td className="py-3 px-4 text-right text-sm text-gray-500 dark:text-gray-400"><Sensitive>{row.count}</Sensitive></td>
                      <td className="py-3 px-4 text-right text-sm font-medium text-accent-gold"><Sensitive>{formatCurrency(row.value)}</Sensitive></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {/* ─── Rentabilidade Tab ─────────────────────────────────────────────────── */}
      {activeTab === 'rentabilidade' && (
        <div className="space-y-6">
          {loadingProfitability ? (
            <div className="card p-10 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-accent-gold border-t-transparent rounded-full animate-spin" />
            </div>
          ) : profitabilityData.length === 0 ? (
            <div className="card p-10 text-center text-gray-500 dark:text-gray-400">
              Nenhum projeto com dados de rentabilidade
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="card p-5">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Receita</p>
                  <p className="text-2xl font-bold text-green-600">
                    <Sensitive>{formatCurrency(profitabilityData.reduce((s, p) => s + p.revenue, 0))}</Sensitive>
                  </p>
                </div>
                <div className="card p-5">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total Custo</p>
                  <p className="text-2xl font-bold text-red-600">
                    <Sensitive>{formatCurrency(profitabilityData.reduce((s, p) => s + p.total_cost, 0))}</Sensitive>
                  </p>
                </div>
                <div className="card p-5">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Margem Média</p>
                  <p className="text-2xl font-bold text-accent-gold">
                    <Sensitive>{profitabilityData.length > 0
                      ? (profitabilityData.reduce((s, p) => s + p.margin_pct, 0) / profitabilityData.length).toFixed(1)
                      : '0'}%</Sensitive>
                  </p>
                </div>
              </div>

              {/* Table */}
              <div className="card">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Rentabilidade por Projeto</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-700">
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Projeto</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Receita</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Custo Mão de Obra</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Despesas Diretas</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Custo Total</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Margem Bruta</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Margem %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                      {profitabilityData.map(p => (
                        <tr key={p.project_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-gray-100"><Sensitive>{p.project_name}</Sensitive></td>
                          <td className="py-3 px-4 text-right text-sm text-gray-700 dark:text-gray-200"><Sensitive>{formatCurrency(p.revenue)}</Sensitive></td>
                          <td className="py-3 px-4 text-right text-sm text-gray-700 dark:text-gray-200"><Sensitive>{formatCurrency(p.labor_cost)}</Sensitive></td>
                          <td className="py-3 px-4 text-right text-sm text-gray-700 dark:text-gray-200"><Sensitive>{formatCurrency(p.direct_expenses)}</Sensitive></td>
                          <td className="py-3 px-4 text-right text-sm text-gray-700 dark:text-gray-200"><Sensitive>{formatCurrency(p.total_cost)}</Sensitive></td>
                          <td className="py-3 px-4 text-right text-sm text-gray-700 dark:text-gray-200"><Sensitive>{formatCurrency(p.gross_margin)}</Sensitive></td>
                          <td className="py-3 px-4 text-right">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              p.margin_pct >= 40
                                ? 'bg-green-100 text-green-800'
                                : p.margin_pct >= 20
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              <Sensitive>{p.margin_pct.toFixed(1)}%</Sensitive>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── DRE Tab ───────────────────────────────────────────────────────────── */}
      {activeTab === 'dre' && (
        <div className="space-y-6">
          {/* Year / Month selectors */}
          <div className="card p-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 dark:text-gray-400">Ano:</label>
              <input
                type="number" value={dreYear} min={2020} max={2099}
                onChange={e => setDreYear(Number(e.target.value))}
                className="w-24 px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 dark:text-gray-400">Mês:</label>
              <select
                value={dreMonth}
                onChange={e => setDreMonth(Number(e.target.value))}
                className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm"
              >
                {['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => fetchDre(dreYear, dreMonth)}
              className="px-4 py-1.5 bg-accent-gold text-white rounded-lg text-sm font-medium hover:bg-accent-gold-dark transition-colors"
            >
              Buscar
            </button>
          </div>

          {loadingDre ? (
            <div className="card p-10 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-accent-gold border-t-transparent rounded-full animate-spin" />
            </div>
          ) : dreData === null ? (
            <div className="card p-10 text-center text-gray-500 dark:text-gray-400">
              Selecione o período e clique em Buscar para visualizar o DRE
            </div>
          ) : (
            <div className="card p-6 max-w-2xl">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-6">
                Demonstrativo de Resultado — {dreData.month.toString().padStart(2, '0')}/{dreData.year}
              </h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Receita Bruta</span>
                  <span className="text-sm font-bold text-green-600"><Sensitive>{formatCurrency(dreData.receita_bruta)}</Sensitive></span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-sm text-gray-500 dark:text-gray-400">(-) Deduções</span>
                  <span className="text-sm font-medium text-red-500"><Sensitive>({formatCurrency(dreData.deducoes)})</Sensitive></span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700 bg-blue-50 -mx-6 px-6 rounded">
                  <span className="text-sm font-semibold text-blue-800">= Receita Líquida</span>
                  <span className="text-sm font-bold text-blue-700"><Sensitive>{formatCurrency(dreData.receita_liquida)}</Sensitive></span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700">
                  <span className="text-sm text-gray-500 dark:text-gray-400">(-) Despesas Operacionais</span>
                  <span className="text-sm font-medium text-red-500"><Sensitive>({formatCurrency(dreData.despesas_operacionais)})</Sensitive></span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700 bg-amber-50 -mx-6 px-6 rounded">
                  <span className="text-sm font-semibold text-amber-800">= EBITDA</span>
                  <span className={`text-sm font-bold ${dreData.ebitda >= 0 ? 'text-amber-700' : 'text-red-600'}`}>
                    <Sensitive>{formatCurrency(dreData.ebitda)}</Sensitive>
                  </span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 -mx-6 px-6 rounded">
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">= Lucro Líquido</span>
                  <span className={`text-sm font-bold ${dreData.lucro_liquido >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    <Sensitive>{formatCurrency(dreData.lucro_liquido)}</Sensitive>
                  </span>
                </div>
                <div className="flex items-center justify-between pt-3">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Margem Líquida</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    dreData.margem_liquida >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    <Sensitive>{dreData.margem_liquida.toFixed(1)}%</Sensitive>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Aging Tab ─────────────────────────────────────────────────────────── */}
      {activeTab === 'aging' && (
        <div className="space-y-6">
          {loadingAging ? (
            <div className="card p-10 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-accent-gold border-t-transparent rounded-full animate-spin" />
            </div>
          ) : agingData.length === 0 ? (
            <div className="card p-10 text-center text-gray-500 dark:text-gray-400">
              Nenhuma inadimplência encontrada
            </div>
          ) : (
            <>
              {/* Total overdue */}
              <div className="card p-5">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Total em Aberto (vencido)</p>
                <p className="text-2xl font-bold text-red-600">
                  <Sensitive>{formatCurrency(agingData.reduce((s, b) => s + b.total, 0))}</Sensitive>
                </p>
              </div>

              {/* Bucket summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {agingData.map(bucket => (
                  <div key={bucket.bucket} className="card p-4">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{bucket.bucket}</p>
                    <p className="text-lg font-bold text-red-600"><Sensitive>{formatCurrency(bucket.total)}</Sensitive></p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1"><Sensitive>{bucket.count}</Sensitive> fatura{bucket.count !== 1 ? 's' : ''}</p>
                  </div>
                ))}
              </div>

              {/* Bucket invoice tables */}
              {agingData.map(bucket => bucket.invoices && bucket.invoices.length > 0 && (
                <div key={bucket.bucket} className="card">
                  <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{bucket.bucket}</h3>
                    <span className="ml-auto text-sm font-medium text-red-600"><Sensitive>{formatCurrency(bucket.total)}</Sensitive></span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-700">
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Nº</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Cliente</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Vencimento</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Valor</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Dias em Atraso</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                        {bucket.invoices.map(inv => (
                          <tr key={inv.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-200 font-mono"><Sensitive>{inv.number}</Sensitive></td>
                            <td className="py-3 px-4 text-sm text-gray-900 dark:text-gray-100 font-medium"><Sensitive>{inv.customer_name}</Sensitive></td>
                            <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                              {new Date(inv.due_date).toLocaleDateString('pt-BR')}
                            </td>
                            <td className="py-3 px-4 text-right text-sm font-medium text-gray-900 dark:text-gray-100">
                              <Sensitive>{formatCurrency(inv.total)}</Sensitive>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">
                                {inv.days_overdue}d
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ─── Forecast Tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'forecast' && (
        <div className="space-y-6">
          {loadingForecast ? (
            <div className="card p-10 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-accent-gold border-t-transparent rounded-full animate-spin" />
            </div>
          ) : forecastData.length === 0 ? (
            <div className="card p-10 text-center text-gray-500 dark:text-gray-400">
              Nenhum dado de forecast disponível
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="card p-5">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">MRR Atual</p>
                  <p className="text-2xl font-bold text-accent-gold">
                    <Sensitive>{formatCurrency(forecastSummary.current_mrr)}</Sensitive>
                  </p>
                </div>
                <div className="card p-5">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Projeção 6 meses</p>
                  <p className="text-2xl font-bold text-blue-600">
                    <Sensitive>{formatCurrency(forecastData.slice(0, 6).reduce((s, m) => s + m.mrr, 0))}</Sensitive>
                  </p>
                </div>
                <div className="card p-5">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Projeção 12 meses</p>
                  <p className="text-2xl font-bold text-green-600">
                    <Sensitive>{formatCurrency(forecastData.slice(0, 12).reduce((s, m) => s + m.mrr, 0))}</Sensitive>
                  </p>
                </div>
              </div>

              {/* Chart */}
              <div className="card p-6">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Forecast MRR — Próximos 12 meses</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={forecastData.slice(0, 12)} margin={{ top: 5, right: 20, bottom: 20, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" />
                    <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="mrr" name="MRR Projetado" stroke="#A6864A" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Monthly breakdown table */}
              <div className="card">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Detalhamento Mensal</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-700">
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Mês</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">MRR Projetado</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Contratos Ativos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                      {forecastData.slice(0, 12).map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-gray-100">{row.month}</td>
                          <td className="py-3 px-4 text-right text-sm text-accent-gold font-medium"><Sensitive>{formatCurrency(row.mrr)}</Sensitive></td>
                          <td className="py-3 px-4 text-right text-sm text-gray-700 dark:text-gray-200"><Sensitive>{row.active_contracts}</Sensitive></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
