'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, AlertTriangle, MessageSquare, BookOpen, BarChart2,
  X, Send, User, Columns3, ArrowUpRight, Link2,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { CardSkeleton } from '@/components/ui/Skeleton';
import FocusTrap from '@/components/ui/FocusTrap';
import { Sensitive } from '@/components/ui/Sensitive';
import { useDemoMode } from '@/components/ui/DemoContext';
import api, { ApiError } from '@/lib/api';

interface Ticket {
  id: number; number: string; title: string; description: string;
  customer: number | null; customer_name: string | null; priority: string; status: string;
  ticket_type: string; conclusao: string; contexto: string;
  project_tipo: string | null; assigned_to_name: string | null;
  sla_resolution_deadline: string | null; is_sla_breached: boolean;
  comments_count: number; created_at: string; contact_name: string;
  contact_email: string;
}

interface TicketComment {
  id: number; user_name: string; content: string; is_internal: boolean; created_at: string;
}

interface KBArticle {
  id: number; title: string; summary: string; status: string; is_public: boolean;
  views_count: number; helpful_count: number; category_name: string | null; created_at: string;
}

interface DashboardStats {
  total: number; aberto: number; triagem: number; analise: number;
  correcao: number; resolvido: number; fechado: number; sla_breached: number;
  by_priority: { priority: string; count: number }[];
}

interface CustomerOption { id: number; company_name: string; name: string; public_token?: string }

