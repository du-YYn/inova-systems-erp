'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, Edit, Trash2, TrendingUp, X, LayoutList,
  Kanban, ChevronDown, UserPlus, CheckCircle, Calendar,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton, CardSkeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Prospect {
  id: number;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  source: string;
  status: string;
  estimated_value: number;
  description: string;
  next_action: string;
  next_action_date: string | null;
  assigned_to: number | null;
  assigned_to_name: string | null;
  created_by_name: string;
  created_at: string;
  // qualification fields
  qualification_level: string;
  usage_type: string;
  company_size: string;
  has_operation: boolean | null;
  has_budget: boolean | null;
  is_decision_maker: boolean | null;
  has_urgency: boolean | null;
  qualification_score: number;
  meets_qualification: boolean;
  // meeting fields
  closer_name: string;
  meeting_scheduled_at: string | null;
  meeting_link: string;
  meeting_attended: boolean | null;
  // post-meeting
  ebook_sent_at: string | null;
  days_since_created: number;
}

interface ProspectForm {
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  source: string;
  status: string;
  estimated_value: string;
  description: string;
  next_action: string;
  next_action_date: string;
  qualification_level: string;
  usage_type: string;
  company_size: string;
  has_operation: boolean | null;
  has_budget: boolean | null;
  is_decision_maker: boolean | null;
  has_urgency: boolean | null;
  closer_name: string;
  meeting_scheduled_at: string;
  meeting_link: string;
}

type ViewMode = 'list' | 'pipeline';
type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'purple' | 'gold' | 'neutral';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

const statusLabels: Record<string, string> = {
  lead_received: 'Lead Recebido',
  qualifying: 'Em Qualificação',
  qualified: 'Qualificado',
  not_qualified: 'Não Qualificado',
  scheduled: 'Agendado',
  pre_meeting: 'Pré-Reunião',
  no_show: 'Não Compareceu',
  meeting_done: 'Reunião Realizada',
  proposal_sent: 'Proposta Enviada',
  closed: 'Fechado',
  not_closed: 'Não Fechou',
  follow_up: 'Em Follow-up',
};

const statusColors: Record<string, string> = {
  lead_received: 'bg-blue-100 text-blue-800',
  qualifying: 'bg-yellow-100 text-yellow-800',
  qualified: 'bg-purple-100 text-purple-800',
  not_qualified: 'bg-red-100 text-red-800',
  scheduled: 'bg-indigo-100 text-indigo-800',
  pre_meeting: 'bg-indigo-200 text-indigo-900',
  no_show: 'bg-orange-100 text-orange-800',
  meeting_done: 'bg-teal-100 text-teal-800',
  proposal_sent: 'bg-orange-100 text-orange-800',
  closed: 'bg-green-100 text-green-800',
  not_closed: 'bg-gray-100 text-gray-700',
  follow_up: 'bg-pink-100 text-pink-800',
};

const statusBadgeVariant: Record<string, BadgeVariant> = {
  lead_received: 'info',
  qualifying: 'warning',
  qualified: 'purple',
  not_qualified: 'error',
  scheduled: 'info',
  pre_meeting: 'info',
  no_show: 'warning',
  meeting_done: 'success',
  proposal_sent: 'warning',
  closed: 'success',
  not_closed: 'neutral',
  follow_up: 'gold',
};

// 8 active pipeline columns — the 4 terminal/exception statuses appear only in list
const PIPELINE_COLUMNS = [
  'lead_received',
  'qualifying',
  'qualified',
  'scheduled',
  'pre_meeting',
  'meeting_done',
  'proposal_sent',
  'closed',
];

const sourceOptions = [
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Indicação' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'event', label: 'Evento' },
  { value: 'cold_outreach', label: 'Cold Outreach' },
  { value: 'quiz', label: 'Quiz / Formulário' },
  { value: 'other', label: 'Outro' },
];

