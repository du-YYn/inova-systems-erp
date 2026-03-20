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
  service_interest: string;
  temperature: string;
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
  meeting_transcript: string;
  days_since_created: number;
}

interface ProspectForm {
  // Seção 1 — Identificação
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  source: string;
  status: string;
  service_interest: string;
  // Seção 2 — Qualificação
  company_size: string;
  qualification_level: string;
  usage_type: string;
  estimated_value: string;
  has_budget: boolean | null;
  is_decision_maker: boolean | null;
  has_urgency: boolean | null;
  has_operation: boolean | null;
  // Seção 3 — Briefing SDR
  description: string;
  temperature: string;
  next_action: string;
  next_action_date: string;
  // Seção 4 — Notas do Closer
  closer_name: string;
  meeting_scheduled_at: string;
  meeting_link: string;
  meeting_transcript: string;
}

type ViewMode = 'list' | 'pipeline';
type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'purple' | 'gold' | 'neutral';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

const statusLabels: Record<string, string> = {
  new: 'Lead Recebido',
  qualifying: 'Em Qualificação',
  qualified: 'Reunião Agendada',
  discovery: 'Discovery',
  proposal: 'Proposta Enviada',
  won: 'Fechado',
  follow_up: 'Follow-Up',
  lost: 'Perdido',
  disqualified: 'Desqualificado',
};

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  qualifying: 'bg-yellow-100 text-yellow-800',
  qualified: 'bg-purple-100 text-purple-800',
  discovery: 'bg-indigo-100 text-indigo-800',
  proposal: 'bg-amber-100 text-amber-800',
  won: 'bg-green-100 text-green-800',
  follow_up: 'bg-orange-100 text-orange-800',
  lost: 'bg-gray-100 text-gray-700',
  disqualified: 'bg-red-100 text-red-800',
};

const statusBadgeVariant: Record<string, BadgeVariant> = {
  new: 'info',
  qualifying: 'warning',
  qualified: 'purple',
  discovery: 'info',
  proposal: 'gold',
  won: 'success',
  follow_up: 'warning',
  lost: 'neutral',
  disqualified: 'error',
};

const FOLLOW_UP_REASONS = [
  { value: 'nao_agendou', label: 'Não Agendou', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'nao_compareceu', label: 'Não Compareceu', color: 'bg-orange-100 text-orange-700' },
  { value: 'nao_fechou', label: 'Não Fechou', color: 'bg-red-100 text-red-700' },
];

