'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, Filter, Tag, Clock, AlertTriangle,
  CheckCircle2, MessageSquare, BookOpen, BarChart2,
  X, ChevronDown, Send, User
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface Ticket {
  id: number; number: string; title: string; description: string;
  customer_name: string | null; priority: string; status: string;
  ticket_type: string; assigned_to_name: string | null;
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
  total: number; open: number; in_progress: number; pending_client: number;
  resolved: number; sla_breached: number;
  by_priority: { priority: string; count: number }[];
}

const priorityConfig: Record<string, { label: string; color: string; dot: string }> = {
  low: { label: 'Baixa', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
  medium: { label: 'Média', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  high: { label: 'Alta', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  critical: { label: 'Crítica', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  open: { label: 'Aberto', color: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'Em Atendimento', color: 'bg-yellow-100 text-yellow-700' },
  pending_client: { label: 'Aguardando Cliente', color: 'bg-purple-100 text-purple-700' },
  resolved: { label: 'Resolvido', color: 'bg-green-100 text-green-700' },
  closed: { label: 'Fechado', color: 'bg-gray-100 text-gray-500' },
};

const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR');
const formatDateTime = (d: string) => new Date(d).toLocaleString('pt-BR');

const EMPTY_TICKET_FORM = {
  title: '', description: '', ticket_type: 'bug', priority: 'medium',
  customer: '', contact_name: '', contact_email: '', tags: '',
};

export default function SuportePage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('tickets');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [kbArticles, setKbArticles] = useState<KBArticle[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [customers, setCustomers] = useState<{ id: number; company_name: string; name: string }[]>([]);
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
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterStatus) params.set('status', filterStatus);
      if (filterPriority) params.set('priority', filterPriority);

      const [ticketsRes, statsRes, kbRes, customersRes] = await Promise.all([
        fetch(`${API}/support/tickets/?${params}&page_size=50`, { credentials: 'include' }),
        fetch(`${API}/support/tickets/dashboard/`, { credentials: 'include' }),
        fetch(`${API}/support/kb/?page_size=50`, { credentials: 'include' }),
        fetch(`${API}/sales/customers/?page_size=200`, { credentials: 'include' }),
      ]);

      if (ticketsRes.ok) { const d = await ticketsRes.json(); setTickets(d.results || d); }
      if (statsRes.ok) setStats(await statsRes.json());
      if (kbRes.ok) { const d = await kbRes.json(); setKbArticles(d.results || d); }
      if (customersRes.ok) { const d = await customersRes.json(); setCustomers(d.results || d); }
    } catch { toast.error('Erro ao carregar dados'); }
    finally { setLoading(false); }
  }, [search, filterStatus, filterPriority]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openTicketDetail = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    const res = await fetch(`${API}/support/comments/?ticket=${ticket.id}`, { credentials: 'include' });
    if (res.ok) { const d = await res.json(); setTicketComments(d.results || d); }
  };

  const createTicket = async () => {
    if (!ticketForm.title.trim()) { toast.error('Título obrigatório'); return; }
    const body: Record<string, unknown> = { ...ticketForm };
    if (!body.customer) delete body.customer;
    if (ticketForm.tags) body.tags = ticketForm.tags.split(',').map((t: string) => t.trim());
    else body.tags = [];

    const res = await fetch(`${API}/support/tickets/`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) { toast.success('Ticket criado!'); setShowCreateTicket(false); setTicketForm({ ...EMPTY_TICKET_FORM }); fetchAll(); }
    else toast.error('Erro ao criar ticket');
  };

  const addComment = async () => {
    if (!newComment.trim() || !selectedTicket) return;
    const res = await fetch(`${API}/support/comments/`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: selectedTicket.id, content: newComment, is_internal: isInternal }),
    });
    if (res.ok) {
      setNewComment('');
      const commRes = await fetch(`${API}/support/comments/?ticket=${selectedTicket.id}`, { credentials: 'include' });
      if (commRes.ok) { const d = await commRes.json(); setTicketComments(d.results || d); }
    }
  };

  const changeTicketStatus = async (action: string) => {
    if (!selectedTicket) return;
    const res = await fetch(`${API}/support/tickets/${selectedTicket.id}/${action}/`, {
      method: 'POST', credentials: 'include',
    });
    if (res.ok) { toast.success('Status atualizado'); const d = await res.json(); setSelectedTicket(d); fetchAll(); }
  };

  const createKBArticle = async () => {
    if (!kbForm.title.trim()) { toast.error('Título obrigatório'); return; }
    const res = await fetch(`${API}/support/kb/`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(kbForm),
    });
    if (res.ok) { toast.success('Artigo criado!'); setShowCreateKB(false); setKbForm({ title: '', summary: '', content: '', is_public: false }); fetchAll(); }
    else toast.error('Erro ao criar artigo');
  };

  const tabs = [
    { key: 'tickets', label: `Tickets (${tickets.length})`, icon: MessageSquare },
    { key: 'kb', label: 'Base de Conhecimento', icon: BookOpen },
    { key: 'dashboard', label: 'Dashboard', icon: BarChart2 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Suporte</h1>
          <p className="text-sm text-gray-500 mt-0.5">Help Desk e Base de Conhecimento</p>
        </div>
        {activeTab === 'tickets' && (
          <button onClick={() => setShowCreateTicket(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#A6864A] text-white rounded-xl text-sm font-medium hover:bg-[#8B6F3D]">
            <Plus className="w-4 h-4" /> Novo Ticket
          </button>
        )}
        {activeTab === 'kb' && (
          <button onClick={() => setShowCreateKB(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#A6864A] text-white rounded-xl text-sm font-medium hover:bg-[#8B6F3D]">
            <Plus className="w-4 h-4" /> Novo Artigo
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-200 w-fit">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.key ? 'bg-[#A6864A] text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}>
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TICKETS TAB */}
      {activeTab === 'tickets' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input className="pl-10 pr-4 py-2 border border-gray-200 bg-white rounded-xl text-sm w-full outline-none focus:border-[#A6864A]"
                placeholder="Buscar tickets..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="px-3 py-2 border border-gray-200 bg-white rounded-xl text-sm outline-none"
              value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">Todos os status</option>
              {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select className="px-3 py-2 border border-gray-200 bg-white rounded-xl text-sm outline-none"
              value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
              <option value="">Todas as prioridades</option>
              {Object.entries(priorityConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          {/* Ticket list */}
          <div className="space-y-2">
            {loading && <div className="text-center py-8 text-gray-400">Carregando...</div>}
            {!loading && tickets.map(ticket => (
              <div key={ticket.id}
                onClick={() => openTicketDetail(ticket)}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 hover:border-[#A6864A]/40 cursor-pointer transition-all">
                <div className="flex items-start gap-3">
                  <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${priorityConfig[ticket.priority]?.dot || 'bg-gray-300'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs text-gray-400 font-mono">#{ticket.number}</span>
                        <h3 className="font-semibold text-gray-800 leading-tight">{ticket.title}</h3>
                        {ticket.customer_name && <p className="text-xs text-gray-400 mt-0.5">{ticket.customer_name}</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusConfig[ticket.status]?.color || 'bg-gray-100 text-gray-600'}`}>
                          {statusConfig[ticket.status]?.label || ticket.status}
                        </span>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${priorityConfig[ticket.priority]?.color || 'bg-gray-100 text-gray-600'}`}>
                          {priorityConfig[ticket.priority]?.label || ticket.priority}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      {ticket.assigned_to_name && <span className="flex items-center gap-1"><User className="w-3 h-3" />{ticket.assigned_to_name}</span>}
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
              <div className="text-center py-16 bg-white rounded-xl text-gray-400">
                Nenhum ticket encontrado.
              </div>
            )}
          </div>
        </div>
      )}

      {/* KB TAB */}
      {activeTab === 'kb' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {kbArticles.map(article => (
            <div key={article.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-gray-800 flex-1 pr-2">{article.title}</h3>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <span className={`px-2 py-0.5 text-xs rounded-full ${article.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {article.status === 'published' ? 'Publicado' : 'Rascunho'}
                  </span>
                  {article.is_public && <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-600">Público</span>}
                </div>
              </div>
              {article.summary && <p className="text-sm text-gray-500 mb-3 line-clamp-2">{article.summary}</p>}
              <div className="flex items-center gap-4 text-xs text-gray-400">
                {article.category_name && <span>{article.category_name}</span>}
                <span>{article.views_count} visualizações</span>
                <span>👍 {article.helpful_count}</span>
                <span>{formatDate(article.created_at)}</span>
              </div>
            </div>
          ))}
          {kbArticles.length === 0 && (
            <div className="col-span-2 text-center py-16 bg-white rounded-xl text-gray-400">
              Nenhum artigo na base de conhecimento.
            </div>
          )}
        </div>
      )}

      {/* DASHBOARD TAB */}
      {activeTab === 'dashboard' && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'Total', value: stats.total, color: 'text-gray-700 bg-gray-50' },
              { label: 'Abertos', value: stats.open, color: 'text-blue-700 bg-blue-50' },
              { label: 'Em Atendimento', value: stats.in_progress, color: 'text-yellow-700 bg-yellow-50' },
              { label: 'Aguardando', value: stats.pending_client, color: 'text-purple-700 bg-purple-50' },
              { label: 'Resolvidos', value: stats.resolved, color: 'text-green-700 bg-green-50' },
              { label: 'SLA Violado', value: stats.sla_breached, color: 'text-red-700 bg-red-50' },
            ].map(s => (
              <div key={s.label} className={`rounded-xl p-4 ${s.color}`}>
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
            <h3 className="font-semibold text-gray-800 mb-4">Por Prioridade</h3>
            <div className="space-y-3">
              {stats.by_priority.map(bp => (
                <div key={bp.priority} className="flex items-center gap-3">
                  <span className={`px-2.5 py-0.5 text-xs rounded-full w-20 text-center ${priorityConfig[bp.priority]?.color || 'bg-gray-100 text-gray-600'}`}>
                    {priorityConfig[bp.priority]?.label || bp.priority}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className={`h-full rounded-full ${
                      bp.priority === 'critical' ? 'bg-red-500' :
                      bp.priority === 'high' ? 'bg-orange-500' :
                      bp.priority === 'medium' ? 'bg-blue-500' : 'bg-gray-400'
                    }`} style={{ width: `${stats.total ? (bp.count / stats.total) * 100 : 0}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 w-6">{bp.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Criar Ticket */}
      {showCreateTicket && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white z-10">
              <h2 className="font-semibold text-gray-800">Novo Ticket de Suporte</h2>
              <button onClick={() => setShowCreateTicket(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600">Título *</label>
                <input className="input-field mt-1" value={ticketForm.title}
                  onChange={e => setTicketForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Tipo</label>
                  <select className="input-field mt-1" value={ticketForm.ticket_type}
                    onChange={e => setTicketForm(f => ({ ...f, ticket_type: e.target.value }))}>
                    {['bug', 'feature', 'question', 'performance', 'integration', 'other'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Prioridade</label>
                  <select className="input-field mt-1" value={ticketForm.priority}
                    onChange={e => setTicketForm(f => ({ ...f, priority: e.target.value }))}>
                    {['low', 'medium', 'high', 'critical'].map(p => (
                      <option key={p} value={p}>{priorityConfig[p].label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Cliente</label>
                <select className="input-field mt-1" value={ticketForm.customer}
                  onChange={e => setTicketForm(f => ({ ...f, customer: e.target.value }))}>
                  <option value="">Sem cliente</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.company_name || c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">Nome do Contato</label>
                  <input className="input-field mt-1" value={ticketForm.contact_name}
                    onChange={e => setTicketForm(f => ({ ...f, contact_name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Email do Contato</label>
                  <input type="email" className="input-field mt-1" value={ticketForm.contact_email}
                    onChange={e => setTicketForm(f => ({ ...f, contact_email: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Descrição *</label>
                <textarea rows={4} className="input-field mt-1" value={ticketForm.description}
                  onChange={e => setTicketForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Tags (separadas por vírgula)</label>
                <input className="input-field mt-1" value={ticketForm.tags}
                  onChange={e => setTicketForm(f => ({ ...f, tags: e.target.value }))}
                  placeholder="login, pagamento, relatório..." />
              </div>
            </div>
            <div className="p-5 border-t flex justify-end gap-3">
              <button onClick={() => setShowCreateTicket(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button onClick={createTicket} className="px-4 py-2 text-sm bg-[#A6864A] text-white rounded-lg hover:bg-[#8B6F3D]">Criar Ticket</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Detalhe do Ticket */}
      {selectedTicket && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <span className="text-xs font-mono text-gray-400">#{selectedTicket.number}</span>
                <h2 className="font-semibold text-gray-800">{selectedTicket.title}</h2>
              </div>
              <button onClick={() => setSelectedTicket(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Status badges */}
              <div className="flex gap-2 flex-wrap">
                <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${statusConfig[selectedTicket.status]?.color}`}>
                  {statusConfig[selectedTicket.status]?.label}
                </span>
                <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${priorityConfig[selectedTicket.priority]?.color}`}>
                  {priorityConfig[selectedTicket.priority]?.label}
                </span>
                {selectedTicket.is_sla_breached && (
                  <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> SLA Violado
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">
                <p>{selectedTicket.description}</p>
              </div>

              {/* Quick actions */}
              <div className="flex gap-2">
                {selectedTicket.status !== 'resolved' && selectedTicket.status !== 'closed' && (
                  <button onClick={() => changeTicketStatus('resolve')}
                    className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200 font-medium">
                    Resolver
                  </button>
                )}
                {selectedTicket.status === 'resolved' && (
                  <button onClick={() => changeTicketStatus('close')}
                    className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium">
                    Fechar
                  </button>
                )}
              </div>

              {/* Comments */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Comentários ({ticketComments.length})</h3>
                <div className="space-y-2">
                  {ticketComments.map(c => (
                    <div key={c.id} className={`p-3 rounded-lg text-sm ${c.is_internal ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-700">{c.user_name}</span>
                        <div className="flex items-center gap-2">
                          {c.is_internal && <span className="text-xs text-yellow-600 font-medium">Interno</span>}
                          <span className="text-xs text-gray-400">{formatDateTime(c.created_at)}</span>
                        </div>
                      </div>
                      <p className="text-gray-600">{c.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Comment input */}
            <div className="p-4 border-t">
              <div className="flex gap-2 mb-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} />
                  Comentário interno
                </label>
              </div>
              <div className="flex gap-2">
                <textarea rows={2} className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none outline-none focus:border-[#A6864A]"
                  placeholder="Escreva um comentário..."
                  value={newComment} onChange={e => setNewComment(e.target.value)} />
                <button onClick={addComment} className="px-3 py-2 bg-[#A6864A] text-white rounded-xl hover:bg-[#8B6F3D]">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Criar artigo KB */}
      {showCreateKB && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-gray-800">Novo Artigo</h2>
              <button onClick={() => setShowCreateKB(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600">Título *</label>
                <input className="input-field mt-1" value={kbForm.title}
                  onChange={e => setKbForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Resumo</label>
                <textarea rows={2} className="input-field mt-1" value={kbForm.summary}
                  onChange={e => setKbForm(f => ({ ...f, summary: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Conteúdo</label>
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
              <button onClick={() => setShowCreateKB(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button onClick={createKBArticle} className="px-4 py-2 text-sm bg-[#A6864A] text-white rounded-lg hover:bg-[#8B6F3D]">Criar Artigo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
