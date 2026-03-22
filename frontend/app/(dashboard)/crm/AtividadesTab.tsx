'use client';

import { useEffect, useState, useCallback } from 'react';
import { Phone, Mail, Video, MessageCircle, Monitor, Linkedin, MoreHorizontal, Clock } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';
import api from '@/lib/api';

interface Activity {
  id: number;
  prospect: number;
  activity_type: string;
  subject: string;
  description: string;
  outcome: string;
  next_action: string;
  next_action_date: string | null;
  duration_minutes: number;
  date: string;
  created_by_name: string;
  created_at: string;
}

const PAGE_SIZE = 15;

const activityIcons: Record<string, React.ElementType> = {
  call: Phone,
  email: Mail,
  meeting: Video,
  whatsapp: MessageCircle,
  demo: Monitor,
  linkedin: Linkedin,
  other: MoreHorizontal,
};

const activityColors: Record<string, string> = {
  call: 'bg-blue-50 text-blue-600',
  email: 'bg-purple-50 text-purple-600',
  meeting: 'bg-green-50 text-green-600',
  whatsapp: 'bg-emerald-50 text-emerald-600',
  demo: 'bg-indigo-50 text-indigo-600',
  linkedin: 'bg-sky-50 text-sky-600',
  other: 'bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300',
};

const activityLabels: Record<string, string> = {
  call: 'Ligação',
  email: 'E-mail',
  meeting: 'Reunião',
  whatsapp: 'WhatsApp',
  demo: 'Demonstração',
  linkedin: 'LinkedIn',
  other: 'Outro',
};

const formatDate = (iso: string) => {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).format(d);
  } catch { return iso; }
};

const formatDuration = (mins: number) => {
  if (!mins) return '';
  if (mins < 60) return `${mins}min`;
  return `${Math.floor(mins / 60)}h${mins % 60 > 0 ? `${mins % 60}min` : ''}`;
};

export default function AtividadesTab() {
  const toast = useToast();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ results?: Activity[]; count?: number }>('/sales/prospect-activities/', {
        page: String(page),
        page_size: String(PAGE_SIZE),
      });
      setActivities(Array.isArray(data.results ?? data) ? (data.results ?? data) as Activity[] : []);
      setTotal(data.count ?? (data.results ?? data as unknown as Activity[]).length);
    } catch {
      toast.error('Erro ao carregar atividades.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div />
        <p className="text-xs text-gray-400 dark:text-gray-500">{total} atividades registradas</p>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-4"><TableSkeleton rows={8} cols={4} /></div>
        ) : activities.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-14 h-14 bg-gray-50 dark:bg-gray-700/50 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Clock className="w-7 h-7 text-gray-300" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Nenhuma atividade registrada</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">As atividades aparecem aqui quando registradas no funil</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {activities.map(activity => {
              const Icon = activityIcons[activity.activity_type] || MoreHorizontal;
              const colorCls = activityColors[activity.activity_type] || activityColors.other;

              return (
                <div key={activity.id} className="flex items-start gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50/60 transition-colors">
                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${colorCls}`}>
                    <Icon className="w-4 h-4" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{activity.subject}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colorCls}`}>
                        {activityLabels[activity.activity_type] || activity.activity_type}
                      </span>
                      {activity.duration_minutes > 0 && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {formatDuration(activity.duration_minutes)}
                        </span>
                      )}
                    </div>
                    {activity.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{activity.description}</p>
                    )}
                    {activity.outcome && (
                      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                        <span className="font-medium">Resultado:</span> {activity.outcome}
                      </p>
                    )}
                    {activity.next_action && (
                      <p className="text-xs text-accent-gold mt-1 font-medium">
                        Próximo: {activity.next_action}
                        {activity.next_action_date && ` (${new Date(activity.next_action_date + 'T00:00:00').toLocaleDateString('pt-BR')})`}
                      </p>
                    )}
                  </div>

                  {/* Meta */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">{formatDate(activity.date)}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{activity.created_by_name}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!loading && totalPages > 1 && (
        <div className="mt-4">
          <Pagination page={page} totalPages={totalPages} totalItems={total} pageSize={PAGE_SIZE} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
