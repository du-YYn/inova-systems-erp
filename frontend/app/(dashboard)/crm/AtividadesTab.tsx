'use client';

import { useEffect, useState, useCallback } from 'react';
import { Phone, Mail, Video, MessageCircle, Monitor, Linkedin, MoreHorizontal, Clock, Plus, Search, Pencil, Trash2, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
import { Sensitive } from '@/components/ui/Sensitive';
import FocusTrap from '@/components/ui/FocusTrap';
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
  created_at: string;
}

interface ProspectOption { id: number; company_name: string; contact_name: string; }

const PAGE_SIZE = 15;

const activityIcons: Record<string, React.ElementType> = {
  call: Phone, email: Mail, meeting: Video, whatsapp: MessageCircle,
  demo: Monitor, linkedin: Linkedin, other: MoreHorizontal,
};

const activityColors: Record<string, string> = {
  call: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600',
  email: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600',
  meeting: 'bg-green-50 dark:bg-green-900/30 text-green-600',
  whatsapp: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600',
  demo: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600',
  linkedin: 'bg-sky-50 dark:bg-sky-900/30 text-sky-600',
  other: 'bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300',
};

const activityLabels: Record<string, string> = {
  call: 'Ligação', email: 'E-mail', meeting: 'Reunião', whatsapp: 'WhatsApp',
  demo: 'Demonstração', linkedin: 'LinkedIn', other: 'Outro',
};

const formatDate = (iso: string) => {
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch { return iso; }
};

const formatDuration = (mins: number) => {
  if (!mins) return '';
  if (mins < 60) return `${mins}min`;
  return `${Math.floor(mins / 60)}h${mins % 60 > 0 ? `${mins % 60}min` : ''}`;
};

const EMPTY_FORM = { prospect: '', activity_type: 'call', subject: '', description: '', outcome: '', next_action: '', next_action_date: '', duration_minutes: '' };

