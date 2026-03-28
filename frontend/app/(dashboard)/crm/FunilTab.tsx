'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, Edit, Trash2, TrendingUp, X, LayoutList,
  Kanban, ChevronDown, UserPlus, CheckCircle, Calendar, Target, GripVertical, FileText,
  Phone, Mail, MessageSquare, Monitor, Linkedin, Clock, Send,
} from 'lucide-react';
import { DndContext, DragOverlay, rectIntersection, PointerSensor, useDroppable, useSensor, useSensors, DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton, CardSkeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import FocusTrap from '@/components/ui/FocusTrap';
import { Badge } from '@/components/ui/Badge';
import { Sensitive } from '@/components/ui/Sensitive';
import { useDemoMode } from '@/components/ui/DemoContext';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { buildProposalDefaults } from '@/lib/proposalDefaults';
import api from '@/lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Activity {
  id: number;
  activity_type: string;
  subject: string;
  description: string;
  outcome: string;
  date: string;
  created_by_name: string;
}

interface Prospect {
  id: number;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  source: string;
  status: string;
  service_interest: string[];
  temperature: string;
  estimated_value: number;
  proposal_value: number | null;
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
  // follow-up
  follow_up_reason: string;
  // pre-meeting
  pre_meeting_scenario: number | null;
  // last message
  last_message: string;
  last_message_at: string | null;
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
  service_interest: string[];
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
  proposal_value: string;
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
  qualified: 'Qualificado',
  disqualified: 'Não Qualificado',
  scheduled: 'Agendado',
  pre_meeting: 'Pré-Reunião',
  no_show: 'Não Compareceu',
  meeting_done: 'Reunião Realizada',
  proposal: 'Proposta Enviada',
  won: 'Fechado',
  not_closed: 'Não Fechou',
  lost: 'Perdido',
  follow_up: 'Follow-Up',
};

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  qualifying: 'bg-yellow-100 text-yellow-800',
  qualified: 'bg-purple-100 text-purple-800',
  disqualified: 'bg-red-100 text-red-800',
  scheduled: 'bg-indigo-100 text-indigo-800',
  pre_meeting: 'bg-cyan-100 text-cyan-800',
  no_show: 'bg-rose-100 text-rose-800',
  meeting_done: 'bg-teal-100 text-teal-800',
  proposal: 'bg-amber-100 text-amber-800',
  won: 'bg-green-100 text-green-800',
  not_closed: 'bg-orange-100 text-orange-800',
  lost: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200',
  follow_up: 'bg-orange-100 text-orange-800',
};

const statusBadgeVariant: Record<string, BadgeVariant> = {
  new: 'info',
  qualifying: 'warning',
  qualified: 'purple',
  disqualified: 'error',
  scheduled: 'info',
  pre_meeting: 'info',
  no_show: 'error',
  meeting_done: 'success',
  proposal: 'gold',
  won: 'success',
  not_closed: 'warning',
  lost: 'neutral',
  follow_up: 'warning',
};

const FOLLOW_UP_REASONS = [
  { value: 'nao_agendou', label: 'Não Agendou', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'nao_compareceu', label: 'Não Compareceu', color: 'bg-orange-100 text-orange-700' },
  { value: 'nao_fechou', label: 'Não Fechou', color: 'bg-red-100 text-red-700' },
];

