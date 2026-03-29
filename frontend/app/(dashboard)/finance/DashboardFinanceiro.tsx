'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Target,
  RefreshCcw,
  Users,
  Percent,
  ArrowDownRight,
  Wallet,
  ChevronLeft,
  ChevronRight,
  PiggyBank,
  Shield,
  UserCheck,
  AlertTriangle,
  Landmark,
} from 'lucide-react';
import api from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { Sensitive } from '@/components/ui/Sensitive';
import { CardSkeleton } from '@/components/ui/Skeleton';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardIndicators {
  rob: number;
  rol: number;
  ebitda: number;
  resultado: number;
  mrr: number;
  churn_rate: number;
  churn_value: number;
  margem_contribuicao: number;
  margem_ebitda: number;
  break_even: number;
}

interface DashboardDRE {
  rob: number;
  churn: number;
  deducoes: number;
  rol: number;
  custos_variaveis: number;
  lucro_bruto: number;
  margem_contribuicao: number;
  despesas_operacionais: number;
  ebitda: number;
  margem_ebitda: number;
  depreciacao: number;
  despesas_financeiras: number;
  ebit: number;
  ir_csll: number;
  resultado_liquido: number;
}

interface DashboardCustomer {
  id: number;
  name: string;
  ticket: number;
  costs: number;
  margin: number;
  billing_frequency: string;
  is_active: boolean;
}

interface DashboardResponse {
  period: string;
  indicators: DashboardIndicators;
  dre: DashboardDRE;
  customers: DashboardCustomer[];
  active_customers: number;
  churned_customers: number;
}

interface ProfitDistPartner {
  name: string;
  share_pct: number;
  value: number;
}

interface ProfitDistResponse {
  resultado: number;
  working_capital: number;
  reserve_fund: number;
  directors_total: number;
  partners: ProfitDistPartner[];
  excess: number;
}

interface DashboardFinanceiroProps {
  isDemoMode: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));

