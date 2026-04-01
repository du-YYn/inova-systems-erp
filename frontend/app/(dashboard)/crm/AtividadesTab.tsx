'use client';

import { useEffect, useState, useCallback } from 'react';
import { Phone, Mail, Video, MessageCircle, Monitor, Linkedin, MoreHorizontal, Clock, Search, UserPlus, CheckCircle, XCircle, Calendar, FileText, TrendingUp, TrendingDown, RefreshCw, Briefcase } from 'lucide-react';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';
import { Sensitive } from '@/components/ui/Sensitive';
import api from '@/lib/api';

interface Activity {
  id: number;
  prospect: number;
  prospect_name: string;
  activity_type: string;
  subject: string;
  description: string;
  outcome: string;
  next_action: string;
  next_action_date: string | null;
  duration_minutes: number;
  date: string;
  created_by_name: string;
}

const PAGE_SIZE = 20;

const activityIcons: Record<string, React.ElementType> = {
  call: Phone, email: Mail, meeting: Video, whatsapp: MessageCircle,
  demo: Monitor, linkedin: Linkedin, other: MoreHorizontal,
  lead_created: UserPlus, status_changed: RefreshCw,
  qualified: CheckCircle, disqualified: XCircle,
  meeting_scheduled: Calendar, no_show: XCircle, meeting_done: Video,
  proposal_created: FileText, proposal_sent: FileText,
  proposal_approved: TrendingUp, proposal_rejected: TrendingDown,
  won: TrendingUp, lost: TrendingDown, follow_up: RefreshCw,
  contract_created: Briefcase,
};

const activityColors: Record<string, string> = {
  call: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600',
  email: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600',
  meeting: 'bg-green-50 dark:bg-green-900/30 text-green-600',
  whatsapp: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600',
  demo: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600',
  linkedin: 'bg-sky-50 dark:bg-sky-900/30 text-sky-600',
  lead_created: 'bg-accent-gold/10 text-accent-gold',
  status_changed: 'bg-gray-100 dark:bg-gray-700 text-gray-500',
  qualified: 'bg-green-50 dark:bg-green-900/30 text-green-600',
  disqualified: 'bg-red-50 dark:bg-red-900/30 text-red-500',
  meeting_scheduled: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600',
  no_show: 'bg-red-50 dark:bg-red-900/30 text-red-500',
  meeting_done: 'bg-green-50 dark:bg-green-900/30 text-green-600',
  proposal_created: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600',
  proposal_sent: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600',
  proposal_approved: 'bg-green-50 dark:bg-green-900/30 text-green-600',
  proposal_rejected: 'bg-red-50 dark:bg-red-900/30 text-red-500',
  won: 'bg-green-50 dark:bg-green-900/30 text-green-600',
  lost: 'bg-red-50 dark:bg-red-900/30 text-red-500',
  follow_up: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600',
  contract_created: 'bg-accent-gold/10 text-accent-gold',
  other: 'bg-gray-50 dark:bg-gray-700/50 text-gray-500',
};

const activityLabels: Record<string, string> = {
  call: 'Ligação', email: 'E-mail', meeting: 'Reunião', whatsapp: 'WhatsApp',
  demo: 'Demonstração', linkedin: 'LinkedIn', other: 'Outro',
  lead_created: 'Lead Recebido', status_changed: 'Status Alterado',
  qualified: 'Qualificado', disqualified: 'Não Qualificado',
  meeting_scheduled: 'Reunião Agendada', no_show: 'Não Compareceu',
  meeting_done: 'Reunião Realizada', proposal_created: 'Proposta Criada',
  proposal_sent: 'Proposta Enviada', proposal_approved: 'Proposta Aprovada',
  proposal_rejected: 'Proposta Rejeitada', won: 'Lead Fechado',
  lost: 'Lead Perdido', follow_up: 'Follow-up', contract_created: 'Contrato Criado',
};

const formatDateTime = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch { return iso; }
};

const formatDateGroup = (iso: string) => {
  try {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Hoje';
    if (d.toDateString() === yesterday.toDateString()) return 'Ontem';
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
  } catch { return iso; }
};

export default function AtividadesTab() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), page_size: String(PAGE_SIZE) };
      if (search) params.search = search;
      if (filterType) params.activity_type = filterType;
      const data = await api.get<{ results?: Activity[]; count?: number }>('/sales/prospect-activities/', params);
      setActivities(Array.isArray(data.results ?? data) ? (data.results ?? data) as Activity[] : []);
      setTotal(data.count ?? 0);
    } catch (err) {
      console.error('[Histórico] error:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, filterType]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);
  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Group by date
  const grouped: { date: string; label: string; items: Activity[] }[] = [];
  activities.forEach(a => {
    const dateKey = new Date(a.date).toDateString();
    const last = grouped[grouped.length - 1];
    if (last && last.date === dateKey) {
      last.items.push(a);
    } else {
      grouped.push({ date: dateKey, label: formatDateGroup(a.date), items: [a] });
    }
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Buscar atividade ou lead..." value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
          </div>
          <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
            <option value="">Todos os tipos</option>
            {Object.entries(activityLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">{total} registros</p>
      </div>

      <div className="space-y-6">
        {loading ? (
          <div className="card p-4"><TableSkeleton rows={8} cols={3} /></div>
        ) : activities.length === 0 ? (
          <div className="card p-16 text-center">
            <Clock className="w-14 h-14 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Nenhum registro encontrado</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">O histórico é preenchido automaticamente conforme ações no CRM</p>
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.date}>
              <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2 px-1">{group.label}</p>
              <div className="card overflow-hidden divide-y divide-gray-50 dark:divide-gray-700/50">
                {group.items.map(activity => {
                  const Icon = activityIcons[activity.activity_type] || MoreHorizontal;
                  const colorCls = activityColors[activity.activity_type] || activityColors.other;
                  return (
                    <div key={activity.id} className="flex items-start gap-3 px-4 py-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${colorCls}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{activity.subject}</span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colorCls}`}>
                            {activityLabels[activity.activity_type] || activity.activity_type}
                          </span>
                        </div>
                        {activity.prospect_name && (
                          <p className="text-[10px] text-accent-gold font-medium mt-0.5"><Sensitive>{activity.prospect_name}</Sensitive></p>
                        )}
                        {activity.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2"><Sensitive>{activity.description}</Sensitive></p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">{formatDateTime(activity.date)}</p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5"><Sensitive>{activity.created_by_name}</Sensitive></p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {!loading && totalPages > 1 && (
        <div className="mt-4"><Pagination page={page} totalPages={totalPages} totalItems={total} pageSize={PAGE_SIZE} onChange={setPage} /></div>
      )}
    </div>
  );
}
