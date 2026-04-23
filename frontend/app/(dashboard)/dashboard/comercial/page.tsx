'use client';

import { useEffect, useState } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Users, Target, FileText, Briefcase,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts';
import api from '@/lib/api';
import { Sensitive } from '@/components/ui/Sensitive';
import { CardSkeleton } from '@/components/ui/Skeleton';

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtShort = (v: number) => { if (v >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`; if (v >= 1000) return `R$${(v / 1000).toFixed(0)}k`; return `R$${v.toFixed(0)}`; };

const statusLabels: Record<string, string> = {
  new: 'Novo', qualifying: 'Qualificação', qualified: 'Qualificado',
  scheduled: 'Agendado', pre_meeting: 'Pré-Reunião', meeting_done: 'Reunião',
  proposal: 'Proposta', won: 'Fechado', lost: 'Perdido', follow_up: 'Follow-up',
};

const PIE_COLORS = ['#A6864A', '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444'];

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-card-deep p-3 text-xs">
      {label && <p className="text-gray-400 font-medium mb-2">{label}</p>}
      {payload.map(e => (
        <div key={e.name} className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: e.color }} /><span className="text-gray-500">{e.name}</span></div>
          <span className="font-bold text-gray-900 dark:text-gray-100">{typeof e.value === 'number' && e.value > 999 ? fmt(e.value) : e.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardComercial() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ mrr: 0, active_contracts: 0, expiring_contracts: 0, proposals_sent: 0, proposals_value: 0, proposals_approved: 0, proposals_approved_value: 0 });
  const [pipeline, setPipeline] = useState<{ label: string; count: number; value: number }[]>([]);
  const [contractStatus, setContractStatus] = useState<{ name: string; value: number }[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const [contracts, proposals, prospects] = await Promise.all([
          api.get<Record<string, number>>('/sales/contracts/dashboard/').catch(() => ({})),
          api.get<Record<string, number>>('/sales/proposals/dashboard/').catch(() => ({})),
          api.get<{ results?: { status: string; estimated_value: number }[] }>('/sales/prospects/', { page_size: '500' }).catch(() => ({ results: [] })),
        ]);

        setStats({
          mrr: (contracts as Record<string, number>).mrr || 0,
          active_contracts: (contracts as Record<string, number>).active_contracts || 0,
          expiring_contracts: (contracts as Record<string, number>).expiring_contracts || 0,
          proposals_sent: (proposals as Record<string, number>).sent_count || 0,
          proposals_value: (proposals as Record<string, number>).sent_value || 0,
          proposals_approved: (proposals as Record<string, number>).approved_count || 0,
          proposals_approved_value: (proposals as Record<string, number>).approved_value || 0,
        });

        // Pipeline
        const prospectList = Array.isArray((prospects as { results?: unknown[] }).results ?? prospects) ? ((prospects as { results?: { status: string; estimated_value: number }[] }).results ?? prospects) as { status: string; estimated_value: number }[] : [];
        const grouped: Record<string, { count: number; value: number }> = {};
        prospectList.forEach(p => {
          if (!grouped[p.status]) grouped[p.status] = { count: 0, value: 0 };
          grouped[p.status].count++;
          grouped[p.status].value += p.estimated_value || 0;
        });
        setPipeline(Object.entries(grouped).map(([s, d]) => ({ label: statusLabels[s] || s, count: d.count, value: d.value })));

        // Contract status for pie
        const total = (contracts as Record<string, number>).total_contracts || 0;
        const active = (contracts as Record<string, number>).active_contracts || 0;
        const expiring = (contracts as Record<string, number>).expiring_contracts || 0;
        if (total > 0) setContractStatus([
          { name: 'Ativos', value: active - expiring },
          { name: 'Expirando', value: expiring },
          { name: 'Outros', value: total - active },
        ].filter(i => i.value > 0));
      } catch { /* silent */ }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const winRate = pipeline.length > 0 ? Math.round(((pipeline.find(p => p.label === 'Fechado')?.count || 0) / pipeline.reduce((s, p) => s + p.count, 0)) * 100) : 0;
  const totalLeads = pipeline.reduce((s, p) => s + p.count, 0);
  const pipelineValue = pipeline.reduce((s, p) => s + p.value, 0);
  const avgTicket = stats.active_contracts > 0 ? stats.mrr / stats.active_contracts : 0;
  const approvalRate = stats.proposals_sent > 0 ? Math.round((stats.proposals_approved / stats.proposals_sent) * 100) : 0;

  const cards: { label: string; value: string | number; sub?: string; icon: React.ElementType; color: string; bg: string }[] = [
    { label: 'MRR', value: fmt(stats.mrr), icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/30', sub: `${stats.active_contracts} contratos ativos` },
    { label: 'Pipeline (Valor)', value: fmt(pipelineValue), icon: Target, color: 'text-accent-gold', bg: 'bg-amber-50 dark:bg-amber-900/30', sub: `${totalLeads} leads no funil` },
    { label: 'Propostas em Aberto', value: fmt(stats.proposals_value), icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/30', sub: `${stats.proposals_sent} proposta${stats.proposals_sent !== 1 ? 's' : ''} enviada${stats.proposals_sent !== 1 ? 's' : ''}` },
    { label: 'Propostas Aprovadas', value: fmt(stats.proposals_approved_value), icon: ArrowUpRight, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/30', sub: `${stats.proposals_approved} aprovada${stats.proposals_approved !== 1 ? 's' : ''} (${approvalRate}%)` },
    { label: 'Taxa Conversão', value: `${winRate}%`, icon: Target, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/30', sub: 'Leads fechados / total' },
    { label: 'Ticket Médio', value: fmt(avgTicket), icon: TrendingUp, color: 'text-accent-gold', bg: 'bg-amber-50 dark:bg-amber-900/30', sub: 'MRR / contratos' },
    { label: 'Contratos Ativos', value: stats.active_contracts, icon: Briefcase, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/30', sub: stats.expiring_contracts > 0 ? `${stats.expiring_contracts} expirando em 30d` : 'Nenhum expirando' },
    { label: 'Expirando (30d)', value: stats.expiring_contracts, icon: stats.expiring_contracts > 0 ? ArrowDownRight : TrendingDown, color: stats.expiring_contracts > 0 ? 'text-red-500' : 'text-gray-400', bg: stats.expiring_contracts > 0 ? 'bg-red-50 dark:bg-red-900/30' : 'bg-gray-50 dark:bg-gray-700/30' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard Comercial</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Visão executiva de vendas — pipeline, propostas e contratos</p>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {loading ? Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />) : cards.map(c => (
          <div key={c.label} className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-100 dark:border-gray-700">
            <div className={`w-10 h-10 ${c.bg} rounded-lg flex items-center justify-center mb-3`}>
              <c.icon className={`w-5 h-5 ${c.color}`} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{c.label}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1"><Sensitive>{c.value}</Sensitive></p>
            {c.sub && <p className="text-[10px] text-gray-400 mt-1">{c.sub}</p>}
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Pipeline */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Pipeline de Prospecção</h3>
          {pipeline.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">Sem dados</p> : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={pipeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(156,163,175,0.15)" />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 9 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} tickFormatter={v => fmtShort(v)} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar yAxisId="left" dataKey="count" name="Leads" fill="#A6864A" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="value" name="Valor" fill="#3B82F6" radius={[4, 4, 0, 0]} opacity={0.4} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-4 mt-2 text-[10px] text-gray-400">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-accent-gold" /> Leads</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-blue-500 opacity-40" /> Valor</span>
              </div>
            </>
          )}
        </div>

        {/* Contratos */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Contratos por Status</h3>
          {contractStatus.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">Sem dados</p> : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={contractStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                  {contractStatus.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