export default function AtividadesTab() {
  const toast = useToast();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [prospects, setProspects] = useState<ProspectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Filters
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');

  // CRUD
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [delTarget, setDelTarget] = useState<Activity | null>(null);

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
      console.error('[AtividadesTab] activities error:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, filterType]);

  const fetchProspects = useCallback(async () => {
    try {
      const data = await api.get<{ results?: ProspectOption[] }>('/sales/prospects/', { page_size: '200' });
      setProspects(Array.isArray(data.results ?? data) ? (data.results ?? data) as ProspectOption[] : []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);
  useEffect(() => { fetchProspects(); }, [fetchProspects]);
  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const openNew = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setShowModal(true); };
  const openEdit = (a: Activity) => {
    setEditing(a);
    setForm({
      prospect: String(a.prospect), activity_type: a.activity_type,
      subject: a.subject, description: a.description || '',
      outcome: a.outcome || '', next_action: a.next_action || '',
      next_action_date: a.next_action_date || '', duration_minutes: a.duration_minutes ? String(a.duration_minutes) : '',
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.prospect || !form.subject.trim()) { toast.error('Selecione um lead e preencha o assunto.'); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        prospect: Number(form.prospect), activity_type: form.activity_type, subject: form.subject, description: form.description,
      };
      if (form.outcome) body.outcome = form.outcome;
      if (form.next_action) body.next_action = form.next_action;
      if (form.next_action_date) body.next_action_date = form.next_action_date;
      if (form.duration_minutes) body.duration_minutes = Number(form.duration_minutes);

      if (editing) await api.patch(`/sales/prospect-activities/${editing.id}/`, body);
      else await api.post('/sales/prospect-activities/', body);

      toast.success(editing ? 'Atividade atualizada!' : 'Atividade registrada!');
      setShowModal(false);
      fetchActivities();
    } catch { toast.error('Erro ao salvar atividade.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!delTarget) return;
    try { await api.delete(`/sales/prospect-activities/${delTarget.id}/`); toast.success('Atividade removida.'); setDelTarget(null); fetchActivities(); }
    catch { toast.error('Erro ao remover.'); }
  };

  const lbl = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1';

  return (
    <div>
      {/* Header with filters */}
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
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-400 dark:text-gray-500">{total} atividades</p>
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors text-sm font-medium">
            <Plus className="w-4 h-4" /> Nova Atividade
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-4"><TableSkeleton rows={8} cols={4} /></div>
        ) : activities.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-14 h-14 bg-gray-50 dark:bg-gray-700/50 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Clock className="w-7 h-7 text-gray-300" />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Nenhuma atividade encontrada</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Registre atividades aqui ou pelo drawer do lead no funil</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {activities.map(activity => {
              const Icon = activityIcons[activity.activity_type] || MoreHorizontal;
              const colorCls = activityColors[activity.activity_type] || activityColors.other;
              return (
                <div key={activity.id} className="flex items-start gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${colorCls}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Lead name */}
                    {activity.prospect_name && (
                      <p className="text-[10px] text-accent-gold font-semibold uppercase tracking-wide mb-0.5">
                        <Sensitive>{activity.prospect_name}</Sensitive>
                      </p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-gray-900 dark:text-gray-100"><Sensitive>{activity.subject}</Sensitive></span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colorCls}`}>
                        {activityLabels[activity.activity_type] || activity.activity_type}
                      </span>
                      {activity.duration_minutes > 0 && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" /> {formatDuration(activity.duration_minutes)}
                        </span>
                      )}
                    </div>
                    {activity.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2"><Sensitive>{activity.description}</Sensitive></p>}
                    {activity.outcome && <p className="text-xs text-gray-600 dark:text-gray-300 mt-1"><span className="font-medium">Resultado:</span> <Sensitive>{activity.outcome}</Sensitive></p>}
                    {activity.next_action && (
                      <p className="text-xs text-accent-gold mt-1 font-medium">
                        Próximo: {activity.next_action}
                        {activity.next_action_date && ` (${new Date(activity.next_action_date + 'T00:00:00').toLocaleDateString('pt-BR')})`}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">{formatDate(activity.date)}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5"><Sensitive>{activity.created_by_name}</Sensitive></p>
                    <div className="flex gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <button onClick={() => openEdit(activity)} className="p-1 text-gray-400 hover:text-accent-gold"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setDelTarget(activity)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!loading && totalPages > 1 && (
        <div className="mt-4"><Pagination page={page} totalPages={totalPages} totalItems={total} pageSize={PAGE_SIZE} onChange={setPage} /></div>
      )}

      {/* Modal: Nova/Editar Atividade */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <FocusTrap onClose={() => setShowModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto shadow-modal animate-modal-in">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar Atividade' : 'Nova Atividade'}</h2>
                <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className={lbl}>Lead *</label>
                  <select required value={form.prospect} onChange={e => setForm({ ...form, prospect: e.target.value })} className="input-field bg-white dark:bg-gray-800">
                    <option value="">Selecione um lead</option>
                    {prospects.map(p => <option key={p.id} value={p.id}>{p.company_name || p.contact_name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Tipo *</label>
                    <select required value={form.activity_type} onChange={e => setForm({ ...form, activity_type: e.target.value })} className="input-field bg-white dark:bg-gray-800">
                      {Object.entries(activityLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>Duração (minutos)</label>
                    <input type="number" min="0" value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: e.target.value })} className="input-field" placeholder="Ex: 30" />
                  </div>
                </div>
                <div>
                  <label className={lbl}>Assunto *</label>
                  <input type="text" required value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} className="input-field" placeholder="Ex: Reunião de apresentação" />
                </div>
                <div>
                  <label className={lbl}>Descrição</label>
                  <textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input-field resize-none" placeholder="Detalhes da interação..." />
                </div>
                <div>
                  <label className={lbl}>Resultado</label>
                  <input type="text" value={form.outcome} onChange={e => setForm({ ...form, outcome: e.target.value })} className="input-field" placeholder="Ex: Cliente interessado, pediu proposta" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Próxima ação</label>
                    <input type="text" value={form.next_action} onChange={e => setForm({ ...form, next_action: e.target.value })} className="input-field" placeholder="Ex: Enviar proposta" />
                  </div>
                  <div>
                    <label className={lbl}>Data próxima ação</label>
                    <input type="date" value={form.next_action_date} onChange={e => setForm({ ...form, next_action_date: e.target.value })} className="input-field" />
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">Cancelar</button>
                  <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60">
                    {saving ? 'Salvando...' : editing ? 'Atualizar' : 'Registrar'}
                  </button>
                </div>
              </form>
            </div>
          </FocusTrap>
        </div>
      )}

      <ConfirmDialog open={!!delTarget} title="Remover Atividade" description={`Remover "${delTarget?.subject}"?`} onConfirm={handleDelete} onCancel={() => setDelTarget(null)} danger />
    </div>
  );
}