const EMPTY_FORM: ProspectForm = {
  company_name: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  source: 'website',
  status: 'lead_received',
  estimated_value: '',
  description: '',
  next_action: '',
  next_action_date: '',
  qualification_level: '',
  usage_type: '',
  company_size: '',
  has_operation: null,
  has_budget: null,
  is_decision_maker: null,
  has_urgency: null,
  closer_name: '',
  meeting_scheduled_at: '',
  meeting_link: '',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const formatDateShort = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return iso;
  }
};

// Tri-state checkbox: null → indeterminate/unset, true → yes, false → no
function TriCheckbox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  const cycle = () => {
    if (value === null) onChange(true);
    else if (value === true) onChange(false);
    else onChange(null);
  };

  const display =
    value === true ? '✓' : value === false ? '✗' : '—';
  const cls =
    value === true
      ? 'bg-green-100 border-green-400 text-green-700'
      : value === false
      ? 'bg-red-100 border-red-400 text-red-700'
      : 'bg-gray-100 border-gray-300 text-gray-400';

  return (
    <button
      type="button"
      onClick={cycle}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium w-full transition-colors ${cls}`}
    >
      <span className="w-4 text-center font-bold">{display}</span>
      <span className="text-left leading-tight">{label}</span>
    </button>
  );
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function CRMPage() {
  const toast = useToast();

  // Paged list state
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Pipeline / KPI state (full dataset)
  const [allProspects, setAllProspects] = useState<Prospect[]>([]);

  // UI state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showModal, setShowModal] = useState(false);
  const [editingProspect, setEditingProspect] = useState<Prospect | null>(null);
  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Prospect | null>(null);
  const [formData, setFormData] = useState<ProspectForm>(EMPTY_FORM);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
  const getHeaders = () => ({ 'Content-Type': 'application/json' });

  // ─── Data fetching ────────────────────────────────────────────────────────

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (search) params.set('search', search);
      const res = await fetch(`${apiUrl}/sales/prospects/?${params}`, {
        headers: getHeaders(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setProspects(Array.isArray(data.results ?? data) ? (data.results ?? data) : []);
      setTotal(data.count ?? (data.results ?? data).length);
    } catch {
      toast.error('Erro ao carregar prospects');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  const fetchAllProspects = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/sales/prospects/?page_size=500`, {
        headers: getHeaders(),
        credentials: 'include',
      });
      if (!res.ok) return;
      const data = await res.json();
      setAllProspects(Array.isArray(data.results ?? data) ? (data.results ?? data) : []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchProspects(); }, [fetchProspects]);
  // Always keep allProspects fresh for KPIs + pipeline
  useEffect(() => { fetchAllProspects(); }, [fetchAllProspects]);

  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  // ─── KPI computations (from full dataset) ────────────────────────────────

  const kpiSource = allProspects.length > 0 ? allProspects : prospects;

  const kpiLeads = kpiSource.filter(p =>
    p.status === 'lead_received' || p.status === 'qualifying'
  ).length;

  const kpiQualified = kpiSource.filter(p => p.status === 'qualified').length;

  const kpiScheduled = kpiSource.filter(p =>
    p.status === 'scheduled' || p.status === 'pre_meeting'
  ).length;

  const closedProspects = kpiSource.filter(p => p.status === 'closed');
  const kpiClosedCount = closedProspects.length;
  const kpiClosedValue = closedProspects.reduce((acc, p) => acc + (p.estimated_value || 0), 0);

  // ─── Modal helpers ────────────────────────────────────────────────────────

  const openNewModal = () => {
    setEditingProspect(null);
    setFormData(EMPTY_FORM);
    setShowModal(true);
  };

  const openEditModal = (p: Prospect) => {
    setEditingProspect(p);
    setFormData({
      company_name: p.company_name,
      contact_name: p.contact_name,
      contact_email: p.contact_email,
      contact_phone: p.contact_phone || '',
      source: p.source || 'website',
      status: p.status,
      estimated_value: p.estimated_value ? String(p.estimated_value) : '',
      description: p.description || '',
      next_action: p.next_action || '',
      next_action_date: p.next_action_date || '',
      qualification_level: p.qualification_level || '',
      usage_type: p.usage_type || '',
      company_size: p.company_size || '',
      has_operation: p.has_operation ?? null,
      has_budget: p.has_budget ?? null,
      is_decision_maker: p.is_decision_maker ?? null,
      has_urgency: p.has_urgency ?? null,
      closer_name: p.closer_name || '',
      meeting_scheduled_at: p.meeting_scheduled_at || '',
      meeting_link: p.meeting_link || '',
    });
    setShowModal(true);
  };

  const setField = <K extends keyof ProspectForm>(key: K, value: ProspectForm[K]) =>
    setFormData(prev => ({ ...prev, [key]: value }));

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingProspect
        ? `${apiUrl}/sales/prospects/${editingProspect.id}/`
        : `${apiUrl}/sales/prospects/`;
      const method = editingProspect ? 'PATCH' : 'POST';

      // Build payload — strip empty strings for optional fields
      const payload: Record<string, unknown> = {
        company_name: formData.company_name,
        contact_name: formData.contact_name,
        contact_email: formData.contact_email,
        contact_phone: formData.contact_phone || '',
        source: formData.source,
        status: formData.status,
        estimated_value: formData.estimated_value ? parseFloat(formData.estimated_value) : 0,
        description: formData.description,
        next_action: formData.next_action,
        next_action_date: formData.next_action_date || null,
        qualification_level: formData.qualification_level,
        usage_type: formData.usage_type,
        company_size: formData.company_size,
        has_operation: formData.has_operation,
        has_budget: formData.has_budget,
        is_decision_maker: formData.is_decision_maker,
        has_urgency: formData.has_urgency,
        closer_name: formData.closer_name,
        meeting_scheduled_at: formData.meeting_scheduled_at || null,
        meeting_link: formData.meeting_link,
      };

      const res = await fetch(url, {
        method,
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      toast.success(editingProspect ? 'Prospect atualizado!' : 'Prospect criado!');
      setShowModal(false);
      fetchProspects();
      fetchAllProspects();
    } catch {
      toast.error('Erro ao salvar prospect.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (prospect: Prospect, newStatus: string) => {
    setUpdatingStatus(prospect.id);
    try {
      const res = await fetch(`${apiUrl}/sales/prospects/${prospect.id}/`, {
        method: 'PATCH',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Status atualizado para "${statusLabels[newStatus]}"`);
      fetchProspects();
      fetchAllProspects();
    } catch {
      toast.error('Erro ao atualizar status.');
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      const res = await fetch(`${apiUrl}/sales/prospects/${confirmDelete.id}/`, {
        method: 'DELETE',
        headers: getHeaders(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error();
      toast.success(`"${confirmDelete.company_name}" removido.`);
      setConfirmDelete(null);
      fetchProspects();
      fetchAllProspects();
    } catch {
      toast.error('Erro ao excluir prospect.');
    }
  };

  // ─── Misc ─────────────────────────────────────────────────────────────────

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const labelInput = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5';

  const qualScoreBadgeColor = (score: number) => {
    if (score >= 3) return 'bg-green-100 text-green-700';
    if (score === 2) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CRM</h1>
          <p className="text-sm text-gray-500 mt-1">Gestão de prospecção e pipeline de vendas</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-card">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all duration-150 ${viewMode === 'list' ? 'bg-[#A6864A] text-white shadow-sm' : 'text-gray-400 hover:text-gray-700'}`}
              title="Lista"
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('pipeline')}
              className={`p-2 rounded-lg transition-all duration-150 ${viewMode === 'pipeline' ? 'bg-[#A6864A] text-white shadow-sm' : 'text-gray-400 hover:text-gray-700'}`}
              title="Pipeline"
            >
              <Kanban className="w-4 h-4" />
            </button>
          </div>
          <Button onClick={openNewModal}>
            <Plus className="w-4 h-4" /> Novo Prospect
          </Button>
        </div>
      </div>

      {/* ─── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
        ) : (
          <>
            {/* 1. Leads Recebidos */}
            <div className="card card-hover p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <UserPlus className="w-5 h-5 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide truncate">Leads Recebidos</p>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{kpiLeads}</p>
                  <p className="text-xs text-gray-400">lead + em qualificação</p>
                </div>
              </div>
            </div>

            {/* 2. Qualificados */}
            <div className="card card-hover p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-5 h-5 text-purple-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide truncate">Qualificados</p>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{kpiQualified}</p>
                </div>
              </div>
            </div>

            {/* 3. Agendados */}
            <div className="card card-hover p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide truncate">Agendados</p>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{kpiScheduled}</p>
                  <p className="text-xs text-gray-400">agendado + pré-reunião</p>
                </div>
              </div>
            </div>

            {/* 4. Fechados */}
            <div className="card card-hover p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide truncate">Fechados</p>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{kpiClosedCount}</p>
                  <p className="text-xs text-[#A6864A] font-semibold tabular-nums">{formatCurrency(kpiClosedValue)}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─── List View ─────────────────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar prospects..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="input-field pl-9"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <TableSkeleton rows={6} cols={6} />
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Empresa</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Contato</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Origem</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor Est.</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {prospects.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-16 text-center text-gray-400 text-sm">
                        Nenhum prospect encontrado
                      </td>
                    </tr>
                  ) : (
                    prospects.map((prospect) => (
                      <tr key={prospect.id} className="hover:bg-gray-50/60 transition-colors">
                        {/* Empresa + qualif badges */}
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900 text-sm">{prospect.company_name}</p>
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {prospect.qualification_level && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100">
                                N{prospect.qualification_level}
                              </span>
                            )}
                            {prospect.qualification_score > 0 && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${qualScoreBadgeColor(prospect.qualification_score)}`}>
                                {prospect.qualification_score}/4
                              </span>
                            )}
                            {prospect.meeting_scheduled_at && (
                              <span className="flex items-center gap-0.5 text-[10px] text-indigo-600 font-medium">
                                <Calendar className="w-2.5 h-2.5" />
                                {formatDateShort(prospect.meeting_scheduled_at)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-gray-800">{prospect.contact_name}</p>
                          <p className="text-xs text-gray-400">{prospect.contact_email}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 capitalize">
                          {sourceOptions.find(s => s.value === prospect.source)?.label ?? prospect.source}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 tabular-nums">
                          {formatCurrency(prospect.estimated_value)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="relative inline-block">
                            <select
                              value={prospect.status}
                              onChange={e => handleStatusChange(prospect, e.target.value)}
                              disabled={updatingStatus === prospect.id}
                              className={`pl-2 pr-6 py-1 rounded-full text-xs font-medium border-0 cursor-pointer appearance-none focus:outline-none focus:ring-2 focus:ring-[#A6864A]/30 ${statusColors[prospect.status] || 'bg-gray-100 text-gray-800'}`}
                            >
                              {Object.entries(statusLabels).map(([val, label]) => (
                                <option key={val} value={val}>{label}</option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditModal(prospect)}
                              className="p-1.5 text-gray-300 hover:text-[#A6864A] transition-colors rounded-lg hover:bg-[#A6864A]/5"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setConfirmDelete(prospect)}
                              className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            totalItems={total}
            pageSize={PAGE_SIZE}
            onChange={setPage}
          />
        </div>
      )}

      {/* ─── Pipeline View ─────────────────────────────────────────────────── */}
      {viewMode === 'pipeline' && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {PIPELINE_COLUMNS.map((status) => {
              const col = allProspects.filter(p => p.status === status);
              const colValue = col.reduce((acc, p) => acc + (p.estimated_value || 0), 0);
              return (
                <div key={status} className="w-60 flex flex-col gap-2">
                  {/* Column header */}
                  <div className="flex items-center justify-between px-3 py-2.5 bg-white rounded-xl border border-gray-100 shadow-card">
                    <Badge variant={statusBadgeVariant[status] || 'neutral'} dot>
                      {statusLabels[status]}
                    </Badge>
                    <span className="text-xs text-gray-400 font-semibold">{col.length}</span>
                  </div>
                  {col.length > 0 && (
                    <p className="text-xs text-gray-400 px-1 font-medium tabular-nums">{formatCurrency(colValue)}</p>
                  )}
                  {/* Cards */}
                  <div className="flex flex-col gap-2">
                    {col.map(prospect => (
                      <div key={prospect.id} className="card card-hover p-3 cursor-default">
                        <p className="text-sm font-semibold text-gray-900 mb-0.5">{prospect.company_name}</p>
                        <p className="text-xs text-gray-400 mb-1">{prospect.contact_name}</p>
                        {/* Qualification badges */}
                        <div className="flex items-center gap-1 flex-wrap mb-2">
                          {prospect.qualification_level && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100">
                              N{prospect.qualification_level}
                            </span>
                          )}
                          {prospect.qualification_score > 0 && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${qualScoreBadgeColor(prospect.qualification_score)}`}>
                              {prospect.qualification_score}/4
                            </span>
                          )}
                          {prospect.meeting_scheduled_at && (
                            <span className="flex items-center gap-0.5 text-[10px] text-indigo-600 font-medium">
                              <Calendar className="w-2.5 h-2.5" />
                              {formatDateShort(prospect.meeting_scheduled_at)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#A6864A] tabular-nums">
                            {formatCurrency(prospect.estimated_value)}
                          </span>
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => openEditModal(prospect)}
                              className="p-1 text-gray-300 hover:text-[#A6864A] transition-colors rounded"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmDelete(prospect)}
                              className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {col.length === 0 && (
                    <div className="border-2 border-dashed border-gray-100 rounded-xl p-5 text-center">
                      <p className="text-xs text-gray-300">Sem prospects</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Modal (create / edit) ─────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto shadow-modal animate-modal-in">
            {/* Modal header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">
                {editingProspect ? 'Editar Prospect' : 'Novo Prospect'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* ── Base info ── */}
              <div>
                <label className={labelInput}>Empresa *</label>
                <input
                  type="text"
                  required
                  value={formData.company_name}
                  onChange={(e) => setField('company_name', e.target.value)}
                  className="input-field"
                  placeholder="Nome da empresa"
                />
              </div>
              <div>
                <label className={labelInput}>Contato *</label>
                <input
                  type="text"
                  required
                  value={formData.contact_name}
                  onChange={(e) => setField('contact_name', e.target.value)}
                  className="input-field"
                  placeholder="Nome do contato"
                />
              </div>
              <div>
                <label className={labelInput}>Email *</label>
                <input
                  type="email"
                  required
                  value={formData.contact_email}
                  onChange={(e) => setField('contact_email', e.target.value)}
                  className="input-field"
                  placeholder="email@empresa.com"
                />
              </div>
              <div>
                <label className={labelInput}>Telefone</label>
                <input
                  type="text"
                  value={formData.contact_phone}
                  onChange={(e) => setField('contact_phone', e.target.value)}
                  className="input-field"
                  placeholder="(11) 99999-9999"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelInput}>Origem</label>
                  <select
                    value={formData.source}
                    onChange={(e) => setField('source', e.target.value)}
                    className="input-field bg-white"
                  >
                    {sourceOptions.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                {editingProspect && (
                  <div>
                    <label className={labelInput}>Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setField('status', e.target.value)}
                      className="input-field bg-white"
                    >
                      {Object.entries(statusLabels).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className={labelInput}>Valor Estimado (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.estimated_value}
                  onChange={(e) => setField('estimated_value', e.target.value)}
                  className="input-field"
                  placeholder="0,00"
                />
              </div>
              <div>
                <label className={labelInput}>Descrição</label>
                <textarea
                  value={formData.description}
                  rows={3}
                  onChange={(e) => setField('description', e.target.value)}
                  className="input-field resize-none"
                  placeholder="Observações sobre o prospect..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelInput}>Próxima ação</label>
                  <input
                    type="text"
                    value={formData.next_action}
                    onChange={(e) => setField('next_action', e.target.value)}
                    className="input-field"
                    placeholder="Ex: Enviar proposta"
                  />
                </div>
                <div>
                  <label className={labelInput}>Data da ação</label>
                  <input
                    type="date"
                    value={formData.next_action_date}
                    onChange={(e) => setField('next_action_date', e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>

              {/* ── Qualificação ── */}
              <hr className="border-gray-100 my-2" />
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Qualificação</p>

              <div>
                <label className={labelInput}>Nível do Lead</label>
                <select
                  value={formData.qualification_level}
                  onChange={(e) => setField('qualification_level', e.target.value)}
                  className="input-field bg-white"
                >
                  <option value="">Selecionar nível</option>
                  <option value="2">Nível 2 — Consciente do Problema</option>
                  <option value="3">Nível 3 — Consciente da Solução</option>
                  <option value="4">Nível 4 — Consciente do Produto</option>
                </select>
              </div>

              {(formData.qualification_level === '3' || formData.qualification_level === '4') && (
                <div>
                  <label className={labelInput}>Tipo de Uso</label>
                  <select
                    value={formData.usage_type}
                    onChange={(e) => setField('usage_type', e.target.value)}
                    className="input-field bg-white"
                  >
                    <option value="">Selecionar</option>
                    <option value="internal">Uso Interno</option>
                    <option value="commercial">Uso Comercial</option>
                  </select>
                </div>
              )}

              <div>
                <label className={labelInput}>Tamanho da empresa</label>
                <select
                  value={formData.company_size}
                  onChange={(e) => setField('company_size', e.target.value)}
                  className="input-field bg-white"
                >
                  <option value="">Selecionar</option>
                  <option value="small">Pequena</option>
                  <option value="medium">Média</option>
                  <option value="large">Grande</option>
                </select>
              </div>

              {/* 2x2 qualification checkboxes */}
              <div>
                <label className={labelInput}>Critérios de qualificação</label>
                <div className="grid grid-cols-2 gap-2">
                  <TriCheckbox
                    label="Tem operação rodando"
                    value={formData.has_operation}
                    onChange={(v) => setField('has_operation', v)}
                  />
                  <TriCheckbox
                    label="Budget compatível"
                    value={formData.has_budget}
                    onChange={(v) => setField('has_budget', v)}
                  />
                  <TriCheckbox
                    label="Tomador de decisão"
                    value={formData.is_decision_maker}
                    onChange={(v) => setField('is_decision_maker', v)}
                  />
                  <TriCheckbox
                    label="Tem urgência real"
                    value={formData.has_urgency}
                    onChange={(v) => setField('has_urgency', v)}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Clique para alternar: — não definido · ✓ sim · ✗ não</p>
              </div>

              {/* ── Agendamento (edit only) ── */}
              {editingProspect && (
                <>
                  <hr className="border-gray-100 my-2" />
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Agendamento</p>

                  <div>
                    <label className={labelInput}>Closer</label>
                    <input
                      type="text"
                      value={formData.closer_name}
                      onChange={(e) => setField('closer_name', e.target.value)}
                      className="input-field"
                      placeholder="Nome do closer responsável"
                    />
                  </div>
                  <div>
                    <label className={labelInput}>Data da Reunião</label>
                    <input
                      type="datetime-local"
                      value={formData.meeting_scheduled_at}
                      onChange={(e) => setField('meeting_scheduled_at', e.target.value)}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className={labelInput}>Link da Reunião</label>
                    <input
                      type="url"
                      value={formData.meeting_link}
                      onChange={(e) => setField('meeting_link', e.target.value)}
                      className="input-field"
                      placeholder="https://meet.google.com/..."
                    />
                  </div>
                </>
              )}

              {/* ── Actions ── */}
              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setShowModal(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" loading={saving} className="flex-1">
                  {editingProspect ? 'Atualizar' : 'Criar Prospect'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Excluir prospect"
        description={`Tem certeza que deseja excluir "${confirmDelete?.company_name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