// Colunas do kanban — Perdido/Desqualificado/Não Qualificado só na lista
const PIPELINE_COLUMNS = [
  'new',
  'qualifying',
  'qualified',
  'scheduled',
  'pre_meeting',
  'no_show',
  'meeting_done',
  'proposal',
  'won',
  'not_closed',
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
  { value: 'software_dev',  label: 'Sistema Web' },
  { value: 'mobile',        label: 'Aplicativo Mobile' },
  { value: 'site',          label: 'Site Institucional' },
  { value: 'e_commerce',    label: 'E-commerce' },
  { value: 'landing_page',  label: 'Landing Page' },
  { value: 'automation',    label: 'Automação de Processos' },
  { value: 'ai',            label: 'Inteligência Artificial' },
  { value: 'erp',           label: 'ERP / Sistema de Gestão' },
  { value: 'integration',   label: 'Integração de Sistemas' },
  { value: 'consulting',    label: 'Consultoria Técnica' },
  { value: 'support',       label: 'Suporte e Manutenção' },
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
  service_interest: [],
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
  proposal_value: '',
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
      ? 'bg-green-100 dark:bg-green-900/30 border-green-400 dark:border-green-600/50 text-green-700 dark:text-green-300'
      : value === false
      ? 'bg-red-100 dark:bg-red-900/30 border-red-400 dark:border-red-600/50 text-red-700 dark:text-red-300'
      : 'bg-gray-100 dark:bg-gray-700 border-gray-300 text-gray-400 dark:text-gray-500';

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

// ─── Collapsible Section ─────────────────────────────────────────────────────

function Section({ title, color, defaultOpen = true, children }: {
  title: string; color: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    blue:   { bg: 'bg-blue-50/50 dark:bg-blue-900/20',     border: 'border-blue-100 dark:border-blue-800/30',     text: 'text-blue-700 dark:text-blue-300'   },
    purple: { bg: 'bg-purple-50/50 dark:bg-purple-900/20', border: 'border-purple-100 dark:border-purple-800/30', text: 'text-purple-700 dark:text-purple-300' },
    amber:  { bg: 'bg-amber-50/50 dark:bg-amber-900/20',   border: 'border-amber-100 dark:border-amber-800/30',   text: 'text-amber-700 dark:text-amber-300'   },
    green:  { bg: 'bg-green-50/50 dark:bg-green-900/20',   border: 'border-green-100 dark:border-green-800/30',   text: 'text-green-700 dark:text-green-300'   },
  };
  const { bg, border, text } = colors[color] || colors.blue;

  return (
    <div className={`${bg} border ${border} rounded-xl overflow-hidden transition-all`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-4 py-3 ${text} hover:bg-black/[0.02] transition-colors`}
      >
        <span className="text-xs font-bold uppercase tracking-wider">{title}</span>
        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`transition-all duration-200 ease-out ${open ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        <div className="px-4 pb-4 space-y-3">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Drag-and-Drop Components ────────────────────────────────────────────────

function DroppableColumn({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { type: 'column' } });

  return (
    <div
      ref={setNodeRef}
      className={`w-60 flex flex-col gap-2 transition-all duration-200 rounded-xl ${
        isOver ? 'ring-2 ring-accent-gold/40 bg-accent-gold/5' : ''
      }`}
    >
      {children}
    </div>
  );
}

function DraggableCard({ prospect, onCardClick, children }: {
  prospect: Prospect;
  onCardClick: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `prospect-${prospect.id}`,
    data: { prospect },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {/* O card em si é clicável para abrir o detalhe */}
      <div
        className="card card-hover p-3 cursor-pointer animate-stagger-in relative group/card"
        onClick={onCardClick}
      >
        {/* Drag handle — ícone visível no hover, separado do onClick do card */}
        <div
          {...listeners}
          onClick={e => e.stopPropagation()}
          className="absolute top-2 right-2 p-0.5 rounded text-gray-300 opacity-0 group-hover/card:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-10"
          title="Arrastar"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>
        {children}
      </div>
    </div>
  );
}

export default function FunilTab() {
  const toast = useToast();
  const { isDemoMode } = useDemoMode();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [draggedProspect, setDraggedProspect] = useState<Prospect | null>(null);

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
  const [viewingProspect, setViewingProspect] = useState<Prospect | null>(null);

  // Modal de proposta vinculada ao lead
  const [proposalModalProspect, setProposalModalProspect] = useState<Prospect | null>(null);
  const EMPTY_PROPOSAL_FORM = { title: '', proposal_type: 'software_dev', billing_type: 'fixed', total_value: '', valid_until: '', notes: '' };
  const [proposalForm, setProposalForm] = useState(EMPTY_PROPOSAL_FORM);
  const [savingProposal, setSavingProposal] = useState(false);

  // Modal de motivo de perda
  const [lossModalProspect, setLossModalProspect] = useState<Prospect | null>(null);
  const [lossForm, setLossForm] = useState({
    reason: '',
    remarketing: '',
    notes: '',
  });
  const [savingLoss, setSavingLoss] = useState(false);

  // Filtros avançados
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTemp, setFilterTemp] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === prospects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(prospects.map(p => p.id)));
    }
  };
  const handleBulkStatusChange = async (newStatus: string) => {
    if (selectedIds.size === 0) return;
    try {
      await Promise.all(
        Array.from(selectedIds).map(id =>
          api.patch(`/sales/prospects/${id}/`, { status: newStatus })
        )
      );
      toast.success(`${selectedIds.size} leads atualizados.`);
      setSelectedIds(new Set());
      fetchProspects();
      fetchAllProspects();
    } catch {
      toast.error('Erro ao atualizar leads.');
    }
  };

  // Modal de Follow-Up
  const [followUpModalProspect, setFollowUpModalProspect] = useState<Prospect | null>(null);
  const [followUpForm, setFollowUpForm] = useState({
    reason: '',
    next_contact_date: '',
    notes: '',
  });
  const [savingFollowUp, setSavingFollowUp] = useState(false);

  // Atividades do lead (drawer)
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [activityForm, setActivityForm] = useState({ activity_type: 'call', subject: '', description: '' });
  const [savingActivity, setSavingActivity] = useState(false);

  // Ações rápidas no drawer
  const [markingAction, setMarkingAction] = useState<string | null>(null);

  // ─── Data fetching ────────────────────────────────────────────────────────

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), page_size: String(PAGE_SIZE) };
      if (search) params.search = search;
      const data = await api.get<{ results?: Prospect[]; count?: number }>('/sales/prospects/', params);
      setProspects(Array.isArray(data.results ?? data) ? (data.results ?? data) as Prospect[] : []);
      setTotal(data.count ?? (data.results ?? data as unknown as Prospect[]).length);
    } catch {
      toast.error('Erro ao carregar prospects');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  const fetchAllProspects = useCallback(async () => {
    try {
      const data = await api.get<{ results?: Prospect[] }>('/sales/prospects/', { page_size: '500' });
      setAllProspects(Array.isArray(data.results ?? data) ? (data.results ?? data) as Prospect[] : []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchProspects(); }, [fetchProspects]);
  // Always keep allProspects fresh for KPIs + pipeline
  useEffect(() => { fetchAllProspects(); }, [fetchAllProspects]);

  // Busca atividades sempre que um lead é aberto no drawer
  useEffect(() => {
    if (!viewingProspect) { setActivities([]); setShowActivityForm(false); return; }
    setLoadingActivities(true);
    api.get<{ results?: Activity[] }>('/sales/prospect-activities/', { prospect: String(viewingProspect.id) })
      .then(data => {
        const list = data.results ?? data;
        setActivities(Array.isArray(list) ? list as Activity[] : []);
      })
      .catch(() => {})
      .finally(() => setLoadingActivities(false));
  }, [viewingProspect?.id]);

  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  // ─── Keyboard shortcuts ─────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+N or Cmd+N — new lead
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        openNewModal();
      }
      // Ctrl+K or Cmd+K — focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchEl = document.querySelector<HTMLInputElement>('input[placeholder*="Buscar"]');
        searchEl?.focus();
      }
      // Escape — close modals
      if (e.key === 'Escape') {
        if (lossModalProspect) setLossModalProspect(null);
        else if (followUpModalProspect) setFollowUpModalProspect(null);
        else if (showModal) setShowModal(false);
        else if (viewingProspect) setViewingProspect(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showModal, lossModalProspect, followUpModalProspect]);

  // ─── Drag-and-drop handlers ──────────────────────────────────────────────

  const handleDragStart = (event: DragStartEvent) => {
    const { prospect } = event.active.data.current as { prospect: Prospect };
    setDraggedProspect(prospect);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedProspect(null);
    const { active, over } = event;
    if (!over) return;

    const prospect = (active.data.current as { prospect: Prospect }).prospect;
    let targetStatus = over.id as string;

    // Se caiu em cima de outro card (id = "prospect-123"), resolve a coluna pelo status desse card
    if (targetStatus.startsWith('prospect-')) {
      const targetId = Number(targetStatus.replace('prospect-', ''));
      const targetProspect = allProspects.find(p => p.id === targetId);
      if (!targetProspect) return;
      targetStatus = targetProspect.status;
    }

    if (!PIPELINE_COLUMNS.includes(targetStatus)) return;
    if (prospect.status === targetStatus) return;

    handleStatusChange(prospect, targetStatus);
  };

  // ─── KPI computations (from full dataset) ────────────────────────────────

  const kpiSource = allProspects.length > 0 ? allProspects : prospects;

  const kpiLeads = kpiSource.filter(p =>
    p.status === 'new' || p.status === 'qualifying'
  ).length;

  const kpiAgendados = kpiSource.filter(p =>
    p.status === 'scheduled' || p.status === 'pre_meeting'
  ).length;

  const kpiEmAndamento = kpiSource.filter(p =>
    p.status === 'scheduled' || p.status === 'pre_meeting' || p.status === 'meeting_done' || p.status === 'proposal'
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
      service_interest: Array.isArray(p.service_interest) ? p.service_interest : (p.service_interest ? [p.service_interest as unknown as string] : []),
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
      proposal_value: p.proposal_value != null ? String(p.proposal_value) : '',
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
        proposal_value: formData.proposal_value ? parseFloat(formData.proposal_value) : null,
        meeting_scheduled_at: formData.meeting_scheduled_at || null,
        meeting_link: formData.meeting_link,
        meeting_transcript: formData.meeting_transcript,
      };

      if (editingProspect) {
        await api.patch(`/sales/prospects/${editingProspect.id}/`, payload);
      } else {
        await api.post('/sales/prospects/', payload);
      }
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
    // Optimistic UI — atualiza local antes da API
    const prevStatus = prospect.status;
    setAllProspects(prev => prev.map(p => p.id === prospect.id ? { ...p, status: newStatus } : p));
    setProspects(prev => prev.map(p => p.id === prospect.id ? { ...p, status: newStatus } : p));
    setUpdatingStatus(prospect.id);
    try {
      await api.patch(`/sales/prospects/${prospect.id}/`, { status: newStatus });
      toast.success(`Status atualizado para "${statusLabels[newStatus]}"`);
      fetchProspects();
      fetchAllProspects();
    } catch {
      // Rollback on failure
      setAllProspects(prev => prev.map(p => p.id === prospect.id ? { ...p, status: prevStatus } : p));
      setProspects(prev => prev.map(p => p.id === prospect.id ? { ...p, status: prevStatus } : p));
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
      await api.patch(`/sales/prospects/${lossModalProspect.id}/`, { status: 'lost' });

      // Registrar motivo de perda via win-loss
      await api.post('/sales/win-loss/', {
        prospect: lossModalProspect.id,
        result: 'lost',
        reason: lossForm.reason,
        notes: `${lossForm.remarketing === 'sim' ? '[REMARKETING] ' : ''}${lossForm.notes}`,
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
      await api.patch(`/sales/prospects/${followUpModalProspect.id}/`, {
        status: 'follow_up',
        follow_up_reason: followUpForm.reason,
        next_action: `[${followUpLabel}] ${followUpForm.notes}`.trim(),
        next_action_date: followUpForm.next_contact_date,
      });

      // Registrar atividade de follow-up
      await api.post('/sales/prospect-activities/', {
        prospect: followUpModalProspect.id,
        activity_type: 'other',
        subject: `Follow-Up: ${followUpLabel}`,
        description: followUpForm.notes || '',
        next_action: `Retomar contato em ${followUpForm.next_contact_date}`,
        next_action_date: followUpForm.next_contact_date,
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

  const handleSaveProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposalModalProspect) return;
    setSavingProposal(true);
    try {
      const body: Record<string, unknown> = {
        prospect: proposalModalProspect.id,
        title: proposalForm.title,
        proposal_type: proposalForm.proposal_type,
        billing_type: proposalForm.billing_type,
        notes: proposalForm.notes,
      };
      if (proposalForm.total_value) body.total_value = proposalForm.total_value;
      if (proposalForm.valid_until) body.valid_until = proposalForm.valid_until;
      await api.post('/sales/proposals/', body);
      toast.success('Proposta criada! Veja na aba Propostas.');
      setProposalModalProspect(null);
    } catch {
      toast.error('Erro ao criar proposta.');
    } finally {
      setSavingProposal(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/sales/prospects/${confirmDelete.id}/`);
      toast.success(`"${confirmDelete.company_name}" removido.`);
      setConfirmDelete(null);
      fetchProspects();
      fetchAllProspects();
    } catch {
      toast.error('Erro ao excluir prospect.');
    }
  };

  const handleQuickAction = async (prospect: Prospect, action: 'mark_attended' | 'mark_no_show' | 'mark_ebook_sent') => {
    setMarkingAction(action);
    try {
      const updated = await api.post<Prospect>(`/sales/prospects/${prospect.id}/${action}/`, {});
      const labels: Record<string, string> = {
        mark_attended: 'Reunião marcada como realizada.',
        mark_no_show: 'Lead marcado como não compareceu.',
        mark_ebook_sent: 'E-book marcado como enviado.',
      };
      toast.success(labels[action]);
      setViewingProspect(updated);
      fetchProspects();
      fetchAllProspects();
    } catch {
      toast.error('Erro ao executar ação.');
    } finally {
      setMarkingAction(null);
    }
  };

  const handleSaveActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewingProspect || !activityForm.subject.trim()) return;
    setSavingActivity(true);
    try {
      await api.post('/sales/prospect-activities/', {
        prospect: viewingProspect.id,
        activity_type: activityForm.activity_type,
        subject: activityForm.subject,
        description: activityForm.description,
      });
      toast.success('Atividade registrada.');
      setActivityForm({ activity_type: 'call', subject: '', description: '' });
      setShowActivityForm(false);
      // Refresh activities
      const data = await api.get<{ results?: Activity[] }>('/sales/prospect-activities/', { prospect: String(viewingProspect.id) });
      const list = data.results ?? data;
      setActivities(Array.isArray(list) ? list as Activity[] : []);
    } catch {
      toast.error('Erro ao registrar atividade.');
    } finally {
      setSavingActivity(false);
    }
  };

  // ─── Misc ─────────────────────────────────────────────────────────────────

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const labelInput = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5';

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
          <div className="flex gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-1 shadow-card">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all duration-150 ${viewMode === 'list' ? 'bg-accent-gold text-white shadow-sm' : 'text-gray-400 dark:text-gray-500 hover:text-gray-700'}`}
              title="Lista"
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('pipeline')}
              className={`p-2 rounded-lg transition-all duration-150 ${viewMode === 'pipeline' ? 'bg-accent-gold text-white shadow-sm' : 'text-gray-400 dark:text-gray-500 hover:text-gray-700'}`}
              title="Pipeline"
            >
              <Kanban className="w-4 h-4" />
            </button>
          </div>
          <Button onClick={openNewModal}>
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Novo Lead</span>
          </Button>
        </div>
      </div>

      {/* ─── KPI Cards ─────────────────────────────────────────────────────── */}
      {(() => {
        const kpiTotal = kpiLeads + kpiAgendados + kpiEmAndamento + kpiWonCount;
        const kpiCards = [
          { label: 'Leads', value: kpiLeads, icon: UserPlus, bg: 'bg-blue-50', color: 'text-blue-600', barColor: 'bg-blue-500' },
          { label: 'Agendados', value: kpiAgendados, icon: Calendar, bg: 'bg-purple-50', color: 'text-purple-600', barColor: 'bg-purple-500' },
          { label: 'Em Andamento', value: kpiEmAndamento, icon: CheckCircle, bg: 'bg-indigo-50', color: 'text-indigo-600', barColor: 'bg-indigo-500' },
          { label: 'Fechados', value: kpiWonCount, icon: TrendingUp, bg: 'bg-green-50', color: 'text-green-600', barColor: 'bg-green-500', extra: kpiWonValue > 0 ? <Sensitive>{formatCurrency(kpiWonValue)}</Sensitive> : undefined },
        ];
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
            ) : (
              kpiCards.map(({ label, value, icon: Icon, bg, color, barColor, extra }) => (
                <div key={label} className="card card-hover p-4 group">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110`}>
                      <Icon className={`w-5 h-5 ${color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide truncate">{label}</p>
                      <div className="flex items-baseline gap-2">
                        <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums"><Sensitive>{value}</Sensitive></p>
                        {extra && <p className="text-xs text-accent-gold font-semibold tabular-nums">{extra}</p>}
                      </div>
                    </div>
                  </div>
                  {/* Funnel progress bar */}
                  <div className="w-full h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${barColor} rounded-full transition-all duration-700 ease-out`}
                      style={{ width: kpiTotal > 0 ? `${(value / kpiTotal) * 100}%` : '0%' }}
                    />
                  </div>
                  {kpiTotal > 0 && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 tabular-nums">{((value / kpiTotal) * 100).toFixed(0)}% do funil</p>
                  )}
                </div>
              ))
            )}
          </div>
        );
      })()}

      {/* ─── List View ─────────────────────────────────────────────────────── */}
      {viewMode === 'list' && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  placeholder="Buscar leads..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="input-field pl-9"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                  showFilters || filterStatus || filterTemp
                    ? 'bg-accent-gold/10 border-accent-gold/30 text-accent-gold'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'
                }`}
              >
                <Target className="w-3.5 h-3.5" />
                Filtros
                {(filterStatus || filterTemp) && (
                  <span className="w-4 h-4 bg-accent-gold text-white rounded-full text-[10px] flex items-center justify-center">
                    {[filterStatus, filterTemp].filter(Boolean).length}
                  </span>
                )}
              </button>
            </div>

            {/* Filtros avançados */}
            {showFilters && (
              <div className="flex items-center gap-2 flex-wrap animate-fade-in">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 focus:ring-1 focus:ring-accent-gold/30"
                >
                  <option value="">Todos os status</option>
                  {Object.entries(statusLabels).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                <select
                  value={filterTemp}
                  onChange={(e) => setFilterTemp(e.target.value)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 focus:ring-1 focus:ring-accent-gold/30"
                >
                  <option value="">Todas as temperaturas</option>
                  <option value="hot">Quente</option>
                  <option value="warm">Morno</option>
                  <option value="cold">Frio</option>
                </select>
                {(filterStatus || filterTemp) && (
                  <button
                    onClick={() => { setFilterStatus(''); setFilterTemp(''); }}
                    className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 transition-colors"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            )}

            {/* Bulk actions bar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 bg-accent-gold/5 border border-accent-gold/20 rounded-lg px-3 py-2 animate-fade-in">
                <span className="text-xs font-medium text-accent-gold">{selectedIds.size} selecionado(s)</span>
                <select
                  onChange={(e) => { if (e.target.value) handleBulkStatusChange(e.target.value); e.target.value = ''; }}
                  className="text-xs px-2 py-1 rounded border border-accent-gold/30 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300"
                  defaultValue=""
                >
                  <option value="" disabled>Mover para...</option>
                  {Object.entries(statusLabels).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 ml-auto"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>

          {/* Mobile card view */}
          <div className="md:hidden">
            {loading ? (
              <div className="p-4"><TableSkeleton rows={4} cols={2} /></div>
            ) : prospects.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-14 h-14 bg-gray-50 dark:bg-gray-700/50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Target className="w-7 h-7 text-gray-300" />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum prospect encontrado</p>
                <button onClick={openNewModal} className="mt-2 text-xs font-semibold text-accent-gold">+ Novo Lead</button>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 dark:divide-gray-700">
                {prospects.map(prospect => (
                  <div key={prospect.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50/60 transition-colors">
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm"><Sensitive>{prospect.company_name}</Sensitive></p>
                        <p className="text-xs text-gray-400 dark:text-gray-500"><Sensitive>{prospect.contact_name}</Sensitive> · <Sensitive>{prospect.contact_email}</Sensitive></p>
                      </div>
                      {prospect.temperature && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${temperatureColors[prospect.temperature] || ''}`}>
                          {temperatureLabels[prospect.temperature]}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColors[prospect.status] || 'bg-gray-100 dark:bg-gray-700'}`}>
                        {statusLabels[prospect.status]}
                      </span>
                      <span className="text-xs font-semibold text-accent-gold tabular-nums"><Sensitive>{formatCurrency(prospect.estimated_value)}</Sensitive></span>
                      {prospect.days_since_created > 0 && (
                        <span className={`text-[10px] ${prospect.days_since_created > 14 ? 'text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>{prospect.days_since_created}d</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-2 justify-end">
                      <button onClick={() => openEditModal(prospect)} className="p-1.5 text-gray-300 hover:text-accent-gold rounded-lg" aria-label="Editar"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => setConfirmDelete(prospect)} className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg" aria-label="Excluir"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Desktop table view */}
          <div className="overflow-x-auto hidden md:block">
            {loading ? (
              <TableSkeleton rows={6} cols={6} />
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/80 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                    <th className="px-3 py-3 w-8">
                      <input type="checkbox" checked={selectedIds.size === prospects.length && prospects.length > 0}
                        onChange={toggleSelectAll} className="w-3.5 h-3.5 rounded text-accent-gold focus:ring-accent-gold/30" />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Empresa</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Contato</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Origem</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Valor Est.</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {prospects.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-16 text-center">
                        <div className="flex flex-col items-center">
                          <div className="w-14 h-14 bg-gray-50 dark:bg-gray-700/50 rounded-2xl flex items-center justify-center mb-3">
                            <Target className="w-7 h-7 text-gray-300" />
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Nenhum prospect encontrado</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Tente ajustar a busca ou adicione um novo lead</p>
                          <button onClick={openNewModal} className="mt-3 text-xs font-semibold text-accent-gold hover:text-accent-gold-dark transition-colors">
                            + Novo Lead
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    prospects.map((prospect) => (
                      <tr key={prospect.id} onClick={() => setViewingProspect(prospect)} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50/60 transition-colors cursor-pointer ${selectedIds.has(prospect.id) ? 'bg-accent-gold/5' : ''}`}>
                        <td className="px-3 py-3 w-8" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={selectedIds.has(prospect.id)}
                            onChange={() => toggleSelect(prospect.id)} className="w-3.5 h-3.5 rounded text-accent-gold focus:ring-accent-gold/30" />
                        </td>
                        {/* Empresa + qualif badges */}
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm"><Sensitive>{prospect.company_name}</Sensitive></p>
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
                          <p className="text-sm text-gray-800 dark:text-gray-100"><Sensitive>{prospect.contact_name}</Sensitive></p>
                          <p className="text-xs text-gray-400 dark:text-gray-500"><Sensitive>{prospect.contact_email}</Sensitive></p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 capitalize">
                          {sourceOptions.find(s => s.value === prospect.source)?.label ?? prospect.source}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                          <Sensitive>{formatCurrency(prospect.estimated_value)}</Sensitive>
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="relative inline-block group">
                            <button
                              disabled={updatingStatus === prospect.id}
                              className={`flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-all hover:shadow-sm hover:ring-1 hover:ring-black/5 disabled:opacity-50 ${statusColors[prospect.status] || 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100'}`}
                            >
                              {updatingStatus === prospect.id ? (
                                <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <>
                                  {statusLabels[prospect.status]}
                                  <ChevronDown className="w-3 h-3 opacity-50" />
                                </>
                              )}
                            </button>
                            <div className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 py-1 z-20 min-w-[160px] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150">
                              {Object.entries(statusLabels).map(([val, label]) => (
                                <button
                                  key={val}
                                  onClick={() => handleStatusChange(prospect, val)}
                                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
                                    prospect.status === val
                                      ? 'bg-gray-50 dark:bg-gray-700/50 font-semibold text-gray-900 dark:text-gray-100'
                                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                  }`}
                                >
                                  <span aria-hidden="true" className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[val]?.split(' ')[0] || 'bg-gray-200'}`} />
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => openEditModal(prospect)}
                              className="p-1.5 text-gray-300 hover:text-accent-gold transition-colors rounded-lg hover:bg-accent-gold/5"
                              aria-label="Editar"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setConfirmDelete(prospect)}
                              className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                              aria-label="Excluir"
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
        <DndContext sensors={sensors} collisionDetection={rectIntersection} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {PIPELINE_COLUMNS.map((status) => {
              const col = allProspects.filter(p => p.status === status);
              const colValue = col.reduce((acc, p) => acc + (p.estimated_value || 0), 0);
              const colIds = col.map(p => `prospect-${p.id}`);
              return (
                <DroppableColumn key={status} id={status}>
                  {/* Column header */}
                  <div className="flex items-center justify-between px-3 py-2.5 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-card">
                    <Badge variant={statusBadgeVariant[status] || 'neutral'} dot>
                      {statusLabels[status]}
                    </Badge>
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-semibold">{col.length}</span>
                  </div>
                  {col.length > 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 px-1 font-medium tabular-nums"><Sensitive>{formatCurrency(colValue)}</Sensitive></p>
                  )}
                  {/* Cards */}
                  <SortableContext items={colIds} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-2 min-h-[60px]">
                    {col.map(prospect => (
                      <DraggableCard key={prospect.id} prospect={prospect} onCardClick={() => setViewingProspect(prospect)}>
                      <div>
                        <div className="flex items-center justify-between mb-0.5">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100"><Sensitive>{prospect.company_name}</Sensitive></p>
                          {prospect.temperature && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${temperatureColors[prospect.temperature] || ''}`}>
                              {temperatureLabels[prospect.temperature] || prospect.temperature}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mb-1"><Sensitive>{prospect.contact_name}</Sensitive></p>
                        {/* Badges */}
                        <div className="flex items-center gap-1 flex-wrap mb-2">
                          {Array.isArray(prospect.service_interest) && prospect.service_interest.length > 0
                            ? prospect.service_interest.map(s => (
                                <span key={s} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                                  {serviceInterestOptions.find(o => o.value === s)?.label || s}
                                </span>
                              ))
                            : null
                          }
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
                        {/* Follow-Up sub-type badge + next contact */}
                        {(prospect.status === 'follow_up' || prospect.status === 'no_show' || prospect.status === 'not_closed') && (prospect.follow_up_reason || prospect.next_action) && (
                          <div className="mb-2">
                            {FOLLOW_UP_REASONS.map(r => {
                              if (prospect.follow_up_reason === r.value || prospect.next_action?.includes(`[${r.label}]`)) {
                                return (
                                  <span key={r.value} className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.color}`}>
                                    {r.label}
                                  </span>
                                );
                              }
                              return null;
                            })}
                            {prospect.next_action_date && (
                              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                                Retomar: {new Date(prospect.next_action_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                              </p>
                            )}
                          </div>
                        )}
                        {/* Score bar */}
                        {prospect.qualification_score > 0 && (
                          <div className="mb-2">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[10px] text-gray-400 dark:text-gray-500">Score</span>
                              <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{prospect.qualification_score}/4</span>
                            </div>
                            <div className="w-full h-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  prospect.qualification_score >= 4 ? 'bg-green-500' :
                                  prospect.qualification_score >= 2 ? 'bg-yellow-500' : 'bg-red-400'
                                }`}
                                style={{ width: `${(prospect.qualification_score / 4) * 100}%` }}
                              />
                            </div>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-accent-gold tabular-nums">
                              <Sensitive>{formatCurrency(prospect.estimated_value)}</Sensitive>
                            </span>
                            {prospect.days_since_created > 0 && (
                              <span className={`text-[10px] tabular-nums ${prospect.days_since_created > 14 ? 'text-red-400' : prospect.days_since_created > 7 ? 'text-yellow-500' : 'text-gray-400 dark:text-gray-500'}`}>
                                {prospect.days_since_created}d
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); openEditModal(prospect); }}
                              className="p-1 text-gray-300 hover:text-accent-gold transition-colors rounded"
                              aria-label="Editar"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmDelete(prospect); }}
                              className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded"
                              aria-label="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                      </DraggableCard>
                    ))}
                  </div>
                  </SortableContext>
                  {col.length === 0 && (
                    <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center">
                      <div className="w-10 h-10 bg-gray-50 dark:bg-gray-700/50 rounded-full flex items-center justify-center mx-auto mb-2">
                        <Target className="w-5 h-5 text-gray-300" />
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">Nenhum lead nesta etapa</p>
                      {status === 'new' && (
                        <button onClick={openNewModal} className="text-[10px] text-accent-gold font-semibold mt-2 hover:underline">
                          + Adicionar lead
                        </button>
                      )}
                    </div>
                  )}
                </DroppableColumn>
              );
            })}
          </div>
        </div>
        {/* Drag overlay — ghost card while dragging */}
        <DragOverlay>
          {draggedProspect && (
            <div className="card p-3 w-60 shadow-xl ring-2 ring-accent-gold/20 rotate-2 opacity-90">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100"><Sensitive>{draggedProspect.company_name}</Sensitive></p>
              <p className="text-xs text-gray-400 dark:text-gray-500"><Sensitive>{draggedProspect.contact_name}</Sensitive></p>
              <p className="text-xs font-bold text-accent-gold mt-1"><Sensitive>{formatCurrency(draggedProspect.estimated_value)}</Sensitive></p>
            </div>
          )}
        </DragOverlay>
        </DndContext>
      )}

      {/* ─── Modal (create / edit) ─────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <FocusTrap onClose={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto shadow-modal animate-modal-in">
            {/* Modal header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {editingProspect ? 'Editar Prospect' : 'Novo Prospect'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
                aria-label="Fechar"
              >
                <X className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">

              {/* ══════════ SEÇÃO 1 — IDENTIFICAÇÃO ══════════ */}
              <Section title="Seção 1 — Identificação" color="blue">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelInput}>Nome completo *</label>
                    <input type="text" required value={formData.contact_name}
                      onChange={(e) => setField('contact_name', e.target.value)}
                      className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} placeholder="Nome do contato" />
                  </div>
                  <div>
                    <label className={labelInput}>Empresa *</label>
                    <input type="text" required value={formData.company_name}
                      onChange={(e) => setField('company_name', e.target.value)}
                      className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} placeholder="Nome da empresa" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelInput}>WhatsApp *</label>
                    <input type="text" required value={formData.contact_phone}
                      onChange={(e) => setField('contact_phone', e.target.value)}
                      className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} placeholder="(11) 99999-9999" />
                  </div>
                  <div>
                    <label className={labelInput}>E-mail *</label>
                    <input type="email" required value={formData.contact_email}
                      onChange={(e) => setField('contact_email', e.target.value)}
                      className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} placeholder="email@empresa.com" />
                  </div>
                </div>
                <div>
                  <label className={labelInput}>Tipo de Projeto (múltipla seleção)</label>
                  <MultiSelect
                    options={serviceInterestOptions}
                    value={formData.service_interest}
                    onChange={(v) => setField('service_interest', v)}
                    placeholder="Selecionar tipo(s) de projeto..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelInput}>Canal de Origem</label>
                    <select value={formData.source}
                      onChange={(e) => setField('source', e.target.value)}
                      className="input-field bg-white dark:bg-gray-800">
                      {sourceOptions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelInput}>Etapa do Funil</label>
                    <select value={formData.status}
                      onChange={(e) => setField('status', e.target.value)}
                      className="input-field bg-white dark:bg-gray-800">
                      {Object.entries(statusLabels).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </Section>

              {/* ══════════ SEÇÃO 2 — QUALIFICAÇÃO ══════════ */}
              <Section title="Seção 2 — Qualificação" color="purple">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelInput}>Nº de Funcionários</label>
                    <select value={formData.company_size}
                      onChange={(e) => setField('company_size', e.target.value)}
                      className="input-field bg-white dark:bg-gray-800">
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
                      className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} placeholder="0,00" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelInput}>Nível de Consciência</label>
                    <select value={formData.qualification_level}
                      onChange={(e) => setField('qualification_level', e.target.value)}
                      className="input-field bg-white dark:bg-gray-800">
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
                        className="input-field bg-white dark:bg-gray-800">
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
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Clique para alternar: — não definido · ✓ sim · ✗ não</p>
                </div>
              </Section>

              {/* ══════════ SEÇÃO 3 — BRIEFING DO SDR ══════════ */}
              <Section title="Seção 3 — Briefing do SDR" color="amber">
                <div>
                  <label className={labelInput}>Dor Principal (palavras do lead) *</label>
                  <textarea value={formData.description} rows={3}
                    onChange={(e) => setField('description', e.target.value)}
                    className={`input-field resize-none ${isDemoMode ? 'sensitive-blur' : ''}`}
                    placeholder="Descreva a dor/problema com as palavras do lead..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelInput}>Urgência Percebida</label>
                    <select value={formData.temperature}
                      onChange={(e) => setField('temperature', e.target.value)}
                      className="input-field bg-white dark:bg-gray-800">
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
                      className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} placeholder="Ex: Agendar reunião" />
                  </div>
                  <div>
                    <label className={labelInput}>Data da Ação</label>
                    <input type="date" value={formData.next_action_date}
                      onChange={(e) => setField('next_action_date', e.target.value)}
                      className="input-field" />
                  </div>
                </div>
              </Section>

              {/* ══════════ SEÇÃO 4 — NOTAS DO CLOSER ══════════ */}
              {editingProspect && (
                <Section title="Seção 4 — Notas do Closer" color="green" defaultOpen={false}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelInput}>Closer Responsável</label>
                      <input type="text" value={formData.closer_name}
                        onChange={(e) => setField('closer_name', e.target.value)}
                        className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} placeholder="Nome do closer" />
                    </div>
                    <div>
                      <label className={labelInput}>Valor da Proposta (R$)</label>
                      <input type="number" step="0.01" min="0"
                        value={formData.proposal_value}
                        onChange={(e) => setField('proposal_value', e.target.value)}
                        className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} placeholder="0,00" />
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
                        className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} placeholder="https://meet.google.com/..." />
                    </div>
                  </div>
                  <div>
                    <label className={labelInput}>Notas da Reunião</label>
                    <textarea value={formData.meeting_transcript} rows={3}
                      onChange={(e) => setField('meeting_transcript', e.target.value)}
                      className={`input-field resize-none ${isDemoMode ? 'sensitive-blur' : ''}`}
                      placeholder="Resultado da reunião, escopo acordado, expectativas..." />
                  </div>
                </Section>
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
          </FocusTrap>
        </div>
      )}

      {/* ─── Painel de Detalhe do Prospect ─────────────────────────────────── */}
      {viewingProspect && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40 animate-fade-in"
            onClick={() => setViewingProspect(null)}
          />
          {/* Drawer */}
          <div className="fixed right-0 top-0 h-full w-full max-w-[480px] bg-white dark:bg-gray-900 shadow-2xl z-50 flex flex-col animate-slide-right">

            {/* ── Header fixo ──────────────────────────────────────────────── */}
            <div className="border-b border-gray-100 dark:border-gray-800 p-6 shrink-0">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">
                    <Sensitive>{viewingProspect.company_name}</Sensitive>
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    <Sensitive>{viewingProspect.contact_name}</Sensitive>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => { setProposalForm(buildProposalDefaults(viewingProspect)); setProposalModalProspect(viewingProspect); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" /> Proposta
                  </button>
                  <button
                    onClick={() => { setViewingProspect(null); openEditModal(viewingProspect); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-gold text-white rounded-lg text-sm font-medium hover:bg-accent-gold-dark transition-colors"
                  >
                    <Edit className="w-3.5 h-3.5" /> Editar
                  </button>
                  <button
                    onClick={() => setViewingProspect(null)}
                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors"
                    aria-label="Fechar"
                  >
                    <X className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                  </button>
                </div>
              </div>

              {/* Status + temperatura + valor */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[viewingProspect.status] || 'bg-gray-100 text-gray-700'}`}>
                  {statusLabels[viewingProspect.status]}
                </span>
                {viewingProspect.temperature && (
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${temperatureColors[viewingProspect.temperature] || ''}`}>
                    {temperatureLabels[viewingProspect.temperature]}
                  </span>
                )}
                {viewingProspect.qualification_score > 0 && (
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${qualScoreBadgeColor(viewingProspect.qualification_score)}`}>
                    Score {viewingProspect.qualification_score}/4
                  </span>
                )}
                <span className="ml-auto text-lg font-bold text-accent-gold tabular-nums">
                  <Sensitive>{formatCurrency(viewingProspect.estimated_value)}</Sensitive>
                </span>
              </div>
            </div>

            {/* ── Conteúdo rolável ─────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">

              {/* Tipo de Projeto */}
              {Array.isArray(viewingProspect.service_interest) && viewingProspect.service_interest.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Tipo de Projeto</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {viewingProspect.service_interest.map(s => (
                      <span key={s} className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200">
                        {serviceInterestOptions.find(o => o.value === s)?.label || s}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* Valores */}
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Valores</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide font-semibold mb-0.5">Budget Declarado</p>
                    <p className="text-sm font-bold text-gray-700 dark:text-gray-200 tabular-nums">
                      <Sensitive>{formatCurrency(viewingProspect.estimated_value)}</Sensitive>
                    </p>
                  </div>
                  <div className={`rounded-xl p-3 ${viewingProspect.proposal_value ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-gray-50 dark:bg-gray-800'}`}>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide font-semibold mb-0.5">Valor da Proposta</p>
                    <p className={`text-sm font-bold tabular-nums ${viewingProspect.proposal_value ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-600'}`}>
                      {viewingProspect.proposal_value
                        ? <Sensitive>{formatCurrency(viewingProspect.proposal_value)}</Sensitive>
                        : 'Não definido'}
                    </p>
                  </div>
                </div>
              </section>

              {/* Contato */}
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">Contato</h3>
                <div className="space-y-2">
                  {viewingProspect.contact_phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400 dark:text-gray-500 w-20 shrink-0">WhatsApp</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100"><Sensitive>{viewingProspect.contact_phone}</Sensitive></span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400 dark:text-gray-500 w-20 shrink-0">E-mail</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100"><Sensitive>{viewingProspect.contact_email}</Sensitive></span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400 dark:text-gray-500 w-20 shrink-0">Canal</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{sourceOptions.find(s => s.value === viewingProspect.source)?.label || viewingProspect.source}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gray-400 dark:text-gray-500 w-20 shrink-0">No funil há</span>
                    <span className={`font-medium ${viewingProspect.days_since_created > 14 ? 'text-red-500' : 'text-gray-900 dark:text-gray-100'}`}>{viewingProspect.days_since_created} dias</span>
                  </div>
                  {viewingProspect.assigned_to_name && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400 dark:text-gray-500 w-20 shrink-0">Responsável</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{viewingProspect.assigned_to_name}</span>
                    </div>
                  )}
                </div>
              </section>

              {/* Qualificação */}
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">Qualificação</h3>
                <div className="space-y-2">
                  {viewingProspect.qualification_level && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400 dark:text-gray-500 w-20 shrink-0">Nível</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {viewingProspect.qualification_level === '2' ? 'N2 — Consciente do Problema' :
                         viewingProspect.qualification_level === '3' ? 'N3 — Consciente da Solução' :
                         'N4 — Consciente do Produto'}
                      </span>
                    </div>
                  )}
                  {viewingProspect.company_size && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400 dark:text-gray-500 w-20 shrink-0">Empresa</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {viewingProspect.company_size === 'small' ? '1–10 func.' :
                         viewingProspect.company_size === 'medium' ? '11–50 func.' :
                         viewingProspect.company_size === 'large' ? '51–200 func.' : '200+ func.'}
                      </span>
                    </div>
                  )}
                  {viewingProspect.usage_type && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-400 dark:text-gray-500 w-20 shrink-0">Uso</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{viewingProspect.usage_type === 'internal' ? 'Uso Interno' : 'Uso Comercial'}</span>
                    </div>
                  )}
                </div>
                {/* Critérios */}
                {(viewingProspect.has_budget !== null || viewingProspect.is_decision_maker !== null || viewingProspect.has_urgency !== null || viewingProspect.has_operation !== null) && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    {[
                      { label: 'Budget compatível', val: viewingProspect.has_budget },
                      { label: 'Tomador de decisão', val: viewingProspect.is_decision_maker },
                      { label: 'Urgência alta', val: viewingProspect.has_urgency },
                      { label: 'Já tentou antes', val: viewingProspect.has_operation },
                    ].map(({ label, val }) => val !== null && (
                      <div key={label} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                        val === true ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-100 dark:border-green-800/30' :
                        'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-100 dark:border-red-800/30'
                      }`}>
                        <span className="font-bold">{val ? '✓' : '✗'}</span>
                        {label}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Briefing SDR */}
              {viewingProspect.description && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Dor / Briefing</h3>
                  <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 rounded-xl p-3">
                    <Sensitive>{viewingProspect.description}</Sensitive>
                  </p>
                </section>
              )}

              {/* Próxima ação */}
              {viewingProspect.next_action && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Próxima Ação</h3>
                  <div className="flex items-start gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-gray-400 dark:text-gray-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-gray-900 dark:text-gray-100">{viewingProspect.next_action}</p>
                      {viewingProspect.next_action_date && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {new Date(viewingProspect.next_action_date + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
                        </p>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {/* Reunião */}
              {(viewingProspect.closer_name || viewingProspect.meeting_scheduled_at || viewingProspect.meeting_transcript) && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">Reunião / Closer</h3>
                  <div className="space-y-2">
                    {viewingProspect.closer_name && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-400 dark:text-gray-500 w-20 shrink-0">Closer</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">{viewingProspect.closer_name}</span>
                      </div>
                    )}
                    {viewingProspect.meeting_scheduled_at && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-400 dark:text-gray-500 w-20 shrink-0">Data</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">{formatDateShort(viewingProspect.meeting_scheduled_at)}</span>
                      </div>
                    )}
                    {viewingProspect.meeting_link && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-400 dark:text-gray-500 w-20 shrink-0">Link</span>
                        <a href={viewingProspect.meeting_link} target="_blank" rel="noopener noreferrer" className="text-accent-gold hover:underline truncate">
                          Abrir link
                        </a>
                      </div>
                    )}
                    {viewingProspect.meeting_attended !== null && (
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-400 dark:text-gray-500 w-20 shrink-0">Compareceu</span>
                        <span className={`font-semibold ${viewingProspect.meeting_attended ? 'text-green-600' : 'text-red-500'}`}>
                          {viewingProspect.meeting_attended ? 'Sim' : 'Não'}
                        </span>
                      </div>
                    )}
                  </div>
                  {viewingProspect.meeting_transcript && (
                    <div className="mt-3 text-sm text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 rounded-xl p-3 leading-relaxed">
                      <Sensitive>{viewingProspect.meeting_transcript}</Sensitive>
                    </div>
                  )}
                </section>
              )}

              {/* Follow-up */}
              {viewingProspect.follow_up_reason && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Follow-Up</h3>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${FOLLOW_UP_REASONS.find(r => r.value === viewingProspect.follow_up_reason)?.color || 'bg-gray-100 text-gray-600'}`}>
                    {FOLLOW_UP_REASONS.find(r => r.value === viewingProspect.follow_up_reason)?.label || viewingProspect.follow_up_reason}
                  </span>
                </section>
              )}

              {/* Ações Rápidas — contextuais por status */}
              {(['scheduled', 'pre_meeting'].includes(viewingProspect.status)) && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">Ações Rápidas</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleQuickAction(viewingProspect, 'mark_attended')}
                      disabled={!!markingAction}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800/30 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      {markingAction === 'mark_attended' ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      Compareceu
                    </button>
                    <button
                      onClick={() => handleQuickAction(viewingProspect, 'mark_no_show')}
                      disabled={!!markingAction}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/30 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      {markingAction === 'mark_no_show' ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <X className="w-3.5 h-3.5" />}
                      Não Compareceu
                    </button>
                  </div>
                </section>
              )}
              {viewingProspect.status === 'meeting_done' && !viewingProspect.ebook_sent_at && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">Ações Rápidas</h3>
                  <button
                    onClick={() => handleQuickAction(viewingProspect, 'mark_ebook_sent')}
                    disabled={!!markingAction}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/30 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    {markingAction === 'mark_ebook_sent' ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Marcar E-book como Enviado
                  </button>
                </section>
              )}
              {viewingProspect.status === 'meeting_done' && viewingProspect.ebook_sent_at && (
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">E-book</h3>
                  <p className="text-xs text-green-600 font-semibold flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> Enviado em {new Date(viewingProspect.ebook_sent_at).toLocaleDateString('pt-BR')}
                  </p>
                </section>
              )}

              {/* Atividades */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Atividades</h3>
                  <button
                    onClick={() => setShowActivityForm(v => !v)}
                    className="flex items-center gap-1 text-xs text-accent-gold font-semibold hover:underline"
                  >
                    <Plus className="w-3 h-3" /> Registrar
                  </button>
                </div>

                {showActivityForm && (
                  <form onSubmit={handleSaveActivity} className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl space-y-2 border border-gray-100 dark:border-gray-700">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Tipo</label>
                        <select
                          value={activityForm.activity_type}
                          onChange={e => setActivityForm(f => ({ ...f, activity_type: e.target.value }))}
                          className="input-field text-xs py-1.5 bg-white dark:bg-gray-900"
                        >
                          <option value="call">Ligação</option>
                          <option value="whatsapp">WhatsApp</option>
                          <option value="email">E-mail</option>
                          <option value="meeting">Reunião</option>
                          <option value="demo">Demo</option>
                          <option value="linkedin">LinkedIn</option>
                          <option value="other">Outro</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Assunto *</label>
                        <input
                          type="text"
                          required
                          value={activityForm.subject}
                          onChange={e => setActivityForm(f => ({ ...f, subject: e.target.value }))}
                          className="input-field text-xs py-1.5"
                          placeholder="Ex: 1ª ligação"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Observações</label>
                      <textarea
                        value={activityForm.description}
                        onChange={e => setActivityForm(f => ({ ...f, description: e.target.value }))}
                        rows={2}
                        className="input-field text-xs py-1.5 resize-none"
                        placeholder="Resultado, próximo passo..."
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => setShowActivityForm(false)} className="flex-1 px-3 py-1.5 text-xs text-gray-500 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        Cancelar
                      </button>
                      <button type="submit" disabled={savingActivity} className="flex-1 px-3 py-1.5 text-xs bg-accent-gold text-white rounded-lg font-semibold hover:bg-accent-gold-dark transition-colors disabled:opacity-50">
                        {savingActivity ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  </form>
                )}

                {loadingActivities ? (
                  <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                    <span className="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /> Carregando...
                  </div>
                ) : activities.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500 italic">Nenhuma atividade registrada ainda.</p>
                ) : (
                  <div className="space-y-2">
                    {activities.map(act => {
                      const typeConfig: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
                        call:     { label: 'Ligação',   color: 'bg-blue-100 text-blue-700',   Icon: Phone },
                        email:    { label: 'E-mail',    color: 'bg-gray-100 text-gray-700',   Icon: Mail },
                        meeting:  { label: 'Reunião',   color: 'bg-purple-100 text-purple-700', Icon: Calendar },
                        whatsapp: { label: 'WhatsApp',  color: 'bg-green-100 text-green-700', Icon: MessageSquare },
                        demo:     { label: 'Demo',      color: 'bg-indigo-100 text-indigo-700', Icon: Monitor },
                        linkedin: { label: 'LinkedIn',  color: 'bg-sky-100 text-sky-700',     Icon: Linkedin },
                        other:    { label: 'Outro',     color: 'bg-orange-100 text-orange-700', Icon: Clock },
                      };
                      const cfg = typeConfig[act.activity_type] || typeConfig.other;
                      return (
                        <div key={act.id} className="flex gap-2.5 items-start">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg.color}`}>
                            <cfg.Icon className="w-3 h-3" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{act.subject}</span>
                              <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
                                {new Date(act.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                              </span>
                            </div>
                            {act.description && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">{act.description}</p>
                            )}
                            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{act.created_by_name}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Meta */}
              <section className="pt-2 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                  <span>Criado por <strong>{viewingProspect.created_by_name}</strong></span>
                  <span>{new Date(viewingProspect.created_at).toLocaleDateString('pt-BR')}</span>
                </div>
              </section>

            </div>
          </div>
        </>
      )}

      {/* Modal de criação de proposta vinculada ao lead */}
      {proposalModalProspect && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] animate-fade-in">
          <FocusTrap onClose={() => setProposalModalProspect(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md mx-4 shadow-modal animate-modal-in">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Nova Proposta</h2>
              <button onClick={() => setProposalModalProspect(null)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors" aria-label="Fechar">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              Lead: <strong className="text-gray-700 dark:text-gray-200">{proposalModalProspect.company_name}</strong>
            </p>
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
              <span className="mt-0.5">✦</span>
              <span>Campos preenchidos automaticamente com os dados do lead — edite se necessário.</span>
            </div>
            <form onSubmit={handleSaveProposal} className="space-y-4">
              <div>
                <label className={labelInput}>Título *</label>
                <input type="text" required value={proposalForm.title}
                  onChange={(e) => setProposalForm({ ...proposalForm, title: e.target.value })}
                  className="input-field" placeholder="Ex: Proposta Sistema Web – ACME" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelInput}>Tipo</label>
                  <select value={proposalForm.proposal_type}
                    onChange={(e) => setProposalForm({ ...proposalForm, proposal_type: e.target.value })}
                    className="input-field bg-white dark:bg-gray-800">
                    <option value="software_dev">Desenvolvimento</option>
                    <option value="automation">Automação</option>
                    <option value="ai">Inteligência Artificial</option>
                    <option value="consulting">Consultoria</option>
                    <option value="maintenance">Manutenção</option>
                    <option value="support">Suporte</option>
                    <option value="mixed">Múltiplos Serviços</option>
                  </select>
                </div>
                <div>
                  <label className={labelInput}>Cobrança</label>
                  <select value={proposalForm.billing_type}
                    onChange={(e) => setProposalForm({ ...proposalForm, billing_type: e.target.value })}
                    className="input-field bg-white dark:bg-gray-800">
                    <option value="fixed">Valor Fixo</option>
                    <option value="hourly">Por Hora</option>
                    <option value="monthly">Mensal</option>
                    <option value="milestone">Por Marco</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelInput}>Valor Total (R$)</label>
                  <input type="number" step="0.01" value={proposalForm.total_value}
                    onChange={(e) => setProposalForm({ ...proposalForm, total_value: e.target.value })}
                    className="input-field" placeholder="0,00" />
                </div>
                <div>
                  <label className={labelInput}>Validade</label>
                  <input type="date" value={proposalForm.valid_until}
                    onChange={(e) => setProposalForm({ ...proposalForm, valid_until: e.target.value })}
                    className="input-field" />
                </div>
              </div>
              <div>
                <label className={labelInput}>Observações</label>
                <textarea value={proposalForm.notes}
                  onChange={(e) => setProposalForm({ ...proposalForm, notes: e.target.value })}
                  rows={2} className="input-field resize-none" placeholder="Observações..." />
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setProposalModalProspect(null)}>
                  Cancelar
                </Button>
                <Button type="submit" loading={savingProposal} className="flex-1">
                  Criar Proposta
                </Button>
              </div>
            </form>
          </div>
          </FocusTrap>
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
          <FocusTrap onClose={() => setLossModalProspect(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 shadow-modal animate-modal-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Mover para Perdido</h2>
              <button
                onClick={() => setLossModalProspect(null)}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
              >
                <X className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              </button>
            </div>

            <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 rounded-xl p-3 mb-5">
              <p className="text-xs text-red-700 dark:text-red-300 font-medium">
                O preenchimento do motivo de perda é obrigatório. Sem esses dados, não é possível medir onde o funil sangra.
              </p>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Lead: <span className="font-semibold text-gray-900 dark:text-gray-100">{lossModalProspect.company_name}</span>
            </p>

            <div className="space-y-4">
              <div>
                <label className={labelInput}>Motivo da perda *</label>
                <select
                  value={lossForm.reason}
                  onChange={(e) => setLossForm({ ...lossForm, reason: e.target.value })}
                  className="input-field bg-white dark:bg-gray-800"
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
                        className="text-accent-gold"
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
          </FocusTrap>
        </div>
      )}

      {/* ─── Modal Obrigatório — Follow-Up ───────────────────────────────── */}
      {followUpModalProspect && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <FocusTrap onClose={() => setFollowUpModalProspect(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 shadow-modal animate-modal-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Mover para Follow-Up</h2>
              <button
                onClick={() => setFollowUpModalProspect(null)}
                className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
              >
                <X className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              </button>
            </div>

            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800/30 rounded-xl p-3 mb-5">
              <p className="text-xs text-orange-700 dark:text-orange-300 font-medium">
                Informe o motivo e a data de retomada para que o lead não caia no esquecimento.
              </p>
            </div>

            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Lead: <span className="font-semibold text-gray-900 dark:text-gray-100">{followUpModalProspect.company_name}</span>
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
                          ? 'border-accent-gold bg-accent-gold/5 ring-1 ring-accent-gold/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="followup_reason"
                        value={r.value}
                        checked={followUpForm.reason === r.value}
                        onChange={(e) => setFollowUpForm({ ...followUpForm, reason: e.target.value })}
                        className="text-accent-gold"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{r.label}</span>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {r.value === 'nao_agendou' && 'Qualificou mas não marcou reunião'}
                          {r.value === 'nao_compareceu' && 'Agendou mas não compareceu'}
                          {r.value === 'nao_fechou' && 'Reunião realizada mas não fechou'}
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
          </FocusTrap>
        </div>
      )}
    </div>
  );
}
