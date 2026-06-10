'use client';

/**
 * Diretoria (v32 F6, doc 06): fila de escalações do Suporte (decidir e
 * devolver ao fluxo) + reuniões semanais (ata + decisões).
 */
import { useEffect, useState, useCallback } from 'react';
import {
  Landmark, CalendarDays, Plus, X, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import FocusTrap from '@/components/ui/FocusTrap';
import { Sensitive } from '@/components/ui/Sensitive';
import api, { ApiError } from '@/lib/api';

interface Escalation {
  id: number;
  originating_ticket: number;
  ticket_number: string | null;
  ticket_title: string | null;
  customer_name: string | null;
  raised_by_name: string;
  summary: string;
  evidence: string;
  decision: string;
  decision_display: string;
  decision_notes: string;
  decided_by_name: string | null;
  decided_at: string | null;
  resolved: boolean;
  created_at: string;
}

interface Meeting {
  id: number;
  date: string;
  week_ref: string;
  attendees: number[];
  attendees_names: string[];
  agenda_review: Record<string, string>;
  decisions: { title?: string; owner?: string }[];
  notes: string;
  created_by_name: string | null;
  created_at: string;
}

const DECISION_OPTIONS = [
  { value: 'absorver', label: 'Absorver (garantia — corrige sem custo)', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'cobrar', label: 'Cobrar (vira orçamento)', color: 'bg-amber-100 text-amber-700' },
  { value: 'negociar', label: 'Negociar (orçamento negociado)', color: 'bg-blue-100 text-blue-700' },
  { value: 'rejeitar', label: 'Rejeitar (fecha o chamado)', color: 'bg-red-100 text-red-700' },
];

const decisionBadge: Record<string, string> = {
  absorver: 'bg-emerald-100 text-emerald-700',
  cobrar: 'bg-amber-100 text-amber-700',
  negociar: 'bg-blue-100 text-blue-700',
  rejeitar: 'bg-red-100 text-red-700',
};

// As 6 áreas revisadas na reunião semanal (doc 06 §2)
const AGENDA_AREAS: { key: string; label: string }[] = [
  { key: 'comercial_funil', label: 'Comercial / Funil' },
  { key: 'metas_indicadores', label: 'Metas / Indicadores' },
  { key: 'carteira', label: 'Carteira' },
  { key: 'financeiro', label: 'Financeiro' },
  { key: 'producao_projetos', label: 'Produção / Projetos' },
  { key: 'suporte', label: 'Suporte' },
];

const formatDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR');
const formatDateTime = (d: string) => new Date(d).toLocaleString('pt-BR');

const EMPTY_MEETING_FORM = {
  date: '', week_ref: '', notes: '',
  agenda_review: {} as Record<string, string>,
  decisions: '' as string,
};

export default function DiretoriaPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'escalations' | 'meetings'>('escalations');
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);

  // Decide modal
  const [deciding, setDeciding] = useState<Escalation | null>(null);
  const [decisionForm, setDecisionForm] = useState({ decision: 'absorver', decision_notes: '' });

  // Meeting modal
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [meetingForm, setMeetingForm] = useState({ ...EMPTY_MEETING_FORM });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const escalationParams: Record<string, string> = { page_size: '100' };
      if (!showResolved) escalationParams.resolved = 'false';
      const [escData, meetData] = await Promise.all([
        api.get<{ results?: Escalation[] }>('/diretoria/escalations/', escalationParams).catch(() => ({ results: [] })),
        api.get<{ results?: Meeting[] }>('/diretoria/meetings/', { page_size: '50' }).catch(() => ({ results: [] })),
      ]);
      setEscalations(escData.results || escData as unknown as Escalation[]);
      setMeetings(meetData.results || meetData as unknown as Meeting[]);
    } catch { toast.error('Erro ao carregar dados da Diretoria'); }
    finally { setLoading(false); }
  }, [showResolved]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const decide = async () => {
    if (!deciding) return;
    try {
      await api.post(`/diretoria/escalations/${deciding.id}/decide/`, decisionForm);
      toast.success('Decisão registrada e devolvida ao Suporte');
      setDeciding(null);
      setDecisionForm({ decision: 'absorver', decision_notes: '' });
      fetchAll();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao registrar decisão');
    }
  };

  const openMeetingModal = (meeting: Meeting | null) => {
    setEditingMeeting(meeting);
    if (meeting) {
      setMeetingForm({
        date: meeting.date,
        week_ref: meeting.week_ref,
        notes: meeting.notes,
        agenda_review: { ...meeting.agenda_review },
        decisions: (meeting.decisions || []).map(d => d.title || '').join('\n'),
      });
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setMeetingForm({ ...EMPTY_MEETING_FORM, date: today, agenda_review: {} });
    }
    setShowMeetingModal(true);
  };

  const saveMeeting = async () => {
    if (!meetingForm.date) { toast.error('Data obrigatória'); return; }
    const body = {
      date: meetingForm.date,
      week_ref: meetingForm.week_ref,
      notes: meetingForm.notes,
      agenda_review: meetingForm.agenda_review,
      decisions: meetingForm.decisions
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(title => ({ title })),
    };
    try {
      if (editingMeeting) {
        await api.patch(`/diretoria/meetings/${editingMeeting.id}/`, body);
        toast.success('Ata atualizada');
      } else {
        await api.post('/diretoria/meetings/', body);
        toast.success('Reunião registrada');
      }
      setShowMeetingModal(false);
      fetchAll();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Erro ao salvar reunião');
    }
  };

  const pendingCount = escalations.filter(e => !e.resolved).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Diretoria</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Escalações sem solução clara e reunião semanal de governança
          </p>
        </div>
        {activeTab === 'meetings' && (
          <button onClick={() => openMeetingModal(null)}
            className="flex items-center gap-2 px-4 py-2.5 bg-accent-gold text-white rounded-xl text-sm font-medium hover:bg-accent-gold-dark">
            <Plus className="w-4 h-4" /> Nova Reunião
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white dark:bg-gray-800 rounded-xl p-1 shadow-sm border border-gray-200 dark:border-gray-700 w-fit">
        <button onClick={() => setActiveTab('escalations')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'escalations' ? 'bg-accent-gold text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}>
          <Landmark className="w-4 h-4" /> Escalações {pendingCount > 0 && `(${pendingCount})`}
        </button>
        <button onClick={() => setActiveTab('meetings')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'meetings' ? 'bg-accent-gold text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}>
          <CalendarDays className="w-4 h-4" /> Reuniões Semanais
        </button>
      </div>

      {/* ESCALATIONS */}
      {activeTab === 'escalations' && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 cursor-pointer w-fit">
            <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} />
            Mostrar decididas
          </label>

          {loading && Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700 animate-pulse">
              <div className="h-4 w-1/3 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-2/3 bg-gray-100 dark:bg-gray-700 rounded" />
            </div>
          ))}

          {!loading && escalations.map(esc => (
            <div key={esc.id} className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
                      #<Sensitive>{esc.ticket_number || esc.originating_ticket}</Sensitive>
                    </span>
                    {esc.resolved ? (
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${decisionBadge[esc.decision] || 'bg-gray-100 text-gray-600'}`}>
                        {esc.decision_display || esc.decision}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Aguardando decisão
                      </span>
                    )}
                  </div>
                  <h2 className="font-semibold text-gray-800 dark:text-gray-100 mt-1">
                    <Sensitive>{esc.ticket_title || 'Chamado'}</Sensitive>
                  </h2>
                  {esc.customer_name && (
                    <p className="text-xs text-gray-400 dark:text-gray-500"><Sensitive>{esc.customer_name}</Sensitive></p>
                  )}
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-2"><Sensitive>{esc.summary}</Sensitive></p>
                  {esc.evidence && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 line-clamp-2">
                      Evidência: <Sensitive>{esc.evidence}</Sensitive>
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 dark:text-gray-500">
                    <span>Escalado por <Sensitive>{esc.raised_by_name}</Sensitive></span>
                    <span>{formatDateTime(esc.created_at)}</span>
                    {esc.resolved && esc.decided_by_name && (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="w-3 h-3" />
                        Decidido por <Sensitive>{esc.decided_by_name}</Sensitive>
                      </span>
                    )}
                  </div>
                  {esc.decision_notes && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">
                      &ldquo;<Sensitive>{esc.decision_notes}</Sensitive>&rdquo;
                    </p>
                  )}
                </div>
                {!esc.resolved && (
                  <button onClick={() => setDeciding(esc)}
                    className="px-3 py-2 text-xs bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark font-medium flex-shrink-0">
                    Decidir
                  </button>
                )}
              </div>
            </div>
          ))}

          {!loading && escalations.length === 0 && (
            <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl text-gray-400 dark:text-gray-500">
              Nenhuma escalação {showResolved ? 'registrada' : 'pendente'}. 🎉
            </div>
          )}
        </div>
      )}

      {/* MEETINGS */}
      {activeTab === 'meetings' && (
        <div className="space-y-3">
          {loading && Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700 animate-pulse">
              <div className="h-4 w-1/4 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-1/2 bg-gray-100 dark:bg-gray-700 rounded" />
            </div>
          ))}

          {!loading && meetings.map(meeting => (
            <div key={meeting.id}
              onClick={() => openMeetingModal(meeting)}
              className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700 hover:border-accent-gold/40 cursor-pointer transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-gray-800 dark:text-gray-100">
                      Reunião de {formatDate(meeting.date)}
                    </h2>
                    {meeting.week_ref && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-mono">
                        {meeting.week_ref}
                      </span>
                    )}
                  </div>
                  {meeting.attendees_names.length > 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      Presentes: <Sensitive>{meeting.attendees_names.join(', ')}</Sensitive>
                    </p>
                  )}
                  {meeting.decisions?.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {meeting.decisions.slice(0, 3).map((d, i) => (
                        <li key={i} className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-accent-gold mt-0.5 flex-shrink-0" />
                          <Sensitive>{d.title}</Sensitive>
                        </li>
                      ))}
                      {meeting.decisions.length > 3 && (
                        <li className="text-xs text-gray-400">+{meeting.decisions.length - 3} decisões</li>
                      )}
                    </ul>
                  )}
                  {meeting.notes && !meeting.decisions?.length && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 line-clamp-2">
                      <Sensitive>{meeting.notes}</Sensitive>
                    </p>
                  )}
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                  {meeting.created_by_name && <Sensitive>{meeting.created_by_name}</Sensitive>}
                </span>
              </div>
            </div>
          ))}

          {!loading && meetings.length === 0 && (
            <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl text-gray-400 dark:text-gray-500">
              Nenhuma reunião registrada ainda.
            </div>
          )}
        </div>
      )}

      {/* Modal: Decidir escalação */}
      {deciding && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <FocusTrap onClose={() => setDeciding(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="font-semibold text-gray-800 dark:text-gray-100">Decidir escalação</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  #{deciding.ticket_number} — a decisão devolve o chamado ao fluxo do Suporte
                </p>
              </div>
              <button onClick={() => setDeciding(null)} aria-label="Fechar"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                <Sensitive>{deciding.summary}</Sensitive>
              </div>
              <div className="space-y-2">
                {DECISION_OPTIONS.map(opt => (
                  <label key={opt.value}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      decisionForm.decision === opt.value
                        ? 'border-accent-gold bg-accent-gold/5'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                    }`}>
                    <input
                      type="radio"
                      name="decision"
                      value={opt.value}
                      checked={decisionForm.decision === opt.value}
                      onChange={() => setDecisionForm(f => ({ ...f, decision: opt.value }))} />
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${opt.color}`}>
                      {opt.label}
                    </span>
                  </label>
                ))}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Notas da decisão</label>
                <textarea rows={3} className="input-field mt-1" value={decisionForm.decision_notes}
                  placeholder="Justificativa / orientações para o Suporte..."
                  onChange={e => setDecisionForm(f => ({ ...f, decision_notes: e.target.value }))} />
              </div>
            </div>
            <div className="p-5 border-t flex justify-end gap-3">
              <button onClick={() => setDeciding(null)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancelar</button>
              <button onClick={decide} className="px-4 py-2 text-sm bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark">
                Registrar decisão
              </button>
            </div>
          </div>
          </FocusTrap>
        </div>
      )}

      {/* Modal: Reunião (criar/editar ata) */}
      {showMeetingModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <FocusTrap onClose={() => setShowMeetingModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white dark:bg-gray-800 z-10">
              <h2 className="font-semibold text-gray-800 dark:text-gray-100">
                {editingMeeting ? 'Editar ata da reunião' : 'Nova reunião semanal'}
              </h2>
              <button onClick={() => setShowMeetingModal(false)} aria-label="Fechar"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Data *</label>
                  <input type="date" className="input-field mt-1" value={meetingForm.date}
                    onChange={e => setMeetingForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Semana (ex: 2026-W25)</label>
                  <input className="input-field mt-1" value={meetingForm.week_ref} maxLength={10}
                    onChange={e => setMeetingForm(f => ({ ...f, week_ref: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-2">
                  Revisão das 6 áreas
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {AGENDA_AREAS.map(area => (
                    <div key={area.key} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 dark:text-gray-400 w-36 flex-shrink-0">{area.label}</span>
                      <input
                        className="flex-1 px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-lg outline-none focus:border-accent-gold text-gray-800 dark:text-gray-100"
                        placeholder="ok / revisar / nota..."
                        value={meetingForm.agenda_review[area.key] || ''}
                        onChange={e => setMeetingForm(f => ({
                          ...f,
                          agenda_review: { ...f.agenda_review, [area.key]: e.target.value },
                        }))} />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  Decisões e prioridades da semana (uma por linha)
                </label>
                <textarea rows={4} className="input-field mt-1" value={meetingForm.decisions}
                  placeholder={'Priorizar entrega do projeto X\nContratar dev para o time Y'}
                  onChange={e => setMeetingForm(f => ({ ...f, decisions: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Ata / observações</label>
                <textarea rows={5} className="input-field mt-1" value={meetingForm.notes}
                  onChange={e => setMeetingForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="p-5 border-t flex justify-end gap-3">
              <button onClick={() => setShowMeetingModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancelar</button>
              <button onClick={saveMeeting} className="px-4 py-2 text-sm bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark">
                {editingMeeting ? 'Salvar ata' : 'Registrar reunião'}
              </button>
            </div>
          </div>
          </FocusTrap>
        </div>
      )}
    </div>
  );
}
