'use client';

import { useEffect, useState } from 'react';
import { FolderKanban, CheckCircle, Clock, AlertTriangle, Headphones, Users } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import api from '@/lib/api';
import { Sensitive } from '@/components/ui/Sensitive';
import { CardSkeleton } from '@/components/ui/Skeleton';

const PIE_COLORS = ['#A6864A', '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#6B7280', '#EC4899'];

const projectStatusLabels: Record<string, string> = {
  planning: 'Planejamento', kickoff: 'Kickoff', requirements: 'Requisitos',
  development: 'Desenvolvimento', testing: 'Testes/QA', deployment: 'Implantação',
  completed: 'Concluído', on_hold: 'Em Espera',
};

export default function DashboardOperacional() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, active: 0, completed: 0 });
  const [statusData, setStatusData] = useState<{ name: string; value: number }[]>([]);
  const [tickets, setTickets] = useState({ open: 0, resolved: 0, total: 0 });

  useEffect(() => {
    const load = async () => {
      try {
        const [projData, projList, ticketData] = await Promise.all([
          api.get<Record<string, number>>('/projects/projects/dashboard/').catch(() => ({})),
          api.get<{ results?: { status: string }[] }>('/projects/projects/', { page_size: '500' }).catch(() => ({ results: [] })),
          api.get<{ results?: { status: string }[] }>('/support/tickets/', { page_size: '500' }).catch(() => ({ results: [] })),
        ]);

        const pd = projData as Record<string, number>;
        setStats({ total: pd.total_projects || 0, active: pd.active_projects || 0, completed: pd.completed_projects || 0 });

        // Project status distribution
        const projects = Array.isArray((projList as { results?: unknown[] }).results ?? projList)
          ? ((projList as { results?: { status: string }[] }).results ?? projList) as { status: string }[]
          : [];
        const grouped: Record<string, number> = {};
        projects.forEach(p => { grouped[p.status] = (grouped[p.status] || 0) + 1; });
        setStatusData(Object.entries(grouped).map(([s, v]) => ({ name: projectStatusLabels[s] || s, value: v })));

        // Support tickets
        const ticketList = Array.isArray((ticketData as { results?: unknown[] }).results ?? ticketData)
          ? ((ticketData as { results?: { status: string }[] }).results ?? ticketData) as { status: string }[]
          : [];
        const open = ticketList.filter(t => ['open', 'in_progress'].includes(t.status)).length;
        const resolved = ticketList.filter(t => ['resolved', 'closed'].includes(t.status)).length;
        setTickets({ open, resolved, total: ticketList.length });
      } catch { /* silent */ }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const slaRate = tickets.total > 0 ? Math.round((tickets.resolved / tickets.total) * 100) : 0;

  const cards = [
    { label: 'Projetos Ativos', value: stats.active, icon: FolderKanban, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/30' },
    { label: 'Concluídos', value: stats.completed, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/30' },
    { label: 'Taxa Conclusão', value: `${completionRate}%`, icon: Clock, color: 'text-accent-gold', bg: 'bg-amber-50 dark:bg-amber-900/30' },
    { label: 'Total Projetos', value: stats.total, icon: FolderKanban, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/30' },
    { label: 'Tickets Abertos', value: tickets.open, icon: Headphones, color: tickets.open > 0 ? 'text-red-500' : 'text-green-600', bg: tickets.open > 0 ? 'bg-red-50 dark:bg-red-900/30' : 'bg-green-50 dark:bg-green-900/30' },
    { label: 'Tickets Resolvidos', value: tickets.resolved, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/30' },
    { label: 'SLA Compliance', value: `${slaRate}%`, icon: AlertTriangle, color: slaRate >= 80 ? 'text-green-600' : 'text-red-500', bg: slaRate >= 80 ? 'bg-green-50 dark:bg-green-900/30' : 'bg-red-50 dark:bg-red-900/30' },
    { label: 'Total Tickets', value: tickets.total, icon: Users, color: 'text-gray-500', bg: 'bg-gray-50 dark:bg-gray-700/30' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard Operacional</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Visão executiva de entregas — projetos, suporte e SLA</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {loading ? Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />) : cards.map(c => (
          <div key={c.label} className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-100 dark:border-gray-700">
            <div className={`w-10 h-10 ${c.bg} rounded-lg flex items-center justify-center mb-3`}>
              <c.icon className={`w-5 h-5 ${c.color}`} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{c.label}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1"><Sensitive>{c.value}</Sensitive></p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Projetos por Fase</h3>
          {statusData.length === 0 ? <p className="text-sm text-gray-400 py-8 text-center">Sem dados</p> : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>
                  {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Progresso Geral</h3>
          <div className="space-y-4 py-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-500">Projetos Concluídos</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{stats.completed}/{stats.total}</span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-3">
                <div className="h-3 rounded-full bg-accent-gold transition-all" style={{ width: `${completionRate}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-500">Tickets Resolvidos</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{tickets.resolved}/{tickets.total}</span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-3">
                <div className="h-3 rounded-full bg-green-500 transition-all" style={{ width: `${slaRate}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