const priorityConfig: Record<string, { label: string; color: string; dot: string }> = {
  low: { label: 'Baixa', color: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300', dot: 'bg-gray-400' },
  medium: { label: 'Média', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  high: { label: 'Alta', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  critical: { label: 'Crítica', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
};

// v32 F6 (doc 05 §2): fluxo novo. Statuses legados são agrupados nas
// colunas equivalentes até a data migration realinhar tudo (F8 remove).
const STATUS_FLOW = ['aberto', 'triagem', 'analise', 'correcao', 'resolvido', 'fechado'] as const;

const LEGACY_STATUS_MAP: Record<string, string> = {
  open: 'aberto', in_progress: 'analise', pending_client: 'resolvido',
  resolved: 'resolvido', closed: 'fechado',
};

const statusConfig: Record<string, { label: string; color: string }> = {
  aberto: { label: 'Aberto', color: 'bg-blue-100 text-blue-700' },
  triagem: { label: 'Triagem', color: 'bg-cyan-100 text-cyan-700' },
  analise: { label: 'Análise', color: 'bg-yellow-100 text-yellow-700' },
  correcao: { label: 'Correção', color: 'bg-orange-100 text-orange-700' },
  resolvido: { label: 'Resolvido', color: 'bg-green-100 text-green-700' },
  fechado: { label: 'Fechado', color: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400' },
  // Legados (convivência de release)
  open: { label: 'Aberto (legado)', color: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'Em Atendimento (legado)', color: 'bg-yellow-100 text-yellow-700' },
  pending_client: { label: 'Aguardando Cliente (legado)', color: 'bg-purple-100 text-purple-700' },
  resolved: { label: 'Resolvido (legado)', color: 'bg-green-100 text-green-700' },
  closed: { label: 'Fechado (legado)', color: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400' },
};

const typeConfig: Record<string, string> = {
  bug: 'Bug', duvida: 'Dúvida', mudanca: 'Mudança',
  feature: 'Feature (legado)', question: 'Dúvida (legado)',
  performance: 'Performance (legado)', integration: 'Integração (legado)',
  other: 'Outro (legado)',
};

const conclusaoConfig: Record<string, { label: string; color: string }> = {
  garantia: { label: 'Garantia', color: 'bg-emerald-100 text-emerald-700' },
  orcamento: { label: 'Orçamento', color: 'bg-amber-100 text-amber-700' },
  inconclusivo: { label: 'Inconclusivo → Diretoria', color: 'bg-purple-100 text-purple-700' },
  recorrente_corrige: { label: 'Recorrente — Corrige', color: 'bg-teal-100 text-teal-700' },
};

const contextoConfig: Record<string, string> = {
  homologacao: 'Homologação', suporte: 'Suporte',
};

const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');
const formatDateTime = (d: string) => new Date(d).toLocaleString('pt-BR');

const boardColumn = (status: string) => LEGACY_STATUS_MAP[status] || status;

const EMPTY_TICKET_FORM = {
  title: '', description: '', ticket_type: 'bug', priority: 'medium',
  customer: '', contact_name: '', contact_email: '', tags: '', contexto: 'suporte',
};

export default function SuportePage() {
  const toast = useToast();
  const { isDemoMode } = useDemoMode();
  const [activeTab, setActiveTab] = useState('board');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [kbArticles, setKbArticles] = useState<KBArticle[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  // Modals
  const [showCreateTicket, setShowCreateTicket] = useState(false);
  const [ticketForm, setTicketForm] = useState({ ...EMPTY_TICKET_FORM });
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [ticketComments, setTicketComments] = useState<TicketComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);

  // KB
  const [showCreateKB, setShowCreateKB] = useState(false);
  const [kbForm, setKbForm] = useState({ title: '', summary: '', content: '', is_public: false });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page_size: '100' };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      if (filterPriority) params.priority = filterPriority;

      const [ticketsData, statsData, kbData, customersData] = await Promise.all([
        api.get<{ results?: Ticket[] }>('/support/tickets/', params).catch(() => ({ results: [] })),
        api.get<DashboardStats>('/support/tickets/dashboard/').catch(() => null),
        api.get<{ results?: KBArticle[] }>('/support/kb/', { page_size: '50' }).catch(() => ({ results: [] })),
        api.get<{ results?: CustomerOption[] }>('/sales/customers/', { page_size: '200' }).catch(() => ({ results: [] })),
      ]);

      setTickets(ticketsData.results || ticketsData as unknown as Ticket[]);
      if (statsData) setStats(statsData);
      setKbArticles(kbData.results || kbData as unknown as KBArticle[]);
      setCustomers(customersData.results || customersData as unknown as CustomerOption[]);
    } catch { toast.error('Erro ao carregar dados'); }
    finally { setLoading(false); }
  }, [search, filterStatus, filterPriority]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openTicketDetail = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    try {
      const d = await api.get<{ results?: TicketComment[] }>('/support/comments/', { ticket: String(ticket.id) });
      setTicketComments(d.results || d as unknown as TicketComment[]);
    } catch { /* silently fail */ }
  };

  const createTicket = async () => {
    if (!ticketForm.title.trim()) { toast.error('Título obrigatório'); return; }
    const body: Record<string, unknown> = { ...ticketForm };
    if (!body.customer) delete body.customer;
    if (ticketForm.tags) body.tags = ticketForm.tags.split(',').map((t: string) => t.trim());
    else body.tags = [];

    try {
      await api.post('/support/tickets/', body);
      toast.success('Chamado criado!'); setShowCreateTicket(false); setTicketForm({ ...EMPTY_TICKET_FORM }); fetchAll();
    } catch { toast.error('Erro ao criar chamado'); }
  };

  const addComment = async () => {
    if (!newComment.trim() || !selectedTicket) return;
    try {
      await api.post('/support/comments/', { ticket: selectedTicket.id, content: newComment, is_internal: isInternal });
      setNewComment('');
      const d = await api.get<{ results?: TicketComment[] }>('/support/comments/', { ticket: String(selectedTicket.id) });
      setTicketComments(d.results || d as unknown as TicketComment[]);
    } catch { /* silently fail */ }
  };

  const transitionTicket = async (status: string) => {
    if (!selectedTicket) return;
    try {
      const d = await api.post<Ticket>(`/support/tickets/${selectedTicket.id}/transition/`, { status });
      toast.success(`Movido para ${statusConfig[status]?.label || status}`);
      setSelectedTicket(d); fetchAll();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao mover chamado');
    }
  };

  const analyzeTicket = async (conclusao: string) => {
    if (!selectedTicket) return;
    try {
      const d = await api.post<Ticket & { conclusao_forcada?: boolean }>(
        `/support/tickets/${selectedTicket.id}/analyze/`, { conclusao },
      );
      if (d.conclusao_forcada) {
        toast.warning('Projeto recorrente: conclusão forçada para "Recorrente — Corrige"');
      } else {
        toast.success('Conclusão registrada');
      }
      setSelectedTicket(d); fetchAll();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao registrar conclusão');
    }
  };

  const updateContexto = async (contexto: string) => {
    if (!selectedTicket) return;
    try {
      const d = await api.patch<Ticket>(`/support/tickets/${selectedTicket.id}/`, { contexto });
      setSelectedTicket(d); fetchAll();
    } catch { toast.error('Erro ao atualizar contexto'); }
  };

  const createPedidoUpdate = async () => {
    if (!selectedTicket) return;
    try {
      await api.post(`/support/tickets/${selectedTicket.id}/pedido-update/`, {});
      toast.success('Pedido de update criado! O Comercial recebe na fila de promoção.');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao criar pedido de update');
    }
  };

  const copyPublicLink = async () => {
    if (!selectedTicket?.customer) { toast.error('Chamado sem cliente vinculado'); return; }
    const customer = customers.find(c => c.id === selectedTicket.customer);
    if (!customer?.public_token) { toast.error('Cliente sem token público'); return; }
    const link = `${window.location.origin}/chamado/${customer.public_token}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Link público copiado!');
    } catch { toast.error('Não foi possível copiar o link'); }
  };

  const tabs = [
    { key: 'board', label: 'Board', icon: Columns3 },
    { key: 'tickets', label: `Chamados (${tickets.length})`, icon: MessageSquare },
    { key: 'kb', label: 'Base de Conhecimento', icon: BookOpen },
    { key: 'dashboard', label: 'Dashboard', icon: BarChart2 },
  ];

  const ticketCard = (ticket: Ticket) => (
    <div key={ticket.id}
      onClick={() => openTicketDetail(ticket)}
      className="bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-200 dark:border-gray-700 hover:border-accent-gold/40 cursor-pointer transition-all">
      <div className="flex items-start gap-2">
        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${priorityConfig[ticket.priority]?.dot || 'bg-gray-300'}`} />
        <div className="flex-1 min-w-0">
          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">#<Sensitive>{ticket.number}</Sensitive></span>
          <p className="font-medium text-gray-800 dark:text-gray-100 text-sm leading-tight truncate"><Sensitive>{ticket.title}</Sensitive></p>
          {ticket.customer_name && <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5"><Sensitive>{ticket.customer_name}</Sensitive></p>}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              {typeConfig[ticket.ticket_type] || ticket.ticket_type}
            </span>
            {ticket.conclusao && (
              <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${conclusaoConfig[ticket.conclusao]?.color || 'bg-gray-100 text-gray-600'}`}>
                {conclusaoConfig[ticket.conclusao]?.label || ticket.conclusao}
              </span>
            )}
            {ticket.contexto === 'homologacao' && (
              <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-indigo-100 text-indigo-700">Homologação</span>
            )}
            {ticket.is_sla_breached && (
              <span className="flex items-center gap-0.5 text-[10px] text-red-500 font-medium">
                <AlertTriangle className="w-3 h-3" /> SLA
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Suporte</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">CRM de chamados, triagem e base de conhecimento</p>
        </div>
        {(activeTab === 'tickets' || activeTab === 'board') && (
          <button onClick={() => setShowCreateTicket(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-accent-gold text-white rounded-xl text-sm font-medium hover:bg-accent-gold-dark">
            <Plus className="w-4 h-4" /> Novo Chamado
          </button>
        )}
        {activeTab === 'kb' && (
          <button onClick={() => setShowCreateKB(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-accent-gold text-white rounded-xl text-sm font-medium hover:bg-accent-gold-dark">
            <Plus className="w-4 h-4" /> Novo Artigo
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white dark:bg-gray-800 rounded-xl p-1 shadow-sm border border-gray-200 dark:border-gray-700 w-fit">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key ? 'bg-accent-gold text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}>
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* BOARD TAB (v32 F6: colunas do fluxo novo) */}
      {activeTab === 'board' && (
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3 min-w-[1100px]">
            {STATUS_FLOW.map(col => {
              const colTickets = tickets.filter(t => boardColumn(t.status) === col);
              return (
                <div key={col} className="flex-1 min-w-[170px]">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${statusConfig[col].color}`}>
                      {statusConfig[col].label}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{colTickets.length}</span>
                  </div>
                  <div className="space-y-2 bg-gray-50 dark:bg-gray-800/40 rounded-xl p-2 min-h-[120px]">
                    {loading && <div className="h-20 bg-white dark:bg-gray-800 rounded-xl animate-pulse" />}
                    {!loading && colTickets.map(ticketCard)}
                    {!loading && colTickets.length === 0 && (
                      <p className="text-center text-xs text-gray-300 dark:text-gray-600 py-6">Vazio</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TICKETS TAB */}
      {activeTab === 'tickets' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <input className="pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm w-full outline-none focus:border-accent-gold"
                placeholder="Buscar chamados..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm outline-none"
              value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">Todos os status</option>
              {STATUS_FLOW.map(s => <option key={s} value={s}>{statusConfig[s].label}</option>)}
            </select>
            <select className="px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl text-sm outline-none"
              value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
              <option value="">Todas as prioridades</option>
              {Object.entries(priorityConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          {/* Ticket list */}
          <div className="space-y-2">
            {loading && (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 animate-pulse">
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full mt-2 bg-gray-200 flex-shrink-0" />
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="h-3 w-20 bg-gray-200 rounded" />
                        <div className="h-4 w-3/4 bg-gray-200 rounded" />
                      </div>
                      <div className="h-5 w-20 bg-gray-200 rounded-full" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loading && tickets.map(ticket => (
              <div key={ticket.id}
                onClick={() => openTicketDetail(ticket)}
                className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 hover:border-accent-gold/40 cursor-pointer transition-all">
                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${priorityConfig[ticket.priority]?.dot || 'bg-gray-300'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">#<Sensitive>{ticket.number}</Sensitive></span>
                        <h2 className="font-semibold text-gray-800 dark:text-gray-100 leading-tight text-base"><Sensitive>{ticket.title}</Sensitive></h2>
                        {ticket.customer_name && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"><Sensitive>{ticket.customer_name}</Sensitive></p>}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusConfig[ticket.status]?.color || 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                          {statusConfig[ticket.status]?.label || ticket.status}
                        </span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${priorityConfig[ticket.priority]?.color || 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                          {priorityConfig[ticket.priority]?.label || ticket.priority}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 dark:text-gray-500">
                      <span className="px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700">{typeConfig[ticket.ticket_type] || ticket.ticket_type}</span>
                      {ticket.assigned_to_name && <span className="flex items-center gap-1"><User className="w-3 h-3" /><Sensitive>{ticket.assigned_to_name}</Sensitive></span>}
                      <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{ticket.comments_count}</span>
                      <span>{formatDate(ticket.created_at)}</span>
                      {ticket.is_sla_breached && (
                        <span className="flex items-center gap-1 text-red-500 font-medium">
                          <AlertTriangle className="w-3 h-3" /> SLA violado
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {!loading && tickets.length === 0 && (
              <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl text-gray-400 dark:text-gray-500">
                Nenhum chamado encontrado.
              </div>
            )}
          </div>
        </div>
      )}

      {/* KB TAB */}
      {activeTab === 'kb' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {loading && Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700 animate-pulse space-y-3">
              <div className="h-5 w-3/4 bg-gray-200 rounded" />
              <div className="h-3 w-full bg-gray-100 dark:bg-gray-700 rounded" />
            </div>
          ))}
          {!loading && kbArticles.map(article => (
            <div key={article.id} className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex items-start justify-between mb-2">
                <h2 className="font-semibold text-gray-800 dark:text-gray-100 flex-1 pr-2 text-base"><Sensitive>{article.title}</Sensitive></h2>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <span className={`px-2 py-0.5 text-xs rounded-full ${article.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                    {article.status === 'published' ? 'Publicado' : 'Rascunho'}
                  </span>
                  {article.is_public && <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-600">Público</span>}
                </div>
              </div>
              {article.summary && <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{article.summary}</p>}
              <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
                {article.category_name && <span>{article.category_name}</span>}
                <span>{article.views_count} visualizações</span>
                <span>👍 {article.helpful_count}</span>
                <span>{formatDate(article.created_at)}</span>
              </div>
            </div>
          ))}
          {!loading && kbArticles.length === 0 && (
            <div className="col-span-2 text-center py-16 bg-white dark:bg-gray-800 rounded-xl text-gray-400 dark:text-gray-500">
              Nenhum artigo na base de conhecimento.
            </div>
          )}
        </div>
      )}

      {/* DASHBOARD TAB */}
      {activeTab === 'dashboard' && loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {Array.from({ length: 7 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      )}
      {activeTab === 'dashboard' && !loading && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {[
              { label: 'Total', value: stats.total, color: 'text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-700/50' },
              { label: 'Abertos', value: stats.aberto, color: 'text-blue-700 bg-blue-50' },
              { label: 'Triagem', value: stats.triagem, color: 'text-cyan-700 bg-cyan-50' },
              { label: 'Análise', value: stats.analise, color: 'text-yellow-700 bg-yellow-50' },
              { label: 'Correção', value: stats.correcao, color: 'text-orange-700 bg-orange-50' },
              { label: 'Resolvidos', value: stats.resolvido, color: 'text-green-700 bg-green-50' },
              { label: 'SLA Violado', value: stats.sla_breached, color: 'text-red-700 bg-red-50' },
            ].map(s => (
              <div key={s.label} className={`rounded-xl p-4 ${s.color}`}>
                <div className="text-2xl font-bold"><Sensitive>{s.value}</Sensitive></div>
                <div className="text-xs mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">Por Prioridade</h2>
            <div className="space-y-3">
              {stats.by_priority.map(bp => (
                <div key={bp.priority} className="flex items-center gap-3">
                  <span className={`px-2.5 py-0.5 text-xs rounded-full w-20 text-center ${priorityConfig[bp.priority]?.color || 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                    {priorityConfig[bp.priority]?.label || bp.priority}
                  </span>
                  <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                    <div className={`h-full rounded-full ${
                      bp.priority === 'critical' ? 'bg-red-500' :
                      bp.priority === 'high' ? 'bg-orange-500' :
                      bp.priority === 'medium' ? 'bg-blue-500' : 'bg-gray-400'
                    }`} style={{ width: `${stats.total ? (bp.count / stats.total) * 100 : 0}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 w-6"><Sensitive>{bp.count}</Sensitive></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Criar Chamado */}
      {showCreateTicket && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <FocusTrap onClose={() => setShowCreateTicket(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h2 className="font-semibold text-gray-800 dark:text-gray-100">Novo Chamado de Suporte</h2>
              <button onClick={() => setShowCreateTicket(false)} aria-label="Fechar"><X className="w-5 h-5 text-gray-400 dark:text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Título *</label>
                <input className="input-field mt-1" value={ticketForm.title}
                  onChange={e => setTicketForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Tipo (triagem)</label>
                  <select className="input-field mt-1" value={ticketForm.ticket_type}
                    onChange={e => setTicketForm(f => ({ ...f, ticket_type: e.target.value }))}>
                    {['bug', 'duvida', 'mudanca'].map(t => (
                      <option key={t} value={t}>{typeConfig[t]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Prioridade</label>
                  <select className="input-field mt-1" value={ticketForm.priority}
                    onChange={e => setTicketForm(f => ({ ...f, priority: e.target.value }))}>
                    {['low', 'medium', 'high', 'critical'].map(p => (
                      <option key={p} value={p}>{priorityConfig[p].label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Contexto</label>
                  <select className="input-field mt-1" value={ticketForm.contexto}
                    onChange={e => setTicketForm(f => ({ ...f, contexto: e.target.value }))}>
                    {Object.entries(contextoConfig).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Cliente</label>
                <select className="input-field mt-1" value={ticketForm.customer}
                  onChange={e => setTicketForm(f => ({ ...f, customer: e.target.value }))}>
                  <option value="">Sem cliente</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.company_name || c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Nome do Contato</label>
                  <input className={`input-field mt-1 ${isDemoMode ? 'sensitive-blur' : ''}`} value={ticketForm.contact_name}
                    onChange={e => setTicketForm(f => ({ ...f, contact_name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Email do Contato</label>
                  <input type="email" className={`input-field mt-1 ${isDemoMode ? 'sensitive-blur' : ''}`} value={ticketForm.contact_email}
                    onChange={e => setTicketForm(f => ({ ...f, contact_email: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Descrição *</label>
                <textarea rows={4} className={`input-field mt-1 ${isDemoMode ? 'sensitive-blur' : ''}`} value={ticketForm.description}
                  onChange={e => setTicketForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Tags (separadas por vírgula)</label>
                <input className="input-field mt-1" value={ticketForm.tags}
                  onChange={e => setTicketForm(f => ({ ...f, tags: e.target.value }))}
                  placeholder="login, pagamento, relatório..." />
              </div>
            </div>
            <div className="p-5 border-t flex justify-end gap-3">
              <button onClick={() => setShowCreateTicket(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancelar</button>
              <button onClick={createTicket} className="px-4 py-2 text-sm bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark">Criar Chamado</button>
            </div>
          </div>
          </FocusTrap>
        </div>
      )}

      {/* Drawer: Detalhe do Chamado */}
      {selectedTicket && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
          <FocusTrap onClose={() => setSelectedTicket(null)}>
          <div className="bg-white dark:bg-gray-800 w-full max-w-xl h-full shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <span className="text-xs font-mono text-gray-400 dark:text-gray-500">#<Sensitive>{selectedTicket.number}</Sensitive></span>
                <h2 className="font-semibold text-gray-800 dark:text-gray-100"><Sensitive>{selectedTicket.title}</Sensitive></h2>
              </div>
              <button onClick={() => setSelectedTicket(null)} aria-label="Fechar"><X className="w-5 h-5 text-gray-400 dark:text-gray-500" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Status badges */}
              <div className="flex gap-2 flex-wrap">
                <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${statusConfig[selectedTicket.status]?.color}`}>
                  {statusConfig[selectedTicket.status]?.label || selectedTicket.status}
                </span>
                <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${priorityConfig[selectedTicket.priority]?.color}`}>
                  {priorityConfig[selectedTicket.priority]?.label}
                </span>
                <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                  {typeConfig[selectedTicket.ticket_type] || selectedTicket.ticket_type}
                </span>
                {selectedTicket.conclusao && (
                  <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${conclusaoConfig[selectedTicket.conclusao]?.color}`}>
                    {conclusaoConfig[selectedTicket.conclusao]?.label || selectedTicket.conclusao}
                  </span>
                )}
                {selectedTicket.is_sla_breached && (
                  <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> SLA Violado
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="text-sm text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                <p><Sensitive>{selectedTicket.description}</Sensitive></p>
              </div>

              {/* Contexto (doc 05 §5) */}
              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Contexto</label>
                <select
                  className="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-lg outline-none"
                  value={selectedTicket.contexto}
                  onChange={e => updateContexto(e.target.value)}>
                  {Object.entries(contextoConfig).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                {selectedTicket.project_tipo && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Projeto: {selectedTicket.project_tipo === 'recorrente' ? 'Recorrente' : 'Fechado'}
                  </span>
                )}
              </div>

              {/* Mover no fluxo */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Mover para</h3>
                <div className="flex gap-1.5 flex-wrap">
                  {STATUS_FLOW.filter(s => s !== boardColumn(selectedTicket.status)).map(s => (
                    <button key={s} onClick={() => transitionTicket(s)}
                      className={`px-2.5 py-1 text-xs rounded-lg font-medium hover:opacity-80 ${statusConfig[s].color}`}>
                      {statusConfig[s].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conclusão da Análise (doc 05 §3/§4) */}
              {boardColumn(selectedTicket.status) === 'analise' && (
                <div className="border border-yellow-200 dark:border-yellow-900/50 bg-yellow-50/50 dark:bg-yellow-900/10 rounded-xl p-3">
                  <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase mb-1">Conclusão da Análise</h3>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2">
                    Projeto recorrente sempre corrige (contrato mensal). Inconclusivo escala para a Diretoria.
                  </p>
                  <div className="flex gap-1.5 flex-wrap">
                    {Object.entries(conclusaoConfig).map(([k, v]) => (
                      <button key={k} onClick={() => analyzeTicket(k)}
                        className={`px-2.5 py-1 text-xs rounded-lg font-medium hover:opacity-80 ${v.color}`}>
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Pedido de update (doc 05 §6) */}
              {(selectedTicket.ticket_type === 'mudanca' || selectedTicket.ticket_type === 'feature') && (
                <button onClick={createPedidoUpdate}
                  className="flex items-center gap-2 px-3 py-2 text-xs bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 font-medium">
                  <ArrowUpRight className="w-3.5 h-3.5" /> Virar pedido de update (Comercial)
                </button>
              )}

              {/* Link público */}
              {selectedTicket.customer && (
                <button onClick={copyPublicLink}
                  className="flex items-center gap-2 px-3 py-2 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 font-medium">
                  <Link2 className="w-3.5 h-3.5" /> Copiar link público do cliente
                </button>
              )}

              {/* Comments */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Comentários ({ticketComments.length})</h3>
                <div className="space-y-2">
                  {ticketComments.map(c => (
                    <div key={c.id} className={`p-3 rounded-lg text-sm ${c.is_internal ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50 dark:bg-gray-700/50'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-700 dark:text-gray-200"><Sensitive>{c.user_name}</Sensitive></span>
                        <div className="flex items-center gap-2">
                          {c.is_internal && <span className="text-xs text-yellow-600 font-medium">Interno</span>}
                          <span className="text-xs text-gray-400 dark:text-gray-500">{formatDateTime(c.created_at)}</span>
                        </div>
                      </div>
                      <p className="text-gray-600 dark:text-gray-300"><Sensitive>{c.content}</Sensitive></p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Comment input */}
            <div className="p-4 border-t">
              <div className="flex gap-2 mb-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
                  <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} />
                  Comentário interno
                </label>
              </div>
              <div className="flex gap-2">
                <textarea rows={2} className="flex-1 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm resize-none outline-none focus:border-accent-gold"
                  placeholder="Escreva um comentário..."
                  value={newComment} onChange={e => setNewComment(e.target.value)} />
                <button onClick={addComment} className="px-3 py-2 bg-accent-gold text-white rounded-xl hover:bg-accent-gold-dark" aria-label="Enviar">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          </FocusTrap>
        </div>
      )}

      {/* Modal: Criar artigo KB */}
      {showCreateKB && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <FocusTrap onClose={() => setShowCreateKB(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-gray-800 dark:text-gray-100">Novo Artigo</h2>
              <button onClick={() => setShowCreateKB(false)} aria-label="Fechar"><X className="w-5 h-5 text-gray-400 dark:text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Título *</label>
                <input className="input-field mt-1" value={kbForm.title}
                  onChange={e => setKbForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Resumo</label>
                <textarea rows={2} className="input-field mt-1" value={kbForm.summary}
                  onChange={e => setKbForm(f => ({ ...f, summary: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Conteúdo</label>
                <textarea rows={8} className="input-field mt-1 font-mono text-xs" value={kbForm.content}
                  onChange={e => setKbForm(f => ({ ...f, content: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={kbForm.is_public}
                  onChange={e => setKbForm(f => ({ ...f, is_public: e.target.checked }))} />
                Visível ao cliente
              </label>
            </div>
            <div className="p-5 border-t flex justify-end gap-3">
              <button onClick={() => setShowCreateKB(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancelar</button>
              <button onClick={async () => {
                if (!kbForm.title.trim()) { toast.error('Título obrigatório'); return; }
                try {
                  await api.post('/support/kb/', kbForm);
                  toast.success('Artigo criado!'); setShowCreateKB(false); setKbForm({ title: '', summary: '', content: '', is_public: false }); fetchAll();
                } catch { toast.error('Erro ao criar artigo'); }
              }} className="px-4 py-2 text-sm bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark">Criar Artigo</button>
            </div>
          </div>
          </FocusTrap>
        </div>
      )}
    </div>
  );
}
