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
  total_budget: number;
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
  contracted_mrr: number;
  pipeline_mrr: number;
  total: number;
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
  new: 'Novo', contacted: 'Contatado', qualified: 'Qualificado',
  meeting: 'Reunião', proposal: 'Proposta', negotiation: 'Negociação',
  won: 'Fechado', lost: 'Perdido',
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
  const [loadingForecast, setLoadingForecast] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
  const headers = { 'Content-Type': 'application/json' };

  // ── Cash Flow ─────────────────────────────────────────────────────────────

  const fetchCashFlow = useCallback(async (from = cashFromDate, to = cashToDate) => {
    setLoadingCash(true);
    try {
      const res = await fetch(`${apiUrl}/finance/transactions/cash_flow/?from=${from}&to=${to}`, { headers, credentials: 'include' });
      if (!res.ok) throw new Error();
      const data = await res.json();
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
      const res = await fetch(`${apiUrl}/projects/projects/?page_size=100`, { headers, credentials: 'include' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const projects = Array.isArray(data.results || data) ? (data.results || data) : [];

      const hoursMap: HoursByProject[] = projects
        .filter((p: { total_hours?: number }) => (p.total_hours || 0) > 0)
        .map((p: { name: string; total_hours: number; total_budget?: number; status: string }) => ({
          project: p.name.length > 20 ? p.name.slice(0, 20) + '…' : p.name,
          hours: Number(p.total_hours) || 0,
        }))
        .sort((a: HoursByProject, b: HoursByProject) => b.hours - a.hours)
        .slice(0, 10);

      const budgets: ProjectBudget[] = projects.map((p: { name: string; status: string; total_budget?: number }) => ({
        name: p.name,
        status: p.status,
        total_budget: Number(p.total_budget) || 0,
        spent: 0,
        remaining: Number(p.total_budget) || 0,
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
      const res = await fetch(`${apiUrl}/sales/prospects/?page_size=500`, { headers, credentials: 'include' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const prospects = Array.isArray(data.results || data) ? (data.results || data) : [];

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
      const res = await fetch(`${apiUrl}/projects/projects/?page_size=100`, { headers, credentials: 'include' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const projects: Array<{ id: number; name: string; total_budget?: number; total_hours?: number }> =
        Array.isArray(data.results || data) ? (data.results || data) : [];

      const candidates = projects
        .filter(p => (p.total_budget || 0) > 0 || (p.total_hours || 0) > 0)
        .slice(0, 10);

      const results: ProjectProfitability[] = [];
      await Promise.all(
        candidates.map(async p => {
          try {
            const r = await fetch(`${apiUrl}/projects/projects/${p.id}/profitability/`, { headers, credentials: 'include' });
            if (!r.ok) return;
            const d = await r.json();
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
      const res = await fetch(`${apiUrl}/finance/invoices/dre/?year=${year}&month=${month}`, { headers, credentials: 'include' });
      if (!res.ok) throw new Error();
      const d = await res.json();
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
      const res = await fetch(`${apiUrl}/finance/invoices/aging/`, { headers, credentials: 'include' });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setAgingData(Array.isArray(d) ? d : d.buckets || []);
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
      const res = await fetch(`${apiUrl}/finance/transactions/forecast/`, { headers, credentials: 'include' });
      if (!res.ok) throw new Error();
      const d = await res.json();
      const months: ForecastMonth[] = (Array.isArray(d) ? d : d.months || []).map(
        (m: { month: string; contracted_mrr: number; pipeline_mrr: number; total: number }) => ({
          month: m.month,
          contracted_mrr: Number(m.contracted_mrr) || 0,
          pipeline_mrr: Number(m.pipeline_mrr) || 0,
          total: Number(m.total) || 0,
        })
      );
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
          <h1 className="text-2xl font-semibold text-gray-900">Relatórios</h1>
          <p className="text-gray-500 mt-1">Análises e indicadores do seu negócio</p>
        </div>
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

      {/* ─── Cash Flow Tab ────────────────────────────────────────────────── */}
      {activeTab === 'cashflow' && (
        <div className="space-y-6">
          {/* Date filters */}
          <div className="card p-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">De:</label>
              <input type="date" value={cashFromDate}
                onChange={e => { setCashFromDate(e.target.value); fetchCashFlow(e.target.value, cashToDate); }}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">Até:</label>
              <input type="date" value={cashToDate}
                onChange={e => { setCashToDate(e.target.value); fetchCashFlow(cashFromDate, e.target.value); }}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card p-5">
              <p className="text-sm text-gray-500 mb-1">Total Receitas</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(cashSummary.income)}</p>
            </div>
            <div className="card p-5">
              <p className="text-sm text-gray-500 mb-1">Total Despesas</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(cashSummary.expense)}</p>
            </div>
            <div className="card p-5">
              <p className="text-sm text-gray-500 mb-1">Saldo</p>
              <p className={`text-2xl font-bold ${cashSummary.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(cashSummary.balance)}
              </p>
            </div>
          </div>

          {/* Chart */}
          <div className="card p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Receitas x Despesas por Dia</h2>
            {loadingCash ? (
              <div className="h-64 bg-gray-50 rounded-lg animate-pulse" />
            ) : cashFlowData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-gray-500">
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
                <h2 className="text-lg font-bold text-gray-900 mb-4">Horas Lançadas por Projeto (Top 10)</h2>
                {hoursByProject.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-gray-500">
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
                <div className="p-4 border-b border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-900">Orçamento por Projeto</h2>
                </div>
                {projectBudgets.length === 0 ? (
                  <div className="py-10 text-center text-gray-500">Nenhum projeto com orçamento</div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Projeto</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Orçamento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {projectBudgets.map((p, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="py-3 px-4 text-sm font-medium text-gray-900">{p.name}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              p.status === 'completed' ? 'bg-green-100 text-green-800' :
                              p.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                              p.status === 'on_hold' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {p.status === 'completed' ? 'Concluído' : p.status === 'in_progress' ? 'Em andamento' :
                               p.status === 'on_hold' ? 'Em pausa' : p.status === 'planning' ? 'Planejamento' : p.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right text-sm font-medium text-gray-900">
                            {p.total_budget > 0 ? formatCurrency(p.total_budget) : '—'}
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
                <p className="text-sm text-gray-500">Total Prospects</p>
                <p className="text-xl font-bold text-gray-900">
                  {pipelineData.reduce((s, d) => s + d.count, 0)}
                </p>
              </div>
              <div className="card p-4">
                <p className="text-sm text-gray-500">Valor Total</p>
                <p className="text-xl font-bold text-[#A6864A]">
                  {formatCurrency(pipelineData.reduce((s, d) => s + d.value, 0))}
                </p>
              </div>
              <div className="card p-4">
                <p className="text-sm text-gray-500">Fechados</p>
                <p className="text-xl font-bold text-green-600">
                  {pipelineData.find(d => d.label === 'Fechado')?.count || 0}
                </p>
              </div>
              <div className="card p-4">
                <p className="text-sm text-gray-500">Em Proposta</p>
                <p className="text-xl font-bold text-orange-600">
                  {pipelineData.find(d => d.label === 'Proposta')?.count || 0}
                </p>
              </div>
            </div>
          )}

          <div className="card p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Prospects por Fase do Pipeline</h2>
            {loadingPipeline ? (
              <div className="h-64 bg-gray-50 rounded-lg animate-pulse" />
            ) : pipelineData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-gray-500">Nenhum prospect encontrado</div>
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
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fase</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Qtd</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor Est.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pipelineData.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm font-medium text-gray-900">{row.label}</td>
                      <td className="py-3 px-4 text-right text-sm text-gray-500">{row.count}</td>
                      <td className="py-3 px-4 text-right text-sm font-medium text-[#A6864A]">{formatCurrency(row.value)}</td>
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
              <div className="w-8 h-8 border-4 border-[#A6864A] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : profitabilityData.length === 0 ? (
            <div className="card p-10 text-center text-gray-500">
              Nenhum projeto com dados de rentabilidade
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="card p-5">
                  <p className="text-sm text-gray-500 mb-1">Total Receita</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(profitabilityData.reduce((s, p) => s + p.revenue, 0))}
                  </p>
                </div>
                <div className="card p-5">
                  <p className="text-sm text-gray-500 mb-1">Total Custo</p>
                  <p className="text-2xl font-bold text-red-600">
                    {formatCurrency(profitabilityData.reduce((s, p) => s + p.total_cost, 0))}
                  </p>
                </div>
                <div className="card p-5">
                  <p className="text-sm text-gray-500 mb-1">Margem Média</p>
                  <p className="text-2xl font-bold text-[#A6864A]">
                    {profitabilityData.length > 0
                      ? (profitabilityData.reduce((s, p) => s + p.margin_pct, 0) / profitabilityData.length).toFixed(1)
                      : '0'}%
                  </p>
                </div>
              </div>

              {/* Table */}
              <div className="card">
                <div className="p-4 border-b border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-900">Rentabilidade por Projeto</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Projeto</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Receita</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Custo Mão de Obra</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Despesas Diretas</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Custo Total</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Margem Bruta</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Margem %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {profitabilityData.map(p => (
                        <tr key={p.project_id} className="hover:bg-gray-50">
                          <td className="py-3 px-4 text-sm font-medium text-gray-900">{p.project_name}</td>
                          <td className="py-3 px-4 text-right text-sm text-gray-700">{formatCurrency(p.revenue)}</td>
                          <td className="py-3 px-4 text-right text-sm text-gray-700">{formatCurrency(p.labor_cost)}</td>
                          <td className="py-3 px-4 text-right text-sm text-gray-700">{formatCurrency(p.direct_expenses)}</td>
                          <td className="py-3 px-4 text-right text-sm text-gray-700">{formatCurrency(p.total_cost)}</td>
                          <td className="py-3 px-4 text-right text-sm text-gray-700">{formatCurrency(p.gross_margin)}</td>
                          <td className="py-3 px-4 text-right">
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              p.margin_pct >= 40
                                ? 'bg-green-100 text-green-800'
                                : p.margin_pct >= 20
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {p.margin_pct.toFixed(1)}%
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
              <label className="text-sm text-gray-500">Ano:</label>
              <input
                type="number" value={dreYear} min={2020} max={2099}
                onChange={e => setDreYear(Number(e.target.value))}
                className="w-24 px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">Mês:</label>
              <select
                value={dreMonth}
                onChange={e => setDreMonth(Number(e.target.value))}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
              >
                {['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => fetchDre(dreYear, dreMonth)}
              className="px-4 py-1.5 bg-[#A6864A] text-white rounded-lg text-sm font-medium hover:bg-[#8f7140] transition-colors"
            >
              Buscar
            </button>
          </div>

          {loadingDre ? (
            <div className="card p-10 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-[#A6864A] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : dreData === null ? (
            <div className="card p-10 text-center text-gray-500">
              Selecione o período e clique em Buscar para visualizar o DRE
            </div>
          ) : (
            <div className="card p-6 max-w-2xl">
              <h2 className="text-lg font-bold text-gray-900 mb-6">
                Demonstrativo de Resultado — {dreData.month.toString().padStart(2, '0')}/{dreData.year}
              </h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <span className="text-sm font-medium text-gray-700">Receita Bruta</span>
                  <span className="text-sm font-bold text-green-600">{formatCurrency(dreData.receita_bruta)}</span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <span className="text-sm text-gray-500">(-) Deduções</span>
                  <span className="text-sm font-medium text-red-500">({formatCurrency(dreData.deducoes)})</span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-200 bg-blue-50 -mx-6 px-6 rounded">
                  <span className="text-sm font-semibold text-blue-800">= Receita Líquida</span>
                  <span className="text-sm font-bold text-blue-700">{formatCurrency(dreData.receita_liquida)}</span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <span className="text-sm text-gray-500">(-) Despesas Operacionais</span>
                  <span className="text-sm font-medium text-red-500">({formatCurrency(dreData.despesas_operacionais)})</span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-200 bg-amber-50 -mx-6 px-6 rounded">
                  <span className="text-sm font-semibold text-amber-800">= EBITDA</span>
                  <span className={`text-sm font-bold ${dreData.ebitda >= 0 ? 'text-amber-700' : 'text-red-600'}`}>
                    {formatCurrency(dreData.ebitda)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-200 bg-gray-50 -mx-6 px-6 rounded">
                  <span className="text-sm font-semibold text-gray-800">= Lucro Líquido</span>
                  <span className={`text-sm font-bold ${dreData.lucro_liquido >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(dreData.lucro_liquido)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-3">
                  <span className="text-sm font-medium text-gray-700">Margem Líquida</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    dreData.margem_liquida >= 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {dreData.margem_liquida.toFixed(1)}%
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
              <div className="w-8 h-8 border-4 border-[#A6864A] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : agingData.length === 0 ? (
            <div className="card p-10 text-center text-gray-500">
              Nenhuma inadimplência encontrada
            </div>
          ) : (
            <>
              {/* Total overdue */}
              <div className="card p-5">
                <p className="text-sm text-gray-500 mb-1">Total em Aberto (vencido)</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(agingData.reduce((s, b) => s + b.total, 0))}
                </p>
              </div>

              {/* Bucket summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {agingData.map(bucket => (
                  <div key={bucket.bucket} className="card p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{bucket.bucket}</p>
                    <p className="text-lg font-bold text-red-600">{formatCurrency(bucket.total)}</p>
                    <p className="text-xs text-gray-400 mt-1">{bucket.count} fatura{bucket.count !== 1 ? 's' : ''}</p>
                  </div>
                ))}
              </div>

              {/* Bucket invoice tables */}
              {agingData.map(bucket => bucket.invoices && bucket.invoices.length > 0 && (
                <div key={bucket.bucket} className="card">
                  <div className="p-4 border-b border-gray-100 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <h3 className="text-sm font-semibold text-gray-900">{bucket.bucket}</h3>
                    <span className="ml-auto text-sm font-medium text-red-600">{formatCurrency(bucket.total)}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nº</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente</th>
                          <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Vencimento</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                          <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Dias em Atraso</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {bucket.invoices.map(inv => (
                          <tr key={inv.id} className="hover:bg-gray-50">
                            <td className="py-3 px-4 text-sm text-gray-700 font-mono">{inv.number}</td>
                            <td className="py-3 px-4 text-sm text-gray-900 font-medium">{inv.customer_name}</td>
                            <td className="py-3 px-4 text-sm text-gray-500">
                              {new Date(inv.due_date).toLocaleDateString('pt-BR')}
                            </td>
                            <td className="py-3 px-4 text-right text-sm font-medium text-gray-900">
                              {formatCurrency(inv.total)}
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
              <div className="w-8 h-8 border-4 border-[#A6864A] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : forecastData.length === 0 ? (
            <div className="card p-10 text-center text-gray-500">
              Nenhum dado de forecast disponível
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-4">
                <div className="card p-5">
                  <p className="text-sm text-gray-500 mb-1">MRR Atual</p>
                  <p className="text-2xl font-bold text-[#A6864A]">
                    {formatCurrency(forecastData[0]?.contracted_mrr || 0)}
                  </p>
                </div>
                <div className="card p-5">
                  <p className="text-sm text-gray-500 mb-1">Projeção 6 meses</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {formatCurrency(forecastData.slice(0, 6).reduce((s, m) => s + m.total, 0))}
                  </p>
                </div>
                <div className="card p-5">
                  <p className="text-sm text-gray-500 mb-1">Projeção 12 meses</p>
                  <p className="text-2xl font-bold text-green-600">
                    {formatCurrency(forecastData.slice(0, 12).reduce((s, m) => s + m.total, 0))}
                  </p>
                </div>
              </div>

              {/* Chart */}
              <div className="card p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Forecast MRR — Próximos 12 meses</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={forecastData.slice(0, 12)} margin={{ top: 5, right: 20, bottom: 20, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" />
                    <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="contracted_mrr" name="MRR Contratado" stroke="#A6864A" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="pipeline_mrr" name="MRR Pipeline" stroke="#60a5fa" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                    <Line type="monotone" dataKey="total" name="Total" stroke="#16a34a" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Monthly breakdown table */}
              <div className="card">
                <div className="p-4 border-b border-gray-100">
                  <h2 className="text-lg font-semibold text-gray-900">Detalhamento Mensal</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Mês</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">MRR Contratado</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">MRR Pipeline</th>
                        <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {forecastData.slice(0, 12).map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="py-3 px-4 text-sm font-medium text-gray-900">{row.month}</td>
                          <td className="py-3 px-4 text-right text-sm text-[#A6864A] font-medium">{formatCurrency(row.contracted_mrr)}</td>
                          <td className="py-3 px-4 text-right text-sm text-blue-600">{formatCurrency(row.pipeline_mrr)}</td>
                          <td className="py-3 px-4 text-right text-sm font-bold text-green-600">{formatCurrency(row.total)}</td>
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