// 7 colunas do kanban — Perdido/Desqualificado só na lista
const PIPELINE_COLUMNS = [
  'new',
  'qualifying',
  'qualified',
  'discovery',
  'proposal',
  'won',
  'follow_up',
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

const serviceInterestOptions = [
  { value: 'software_dev', label: 'Desenvolvimento Web' },
  { value: 'mobile', label: 'Aplicativo Mobile' },
  { value: 'automation', label: 'Automação' },
  { value: 'ai', label: 'Inteligência Artificial' },
  { value: 'consulting', label: 'Consultoria' },
  { value: 'mixed', label: 'Indefinido / Múltiplos' },
];

const temperatureLabels: Record<string, string> = {
  hot: 'Quente',
  warm: 'Morno',
  cold: 'Frio',
};

const temperatureColors: Record<string, string> = {
  hot: 'bg-red-100 text-red-700',
  warm: 'bg-yellow-100 text-yellow-700',
  cold: 'bg-blue-100 text-blue-700',
};

const EMPTY_FORM: ProspectForm = {
  // Seção 1
  company_name: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  source: 'website',
  status: 'new',
  service_interest: '',
  // Seção 2
  company_size: '',
  qualification_level: '',
  usage_type: '',
  estimated_value: '',
  has_budget: null,
  is_decision_maker: null,
  has_urgency: null,
  has_operation: null,
  // Seção 3
  description: '',
  temperature: 'warm',
  next_action: '',
  next_action_date: '',
  // Seção 4
  closer_name: '',
  meeting_scheduled_at: '',
  meeting_link: '',
  meeting_transcript: '',
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

export default function FunilTab() {
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

  // Modal de motivo de perda
  const [lossModalProspect, setLossModalProspect] = useState<Prospect | null>(null);
  const [lossForm, setLossForm] = useState({
    reason: '',
    remarketing: '',
    notes: '',
  });
  const [savingLoss, setSavingLoss] = useState(false);

  // Modal de Follow-Up
  const [followUpModalProspect, setFollowUpModalProspect] = useState<Prospect | null>(null);
  const [followUpForm, setFollowUpForm] = useState({
    reason: '',
    next_contact_date: '',
    notes: '',
  });
  const [savingFollowUp, setSavingFollowUp] = useState(false);

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
    p.status === 'new' || p.status === 'qualifying'
  ).length;

  const kpiAgendados = kpiSource.filter(p =>
    p.status === 'qualified'
  ).length;

  const kpiEmAndamento = kpiSource.filter(p =>
    p.status === 'discovery' || p.status === 'proposal'
  ).length;

  const wonProspects = kpiSource.filter(p => p.status === 'won');
  const kpiWonCount = wonProspects.length;
  const kpiWonValue = wonProspects.reduce((acc, p) => acc + (p.estimated_value || 0), 0);

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
      service_interest: p.service_interest || '',
      company_size: p.company_size || '',
      qualification_level: p.qualification_level || '',
      usage_type: p.usage_type || '',
      estimated_value: p.estimated_value ? String(p.estimated_value) : '',
      has_budget: p.has_budget ?? null,
      is_decision_maker: p.is_decision_maker ?? null,
      has_urgency: p.has_urgency ?? null,
      has_operation: p.has_operation ?? null,
      description: p.description || '',
      temperature: p.temperature || 'warm',
      next_action: p.next_action || '',
      next_action_date: p.next_action_date || '',
      closer_name: p.closer_name || '',
      meeting_scheduled_at: p.meeting_scheduled_at || '',
      meeting_link: p.meeting_link || '',
      meeting_transcript: p.meeting_transcript || '',
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
        // Seção 1
        company_name: formData.company_name,
        contact_name: formData.contact_name,
        contact_email: formData.contact_email,
        contact_phone: formData.contact_phone || '',
        source: formData.source,
        status: formData.status,
        service_interest: formData.service_interest,
        // Seção 2
        company_size: formData.company_size,
        qualification_level: formData.qualification_level,
        usage_type: formData.usage_type,
        estimated_value: formData.estimated_value ? parseFloat(formData.estimated_value) : 0,
        has_budget: formData.has_budget,
        is_decision_maker: formData.is_decision_maker,
        has_urgency: formData.has_urgency,
        has_operation: formData.has_operation,
        // Seção 3
        description: formData.description,
        temperature: formData.temperature,
        next_action: formData.next_action,
        next_action_date: formData.next_action_date || null,
        // Seção 4
        closer_name: formData.closer_name,
        meeting_scheduled_at: formData.meeting_scheduled_at || null,
        meeting_link: formData.meeting_link,
        meeting_transcript: formData.meeting_transcript,
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
    // Bloquear movimentação para Perdido sem modal de motivo
    if (newStatus === 'lost') {
      setLossModalProspect(prospect);
      setLossForm({ reason: '', remarketing: '', notes: '' });
      return;
    }
    // Bloquear movimentação para Follow-Up sem modal de motivo
    if (newStatus === 'follow_up') {
      setFollowUpModalProspect(prospect);
      setFollowUpForm({ reason: '', next_contact_date: '', notes: '' });
      return;
    }
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

  const handleLossSubmit = async () => {
    if (!lossModalProspect || !lossForm.reason || !lossForm.remarketing) return;
    setSavingLoss(true);
    try {
      // Atualizar status para perdido
      const res = await fetch(`${apiUrl}/sales/prospects/${lossModalProspect.id}/`, {
        method: 'PATCH',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify({ status: 'lost' }),
      });
      if (!res.ok) throw new Error();

      // Registrar motivo de perda via win-loss
      await fetch(`${apiUrl}/sales/win-loss/`, {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          prospect: lossModalProspect.id,
          result: 'lost',
          reason: lossForm.reason,
          notes: `${lossForm.remarketing === 'sim' ? '[REMARKETING] ' : ''}${lossForm.notes}`,
        }),
      });

      toast.success('Lead movido para Perdido.');
      setLossModalProspect(null);
      fetchProspects();
      fetchAllProspects();
    } catch {
      toast.error('Erro ao registrar perda.');
    } finally {
      setSavingLoss(false);
    }
  };

  const handleFollowUpSubmit = async () => {
    if (!followUpModalProspect || !followUpForm.reason || !followUpForm.next_contact_date) return;
    setSavingFollowUp(true);
    try {
      const followUpLabel = FOLLOW_UP_REASONS.find(r => r.value === followUpForm.reason)?.label || followUpForm.reason;
      const res = await fetch(`${apiUrl}/sales/prospects/${followUpModalProspect.id}/`, {
        method: 'PATCH',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          status: 'follow_up',
          next_action: `[${followUpLabel}] ${followUpForm.notes}`.trim(),
          next_action_date: followUpForm.next_contact_date,
        }),
      });
      if (!res.ok) throw new Error();

      // Registrar atividade de follow-up
      await fetch(`${apiUrl}/sales/prospect-activities/`, {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify({
          prospect: followUpModalProspect.id,
          activity_type: 'other',
          subject: `Follow-Up: ${followUpLabel}`,
          description: followUpForm.notes || '',
          next_action: `Retomar contato em ${followUpForm.next_contact_date}`,
          next_action_date: followUpForm.next_contact_date,
        }),
      });

      toast.success('Lead movido para Follow-Up.');
      setFollowUpModalProspect(null);
      fetchProspects();
      fetchAllProspects();
    } catch {
      toast.error('Erro ao registrar follow-up.');
    } finally {
      setSavingFollowUp(false);
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
    if (score >= 4) return 'bg-green-100 text-green-700';
    if (score >= 2) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Funil header */}
      <div className="flex items-center justify-between mb-6">
        <div />
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

            {/* 2. Agendados */}
            <div className="card card-hover p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-5 h-5 text-purple-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide truncate">Agendados</p>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{kpiAgendados}</p>
                  <p className="text-xs text-gray-400">reuniões agendadas</p>
                </div>
              </div>
            </div>

            {/* 3. Em Andamento */}
            <div className="card card-hover p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide truncate">Em Andamento</p>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{kpiEmAndamento}</p>
                  <p className="text-xs text-gray-400">discovery + proposta</p>
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
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{kpiWonCount}</p>
                  <p className="text-xs text-[#A6864A] font-semibold tabular-nums">{formatCurrency(kpiWonValue)}</p>
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
                                {prospect.qualification_score}/5
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
                        <div className="flex items-center justify-between mb-0.5">
                          <p className="text-sm font-semibold text-gray-900">{prospect.company_name}</p>
                          {prospect.temperature && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${temperatureColors[prospect.temperature] || ''}`}>
                              {temperatureLabels[prospect.temperature] || prospect.temperature}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mb-1">{prospect.contact_name}</p>
                        {/* Badges */}
                        <div className="flex items-center gap-1 flex-wrap mb-2">
                          {prospect.service_interest && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                              {serviceInterestOptions.find(o => o.value === prospect.service_interest)?.label || prospect.service_interest}
                            </span>
                          )}
                          {prospect.qualification_score > 0 && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${qualScoreBadgeColor(prospect.qualification_score)}`}>
                              {prospect.qualification_score}/5
                            </span>
                          )}
                          {prospect.meeting_scheduled_at && (
                            <span className="flex items-center gap-0.5 text-[10px] text-indigo-600 font-medium">
                              <Calendar className="w-2.5 h-2.5" />
                              {formatDateShort(prospect.meeting_scheduled_at)}
                            </span>
                          )}
                        </div>
                        {/* Follow-Up sub-type badge + next contact */}
                        {prospect.status === 'follow_up' && prospect.next_action && (
                          <div className="mb-2">
                            {FOLLOW_UP_REASONS.map(r => {
                              if (prospect.next_action?.includes(`[${r.label}]`)) {
                                return (
                                  <span key={r.value} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.color}`}>
                                    {r.label}
                                  </span>
                                );
                              }
                              return null;
                            })}
                            {prospect.next_action_date && (
                              <p className="text-[10px] text-gray-500 mt-1">
                                Retomar: {new Date(prospect.next_action_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                              </p>
                            )}
                          </div>
                        )}
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

              {/* ══════════ SEÇÃO 1 — IDENTIFICAÇÃO ══════════ */}
              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">Seção 1 — Identificação</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelInput}>Nome completo *</label>
                    <input type="text" required value={formData.contact_name}
                      onChange={(e) => setField('contact_name', e.target.value)}
                      className="input-field" placeholder="Nome do contato" />
                  </div>
                  <div>
                    <label className={labelInput}>Empresa *</label>
                    <input type="text" required value={formData.company_name}
                      onChange={(e) => setField('company_name', e.target.value)}
                      className="input-field" placeholder="Nome da empresa" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelInput}>WhatsApp *</label>
                    <input type="text" required value={formData.contact_phone}
                      onChange={(e) => setField('contact_phone', e.target.value)}
                      className="input-field" placeholder="(11) 99999-9999" />
                  </div>
                  <div>
                    <label className={labelInput}>E-mail *</label>
                    <input type="email" required value={formData.contact_email}
                      onChange={(e) => setField('contact_email', e.target.value)}
                      className="input-field" placeholder="email@empresa.com" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelInput}>Tipo de Projeto</label>
                    <select value={formData.service_interest}
                      onChange={(e) => setField('service_interest', e.target.value)}
                      className="input-field bg-white">
                      <option value="">Selecionar</option>
                      {serviceInterestOptions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelInput}>Canal de Origem</label>
                    <select value={formData.source}
                      onChange={(e) => setField('source', e.target.value)}
                      className="input-field bg-white">
                      {sourceOptions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {editingProspect && (
                  <div>
                    <label className={labelInput}>Status</label>
                    <select value={formData.status}
                      onChange={(e) => setField('status', e.target.value)}
                      className="input-field bg-white">
                      {Object.entries(statusLabels).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* ══════════ SEÇÃO 2 — QUALIFICAÇÃO ══════════ */}
              <div className="bg-purple-50/50 border border-purple-100 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-purple-700 uppercase tracking-wider">Seção 2 — Qualificação</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelInput}>Nº de Funcionários</label>
                    <select value={formData.company_size}
                      onChange={(e) => setField('company_size', e.target.value)}
                      className="input-field bg-white">
                      <option value="">Selecionar</option>
                      <option value="small">1-10</option>
                      <option value="medium">11-50</option>
                      <option value="large">51-200</option>
                      <option value="enterprise">200+</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelInput}>Budget Declarado (R$)</label>
                    <input type="number" step="0.01" min="0"
                      value={formData.estimated_value}
                      onChange={(e) => setField('estimated_value', e.target.value)}
                      className="input-field" placeholder="0,00" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelInput}>Nível de Consciência</label>
                    <select value={formData.qualification_level}
                      onChange={(e) => setField('qualification_level', e.target.value)}
                      className="input-field bg-white">
                      <option value="">Selecionar</option>
                      <option value="2">Nível 2 — Consciente do Problema</option>
                      <option value="3">Nível 3 — Consciente da Solução</option>
                      <option value="4">Nível 4 — Consciente do Produto</option>
                    </select>
                  </div>
                  {(formData.qualification_level === '3' || formData.qualification_level === '4') && (
                    <div>
                      <label className={labelInput}>Tipo de Uso</label>
                      <select value={formData.usage_type}
                        onChange={(e) => setField('usage_type', e.target.value)}
                        className="input-field bg-white">
                        <option value="">Selecionar</option>
                        <option value="internal">Uso Interno</option>
                        <option value="commercial">Uso Comercial</option>
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <label className={labelInput}>Critérios de Qualificação</label>
                  <div className="grid grid-cols-2 gap-2">
                    <TriCheckbox label="Budget compatível (+2)" value={formData.has_budget} onChange={(v) => setField('has_budget', v)} />
                    <TriCheckbox label="Tomador de decisão (+1)" value={formData.is_decision_maker} onChange={(v) => setField('is_decision_maker', v)} />
                    <TriCheckbox label="Urgência alta (+1)" value={formData.has_urgency} onChange={(v) => setField('has_urgency', v)} />
                    <TriCheckbox label="Já tentou antes (+1)" value={formData.has_operation} onChange={(v) => setField('has_operation', v)} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Clique para alternar: — não definido · ✓ sim · ✗ não</p>
                </div>
              </div>

              {/* ══════════ SEÇÃO 3 — BRIEFING DO SDR ══════════ */}
              <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">Seção 3 — Briefing do SDR</p>
                <div>
                  <label className={labelInput}>Dor Principal (palavras do lead) *</label>
                  <textarea value={formData.description} rows={3}
                    onChange={(e) => setField('description', e.target.value)}
                    className="input-field resize-none"
                    placeholder="Descreva a dor/problema com as palavras do lead..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelInput}>Urgência Percebida</label>
                    <select value={formData.temperature}
                      onChange={(e) => setField('temperature', e.target.value)}
                      className="input-field bg-white">
                      <option value="hot">Alta</option>
                      <option value="warm">Média</option>
                      <option value="cold">Baixa</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelInput}>Próxima Ação</label>
                    <input type="text" value={formData.next_action}
                      onChange={(e) => setField('next_action', e.target.value)}
                      className="input-field" placeholder="Ex: Agendar reunião" />
                  </div>
                  <div>
                    <label className={labelInput}>Data da Ação</label>
                    <input type="date" value={formData.next_action_date}
                      onChange={(e) => setField('next_action_date', e.target.value)}
                      className="input-field" />
                  </div>
                </div>
              </div>

              {/* ══════════ SEÇÃO 4 — NOTAS DO CLOSER ══════════ */}
              {editingProspect && (
                <div className="bg-green-50/50 border border-green-100 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-bold text-green-700 uppercase tracking-wider">Seção 4 — Notas do Closer</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelInput}>Closer Responsável</label>
                      <input type="text" value={formData.closer_name}
                        onChange={(e) => setField('closer_name', e.target.value)}
                        className="input-field" placeholder="Nome do closer" />
                    </div>
                    <div>
                      <label className={labelInput}>Valor da Proposta (R$)</label>
                      <input type="number" step="0.01" min="0"
                        value={formData.estimated_value}
                        onChange={(e) => setField('estimated_value', e.target.value)}
                        className="input-field" placeholder="0,00" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelInput}>Data da Reunião</label>
                      <input type="datetime-local" value={formData.meeting_scheduled_at}
                        onChange={(e) => setField('meeting_scheduled_at', e.target.value)}
                        className="input-field" />
                    </div>
                    <div>
                      <label className={labelInput}>Link da Reunião</label>
                      <input type="url" value={formData.meeting_link}
                        onChange={(e) => setField('meeting_link', e.target.value)}
                        className="input-field" placeholder="https://meet.google.com/..." />
                    </div>
                  </div>
                  <div>
                    <label className={labelInput}>Notas da Reunião</label>
                    <textarea value={formData.meeting_transcript} rows={3}
                      onChange={(e) => setField('meeting_transcript', e.target.value)}
                      className="input-field resize-none"
                      placeholder="Resultado da reunião, escopo acordado, expectativas..." />
                  </div>
                </div>
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

      {/* ─── Modal Obrigatório — Motivo de Perda ─────────────────────────── */}
      {lossModalProspect && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-modal animate-modal-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Mover para Perdido</h2>
              <button
                onClick={() => setLossModalProspect(null)}
                className="p-1.5 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-5">
              <p className="text-xs text-red-700 font-medium">
                O preenchimento do motivo de perda é obrigatório. Sem esses dados, não é possível medir onde o funil sangra.
              </p>
            </div>

            <p className="text-sm text-gray-500 mb-4">
              Lead: <span className="font-semibold text-gray-900">{lossModalProspect.company_name}</span>
            </p>

            <div className="space-y-4">
              <div>
                <label className={labelInput}>Motivo da perda *</label>
                <select
                  value={lossForm.reason}
                  onChange={(e) => setLossForm({ ...lossForm, reason: e.target.value })}
                  className="input-field bg-white"
                  required
                >
                  <option value="">Selecione o motivo</option>
                  <option value="price">Preço</option>
                  <option value="timeline">Timing / Prazo</option>
                  <option value="no_fit">Sem fit</option>
                  <option value="competitor">Concorrente</option>
                  <option value="no_response">Sem resposta</option>
                  <option value="no_budget">Sem orçamento</option>
                  <option value="other">Outro</option>
                </select>
              </div>

              <div>
                <label className={labelInput}>Entrar em remarketing? *</label>
                <div className="flex gap-3">
                  {[['sim', 'Sim'], ['nao', 'Não']].map(([val, label]) => (
                    <label key={val} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="remarketing"
                        value={val}
                        checked={lossForm.remarketing === val}
                        onChange={(e) => setLossForm({ ...lossForm, remarketing: e.target.value })}
                        className="text-[#A6864A]"
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelInput}>Observação</label>
                <textarea
                  value={lossForm.notes}
                  onChange={(e) => setLossForm({ ...lossForm, notes: e.target.value })}
                  rows={3}
                  className="input-field resize-none"
                  placeholder="Detalhes adicionais sobre a perda..."
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setLossModalProspect(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  loading={savingLoss}
                  className="flex-1 !bg-red-600 hover:!bg-red-700"
                  onClick={handleLossSubmit}
                  disabled={!lossForm.reason || !lossForm.remarketing}
                >
                  Confirmar Perda
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal Obrigatório — Follow-Up ───────────────────────────────── */}
      {followUpModalProspect && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-modal animate-modal-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Mover para Follow-Up</h2>
              <button
                onClick={() => setFollowUpModalProspect(null)}
                className="p-1.5 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 mb-5">
              <p className="text-xs text-orange-700 font-medium">
                Informe o motivo e a data de retomada para que o lead não caia no esquecimento.
              </p>
            </div>

            <p className="text-sm text-gray-500 mb-4">
              Lead: <span className="font-semibold text-gray-900">{followUpModalProspect.company_name}</span>
            </p>

            <div className="space-y-4">
              <div>
                <label className={labelInput}>Motivo do Follow-Up *</label>
                <div className="flex flex-col gap-2">
                  {FOLLOW_UP_REASONS.map((r) => (
                    <label
                      key={r.value}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                        followUpForm.reason === r.value
                          ? 'border-[#A6864A] bg-[#A6864A]/5 ring-1 ring-[#A6864A]/20'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="followup_reason"
                        value={r.value}
                        checked={followUpForm.reason === r.value}
                        onChange={(e) => setFollowUpForm({ ...followUpForm, reason: e.target.value })}
                        className="text-[#A6864A]"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-900">{r.label}</span>
                        <p className="text-xs text-gray-400">
                          {r.value === 'nao_agendou' && 'Qualificou mas não marcou reunião'}
                          {r.value === 'nao_compareceu' && 'Agendou mas não compareceu'}
                          {r.value === 'nao_fechou' && 'Fez discovery/proposta mas não fechou'}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelInput}>Próximo contato em *</label>
                <input
                  type="date"
                  value={followUpForm.next_contact_date}
                  onChange={(e) => setFollowUpForm({ ...followUpForm, next_contact_date: e.target.value })}
                  className="input-field"
                />
              </div>

              <div>
                <label className={labelInput}>Observação</label>
                <textarea
                  value={followUpForm.notes}
                  onChange={(e) => setFollowUpForm({ ...followUpForm, notes: e.target.value })}
                  rows={2}
                  className="input-field resize-none"
                  placeholder="Contexto adicional..."
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setFollowUpModalProspect(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  loading={savingFollowUp}
                  className="flex-1"
                  onClick={handleFollowUpSubmit}
                  disabled={!followUpForm.reason || !followUpForm.next_contact_date}
                >
                  Confirmar Follow-Up
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
