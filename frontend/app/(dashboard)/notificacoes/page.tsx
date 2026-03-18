'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Bell,
  CheckSquare,
  AlertCircle,
  Clock,
  ThumbsUp,
  Flag,
  FileText,
  GitBranch,
  Package,
  CheckCheck,
  ChevronDown,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Notification {
  id: number;
  notification_type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface ApiResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Notification[];
}

type FilterTab = 'all' | 'unread' | 'read';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ontem';
  return `há ${days} dias`;
}

interface IconConfig {
  icon: React.ElementType;
  colorClass: string;
  bgClass: string;
}

function getIconConfig(type: string): IconConfig {
  switch (type) {
    case 'task_due':
    case 'task_assigned':
      return { icon: CheckSquare, colorClass: 'text-blue-600', bgClass: 'bg-blue-100' };
    case 'invoice_overdue':
      return { icon: AlertCircle, colorClass: 'text-red-600', bgClass: 'bg-red-100' };
    case 'sla_warning':
    case 'sla_breached':
      return { icon: Clock, colorClass: 'text-orange-600', bgClass: 'bg-orange-100' };
    case 'proposal_approved':
      return { icon: ThumbsUp, colorClass: 'text-green-600', bgClass: 'bg-green-100' };
    case 'milestone_completed':
      return { icon: Flag, colorClass: 'text-green-600', bgClass: 'bg-green-100' };
    case 'contract_expiring':
      return { icon: FileText, colorClass: 'text-yellow-600', bgClass: 'bg-yellow-100' };
    case 'change_request':
      return { icon: GitBranch, colorClass: 'text-purple-600', bgClass: 'bg-purple-100' };
    case 'delivery_approval':
      return { icon: Package, colorClass: 'text-blue-600', bgClass: 'bg-blue-100' };
    default:
      return { icon: Bell, colorClass: 'text-gray-500', bgClass: 'bg-gray-100' };
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NotificacoesPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const fetchNotifications = useCallback(async (pageNum: number, replace: boolean) => {
    if (replace) setLoading(true);
    else setLoadingMore(true);

    try {
      const res = await fetch(
        `${apiUrl}/notifications/notifications/?page=${pageNum}&page_size=${PAGE_SIZE}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('Erro ao buscar notificações');
      const data: ApiResponse = await res.json();
      setTotalCount(data.count);
      setNotifications((prev) => (replace ? data.results : [...prev, ...data.results]));
    } catch {
      // silently fail — keep previous state
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications(1, true);
    setPage(1);
  }, [fetchNotifications]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchNotifications(nextPage, false);
  };

  const handleMarkRead = async (notification: Notification) => {
    if (notification.is_read) return;
    try {
      const res = await fetch(
        `${apiUrl}/notifications/notifications/${notification.id}/mark_read/`,
        { method: 'PATCH', credentials: 'include' }
      );
      if (!res.ok) throw new Error();
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
      );
    } catch {
      // silently fail
    }
  };

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      const res = await fetch(`${apiUrl}/notifications/notifications/mark_all_read/`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // silently fail
    } finally {
      setMarkingAll(false);
    }
  };

  // ─── Filtering ──────────────────────────────────────────────────────────────

  const filtered = notifications.filter((n) => {
    if (activeTab === 'unread') return !n.is_read;
    if (activeTab === 'read') return n.is_read;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const hasMore = notifications.length < totalCount;

  // ─── Tabs ───────────────────────────────────────────────────────────────────

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'Todas' },
    { key: 'unread', label: 'Não lidas' },
    { key: 'read', label: 'Lidas' },
  ];

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notificações</h1>
          <p className="mt-1 text-sm text-gray-500">
            Central de alertas e avisos do sistema
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={markingAll}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
          >
            <CheckCheck size={16} className="text-gray-500" />
            {markingAll ? 'Marcando…' : 'Marcar todas como lidas'}
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.key === 'unread' && unreadCount > 0 && (
              <span className="ml-0.5 rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white leading-none">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Notification list */}
      <div className="card divide-y divide-gray-100">
        {loading ? (
          <div className="flex flex-col gap-4 p-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-start gap-4 animate-pulse">
                <div className="h-10 w-10 rounded-full bg-gray-200 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 rounded bg-gray-200" />
                  <div className="h-3 w-2/3 rounded bg-gray-100" />
                </div>
                <div className="h-3 w-16 rounded bg-gray-100 shrink-0" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
            <Bell size={40} strokeWidth={1.5} />
            <p className="text-sm font-medium">
              {activeTab === 'unread'
                ? 'Nenhuma notificação não lida'
                : activeTab === 'read'
                ? 'Nenhuma notificação lida'
                : 'Nenhuma notificação encontrada'}
            </p>
          </div>
        ) : (
          filtered.map((notification) => {
            const { icon: Icon, colorClass, bgClass } = getIconConfig(
              notification.notification_type
            );
            return (
              <button
                key={notification.id}
                onClick={() => handleMarkRead(notification)}
                className={`flex w-full items-start gap-4 px-6 py-4 text-left transition hover:bg-gray-50 ${
                  !notification.is_read ? 'bg-blue-50/30' : ''
                }`}
              >
                {/* Icon */}
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${bgClass}`}
                >
                  <Icon size={18} className={colorClass} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 leading-snug">
                    {notification.title}
                  </p>
                  <p className="mt-0.5 text-sm text-gray-500 leading-relaxed">
                    {notification.message}
                  </p>
                </div>

                {/* Right side: time + unread dot */}
                <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {relativeTime(notification.created_at)}
                  </span>
                  {!notification.is_read && (
                    <span className="inline-block h-2 w-2 rounded-full bg-blue-600" />
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Load more */}
      {!loading && hasMore && (
        <div className="flex justify-center">
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
          >
            <ChevronDown size={16} className="text-gray-500" />
            {loadingMore ? 'Carregando…' : 'Carregar mais'}
          </button>
        </div>
      )}
    </div>
  );
}