const fmtPercent = (v: number) => `${v.toFixed(2)}%`;

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardFinanceiro({ isDemoMode }: DashboardFinanceiroProps) {
  const toast = useToast();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardResponse | null>(null);

  const [profitDist, setProfitDist] = useState<ProfitDistResponse | null>(null);
  const [profitDistError, setProfitDistError] = useState<string | null>(null);
  const [profitDistLoading, setProfitDistLoading] = useState(false);

  // ── Fetch dashboard data ────────────────────────────────────────────────────

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<DashboardResponse>('/finance/fin-dashboard/', {
        year: String(year),
        month: String(month),
      });
      setData(res);
    } catch {
      toast.error('Erro ao carregar dashboard financeiro');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  // ── Fetch profit distribution ───────────────────────────────────────────────

  const fetchProfitDist = useCallback(async (resultado: number) => {
    setProfitDistLoading(true);
    setProfitDistError(null);
    try {
      const res = await api.get<ProfitDistResponse>('/finance/profit-dist/calculate/', {
        resultado: String(resultado),
      });
      setProfitDist(res);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Erro ao calcular distribuição';
      if (message.includes('Configure')) {
        setProfitDistError('Configure a distribuição de lucros no módulo Configurações.');
      } else {
        setProfitDistError(message);
      }
      setProfitDist(null);
    } finally {
      setProfitDistLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    if (data) {
      fetchProfitDist(data.indicators.resultado);
    }
  }, [data, fetchProfitDist]);

  // ── Month navigation ────────────────────────────────────────────────────────

  const goPrev = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };

  const goNext = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // ── Indicator cards config ──────────────────────────────────────────────────

  const indicatorCards = data
    ? [
        { label: 'ROB', value: data.indicators.rob, icon: DollarSign, isCurrency: true },
        { label: 'ROL', value: data.indicators.rol, icon: TrendingUp, isCurrency: true },
        { label: 'EBITDA', value: data.indicators.ebitda, icon: BarChart3, isCurrency: true },
        { label: 'Resultado', value: data.indicators.resultado, icon: Target, isCurrency: true },
        { label: 'MRR', value: data.indicators.mrr, icon: RefreshCcw, isCurrency: true },
        { label: 'Churn %', value: data.indicators.churn_rate, icon: TrendingDown, isCurrency: false, isPercent: true },
        { label: 'Margem Contribuição', value: data.indicators.margem_contribuicao, icon: Percent, isCurrency: false, isPercent: true },
        { label: 'Break-even', value: data.indicators.break_even, icon: ArrowDownRight, isCurrency: true },
      ]
    : [];

  // ── DRE rows config ─────────────────────────────────────────────────────────

  const dreRows = data
    ? [
        { label: 'ROB', value: data.dre.rob, bold: true, isCurrency: true },
        { label: '(-) Churn', value: data.dre.churn, bold: false, isCurrency: true },
        { label: '(-) Deduções', value: data.dre.deducoes, bold: false, isCurrency: true },
        { label: '= ROL', value: data.dre.rol, bold: true, isCurrency: true },
        { label: '(-) Custos Variáveis', value: data.dre.custos_variaveis, bold: false, isCurrency: true },
        { label: '= Lucro Bruto', value: data.dre.lucro_bruto, bold: true, isCurrency: true },
        { label: 'Margem Contrib %', value: data.dre.margem_contribuicao, bold: false, isCurrency: false, isPercent: true },
        { label: '(-) Desp. Operacionais', value: data.dre.despesas_operacionais, bold: false, isCurrency: true },
        { label: '= EBITDA', value: data.dre.ebitda, bold: true, isCurrency: true },
        { label: 'Margem EBITDA %', value: data.dre.margem_ebitda, bold: false, isCurrency: false, isPercent: true },
        { label: '(-) Depreciação', value: data.dre.depreciacao, bold: false, isCurrency: true },
        { label: '(-) Desp. Financeiras', value: data.dre.despesas_financeiras, bold: false, isCurrency: true },
        { label: '= EBIT', value: data.dre.ebit, bold: true, isCurrency: true },
        { label: '(-) IR/CSLL', value: data.dre.ir_csll, bold: false, isCurrency: true },
        { label: '= Resultado Líquido', value: data.dre.resultado_liquido, bold: true, isCurrency: true },
      ]
    : [];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Dashboard Financeiro
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={goPrev}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Mês anterior"
          >
            <ChevronLeft className="w-5 h-5 text-gray-500" />
          </button>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[140px] text-center">
            {MONTH_NAMES[month - 1]} {year}
          </span>
          <button
            onClick={goNext}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Próximo mês"
          >
            <ChevronRight className="w-5 h-5 text-gray-500" />
          </button>
        </div>
      </div>

      {/* ─── Section 1: Indicadores ──────────────────────────────────────────── */}
      <section>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Indicadores
        </h3>
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {indicatorCards.map((card) => {
              const Icon = card.icon;
              const isNegative = card.value < 0;
              return (
                <div
                  key={card.label}
                  className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-100 dark:border-gray-700"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {card.label}
                    </span>
                    <div className="p-2 rounded-lg bg-accent-gold/10">
                      <Icon className="w-4 h-4 text-accent-gold" />
                    </div>
                  </div>
                  <Sensitive className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    <span className={isNegative ? 'text-red-500' : ''}>
                      {card.isCurrency
                        ? fmtCurrency(card.value)
                        : 'isPercent' in card && card.isPercent
                          ? fmtPercent(card.value)
                          : card.value}
                    </span>
                  </Sensitive>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── Section 2: DRE 12 Meses ────────────────────────────────────────── */}
      <section>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          DRE 12 Meses
        </h3>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-x-auto">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 15 }).map((_, i) => (
                <div key={i} className="h-4 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <table className="w-full table-premium">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3">Descrição</th>
                  <th className="text-right px-4 py-3">Planejado</th>
                  <th className="text-right px-4 py-3">Realizado</th>
                  <th className="text-right px-4 py-3">Evolução</th>
                </tr>
              </thead>
              <tbody>
                {dreRows.map((row) => {
                  const planejado = 0;
                  const realizado = row.value;
                  const evolucao = planejado > 0
                    ? ((realizado - planejado) / planejado) * 100
                    : 0;

                  return (
                    <tr
                      key={row.label}
                      className={
                        row.bold
                          ? 'bg-gray-50 dark:bg-gray-700/40 font-semibold'
                          : ''
                      }
                    >
                      <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">
                        {row.label}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-500 dark:text-gray-400">
                        <Sensitive>
                          {row.isCurrency
                            ? fmtCurrency(planejado)
                            : 'isPercent' in row && row.isPercent
                              ? fmtPercent(planejado)
                              : planejado}
                        </Sensitive>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-800 dark:text-gray-200">
                        <Sensitive>
                          <span className={realizado < 0 ? 'text-red-500' : ''}>
                            {row.isCurrency
                              ? fmtCurrency(realizado)
                              : 'isPercent' in row && row.isPercent
                                ? fmtPercent(realizado)
                                : realizado}
                          </span>
                        </Sensitive>
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        <Sensitive>
                          <span
                            className={
                              evolucao > 0
                                ? 'text-emerald-500'
                                : evolucao < 0
                                  ? 'text-red-500'
                                  : 'text-gray-400'
                            }
                          >
                            {evolucao !== 0 ? `${evolucao > 0 ? '+' : ''}${evolucao.toFixed(1)}%` : '—'}
                          </span>
                        </Sensitive>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ─── Section 3: Receita Recorrente ───────────────────────────────────── */}
      <section>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          <Users className="w-5 h-5 inline-block mr-2 text-accent-gold" />
          Receita Recorrente
        </h3>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-x-auto">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-4 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
              ))}
            </div>
          ) : !data?.customers.length ? (
            <div className="p-8 text-center text-gray-400">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="font-medium">Nenhum cliente ativo encontrado</p>
            </div>
          ) : (
            <table className="w-full table-premium">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3">Cliente</th>
                  <th className="text-right px-4 py-3">Ticket</th>
                  <th className="text-right px-4 py-3">Custos</th>
                  <th className="text-right px-4 py-3">Margem</th>
                  <th className="text-center px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.customers.map((customer) => (
                  <tr key={customer.id}>
                    <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">
                      <Sensitive>{customer.name}</Sensitive>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-800 dark:text-gray-200">
                      <Sensitive>{fmtCurrency(customer.ticket)}</Sensitive>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-800 dark:text-gray-200">
                      <Sensitive>{fmtCurrency(customer.costs)}</Sensitive>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <Sensitive>
                        <span className={customer.margin >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                          {fmtCurrency(customer.margin)}
                        </span>
                      </Sensitive>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {customer.is_active ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          Ativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          Inativo
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr className="bg-gray-50 dark:bg-gray-700/40 font-semibold">
                  <td className="px-4 py-3 text-sm text-gray-800 dark:text-gray-200">
                    Total ({data.customers.length} clientes)
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-800 dark:text-gray-200">
                    <Sensitive>
                      {fmtCurrency(data.customers.reduce((sum, c) => sum + c.ticket, 0))}
                    </Sensitive>
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-800 dark:text-gray-200">
                    <Sensitive>
                      {fmtCurrency(data.customers.reduce((sum, c) => sum + c.costs, 0))}
                    </Sensitive>
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <Sensitive>
                      <span className="text-emerald-500">
                        {fmtCurrency(data.customers.reduce((sum, c) => sum + c.margin, 0))}
                      </span>
                    </Sensitive>
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ─── Section 4: Resultado & Distribuição ─────────────────────────────── */}
      <section>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          <Wallet className="w-5 h-5 inline-block mr-2 text-accent-gold" />
          Resultado &amp; Distribuição
        </h3>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-6">
          {profitDistLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-4 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
              ))}
            </div>
          ) : profitDistError ? (
            <div className="text-center py-6">
              <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-amber-400" />
              <p className="text-sm text-gray-500 dark:text-gray-400">{profitDistError}</p>
            </div>
          ) : profitDist ? (
            <div className="space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-center gap-3 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                  <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30">
                    <PiggyBank className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Capital de Giro</p>
                    <Sensitive className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {fmtCurrency(profitDist.working_capital)}
                    </Sensitive>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/30">
                    <Shield className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Fundo de Reserva</p>
                    <Sensitive className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {fmtCurrency(profitDist.reserve_fund)}
                    </Sensitive>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 rounded-lg bg-gray-50 dark:bg-gray-700/30">
                  <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/30">
                    <Landmark className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Diretores (Total)</p>
                    <Sensitive className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {fmtCurrency(profitDist.directors_total)}
                    </Sensitive>
                  </div>
                </div>
              </div>

              {/* Partners breakdown */}
              {profitDist.partners.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Distribuição por Sócio
                  </p>
                  <div className="space-y-2">
                    {profitDist.partners.map((partner, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30"
                      >
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-accent-gold" />
                          <Sensitive className="text-sm text-gray-800 dark:text-gray-200">
                            {partner.name}
                          </Sensitive>
                          <span className="text-xs text-gray-400">
                            ({partner.share_pct}%)
                          </span>
                        </div>
                        <Sensitive className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {fmtCurrency(partner.value)}
                        </Sensitive>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Excess */}
              {profitDist.excess > 0 && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <span className="text-sm text-amber-700 dark:text-amber-300">
                    Excedente (acima do teto)
                  </span>
                  <Sensitive className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                    {fmtCurrency(profitDist.excess)}
                  </Sensitive>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
