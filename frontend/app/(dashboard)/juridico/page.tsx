'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, X, FileText, FileCheck2, FilePlus2, FileX2,
  ExternalLink, ArrowRight, PenLine, Send, Hourglass, CheckCircle2,
  Ban, Rocket, ClipboardList, Building2, User, Wallet, History, FileSignature,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import FocusTrap from '@/components/ui/FocusTrap';
import { FormField } from '@/components/ui/FormField';
import api from '@/lib/api';
import { Sensitive } from '@/components/ui/Sensitive';
import StageWorkspace from './StageWorkspace';
import type { LegalCaseTask } from './types';

interface LegalCaseEvent {
  id: number;
  event_type: string;
  event_type_display: string;
  from_status: string;
  to_status: string;
  from_process_type: string;
  to_process_type: string;
  autentique_link: string;
  signed_at: string | null;
  description: string;
  metadata: Record<string, unknown>;
  created_by: number | null;
  created_by_name: string;
  created_at: string;
}

interface OnboardingData {
  id: number;
  status: string;
  company_legal_name: string;
  company_cnpj: string;
  company_city: string;
  company_state: string;
  rep_full_name: string;
  rep_cpf: string;
  rep_marital_status: string;
  rep_profession: string;
  finance_contact_name: string;
  finance_contact_email: string;
  finance_contact_phone: string;
  submitted_at: string | null;
}

interface ProposalData {
  id: number;
  number: string;
  title: string;
  status: string;
  total_value: string;
  billing_type: string;
  proposal_file: string | null;
  public_token: string | null;
}

interface LegalCase {
  id: number;
  customer: number;
  customer_name: string | null;
  project: number | null;
  project_name: string | null;
  onboarding: number | null;
  onboarding_data: OnboardingData | null;
  proposal: number | null;
  proposal_data: ProposalData | null;
  process_type: string;
  process_type_display: string;
  status: string;
  status_display: string;
  source: string;
  autentique_id: string;
  autentique_link: string;
  signed_at: string | null;
  notes: string;
  events: LegalCaseEvent[];
  attachment: string | null;
  tasks: LegalCaseTask[];
  created_at: string;
}

interface Customer {
  id: number;
  company_name: string;
  name: string;
}

// ── Definição de coluna do kanban (uma macro-etapa/status) ──────────────────
interface ColumnDef {
  key: string;
  label: string;
  icon: typeof PenLine;
  color: string;
}

const COL = {
  preparacao: { key: 'preparacao', label: 'Preparação', icon: PenLine, color: 'bg-gray-50 dark:bg-gray-700/50' },
  nova_solicitacao: { key: 'nova_solicitacao', label: 'Nova solicitação', icon: ClipboardList, color: 'bg-sky-50 dark:bg-sky-900/30' },
  analise: { key: 'preparacao', label: 'Análise/Pendências', icon: ClipboardList, color: 'bg-gray-50 dark:bg-gray-700/50' },
  envio_assinatura: { key: 'envio_assinatura', label: 'Envio p/ Assinatura', icon: Send, color: 'bg-blue-50 dark:bg-blue-900/30' },
  aguardando_assinatura: { key: 'aguardando_assinatura', label: 'Aguardando Assinatura', icon: Hourglass, color: 'bg-amber-50 dark:bg-amber-900/30' },
  assinado: { key: 'assinado', label: 'Assinado', icon: CheckCircle2, color: 'bg-green-50 dark:bg-green-900/30' },
  recusado: { key: 'recusado', label: 'Recusado', icon: Ban, color: 'bg-rose-50 dark:bg-rose-900/30' },
  aprovado_dev: { key: 'aprovado_dev', label: 'Aprovado p/ Desenvolvimento', icon: Rocket, color: 'bg-emerald-50 dark:bg-emerald-900/30' },
} satisfies Record<string, ColumnDef>;

// As 4 modalidades (process_type) — cada uma com SUAS colunas próprias (doc 09 itens 06/07).
// O backend valida as transições por modalidade (status_order_for / _allowed_targets);
// aqui só renderizamos o conjunto de colunas correspondente.
interface Modality {
  key: string;
  label: string;
  icon: typeof FileText;
  badge: string;
  columns: ColumnDef[];
}

const MODALITIES: Modality[] = [
  {
    key: 'contrato',
    label: 'Contrato',
    icon: FileText,
    badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    columns: [COL.preparacao, COL.envio_assinatura, COL.aguardando_assinatura, COL.assinado],
  },
  {
    key: 'validacao_documento',
    label: 'Validação de Documento',
    icon: FileCheck2,
    badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
    columns: [COL.preparacao, COL.envio_assinatura, COL.aguardando_assinatura, COL.assinado, COL.aprovado_dev],
  },
  {
    key: 'aditivo',
    label: 'Aditivo',
    icon: FilePlus2,
    badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    // Nova solicitação → Preparação (embute Envio) → Aguardando → Assinado/Recusado
    columns: [COL.nova_solicitacao, COL.preparacao, COL.aguardando_assinatura, COL.assinado, COL.recusado],
  },
  {
    key: 'encerramento',
    label: 'Encerramento',
    icon: FileX2,
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    // Análise/Pendências → (Distrato) Envio → Aguardando → Assinado/Encerrado
    columns: [COL.analise, COL.envio_assinatura, COL.aguardando_assinatura, COL.assinado],
  },
];

const modalityByKey = (key: string) => MODALITIES.find((m) => m.key === key);

const stageLabelFor = (status: string): string =>
  (MODALITIES.flatMap((m) => m.columns).find((c) => c.key === status)?.label) ?? status;

// Classes estáticas (Tailwind JIT não gera de interpolação) — nº de colunas por modalidade.
const GRID_COLS: Record<number, string> = {
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
};

const SOURCE_LABELS: Record<string, string> = {
  comercial: 'Comercial',
  producao: 'Produção',
  cliente: 'Cliente',
};

const BILLING_TYPE_LABELS: Record<string, string> = {
  hourly: 'Por Hora',
  fixed: 'Preço Fixo',
  monthly: 'Mensal',
  milestone: 'Por Marco',
};

const MARITAL_STATUS_LABELS: Record<string, string> = {
  solteiro: 'Solteiro(a)',
  casado: 'Casado(a)',
  divorciado: 'Divorciado(a)',
  viuvo: 'Viúvo(a)',
  separado: 'Separado(a)',
  uniao_estavel: 'União Estável',
};

const EVENT_ICONS: Record<string, typeof History> = {
  created: ClipboardList,
  status_change: ArrowRight,
  modality_change: FilePlus2,
  signed: FileSignature,
  rejected: Ban,
  linked: ExternalLink,
};

const EMPTY_FORM = { customer: '', process_type: 'contrato', source: 'comercial', notes: '' };

const formatCurrency = (value: string) => {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const KanbanSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
    {Array.from({ length: 4 }).map((_, col) => (
      <div key={col} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
        <div className="h-5 bg-gray-200 dark:bg-gray-600 rounded w-32 mb-4 animate-pulse" />
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

export default function JuridicoPage() {
  const toast = useToast();
  const [cases, setCases] = useState<LegalCase[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  // Modalidade ativa (cada uma é um processo/tela próprio — doc 09 item 06).
  const [activeModality, setActiveModality] = useState<string>('contrato');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  // Card aberto (painéis read-only + histórico).
  const [detailCase, setDetailCase] = useState<LegalCase | null>(null);
  // Transição Preparação → Envio pede o link do Autentique (upload acontece aqui)
  const [transitionTarget, setTransitionTarget] = useState<LegalCase | null>(null);
  const [autentiqueId, setAutentiqueId] = useState('');
  const [autentiqueLink, setAutentiqueLink] = useState('');
  const [transitioning, setTransitioning] = useState<number | null>(null);
  const [pendingAdvance, setPendingAdvance] = useState<LegalCase | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [casesData, customersData] = await Promise.all([
        api.get<{ results: LegalCase[] }>('/juridico/legal-cases/', { page_size: '500' }),
        api.get<{ results: Customer[] }>('/sales/customers/', { page_size: '500' }),
      ]);
      const cList = casesData.results || casesData;
      const custList = customersData.results || customersData;
      setCases(Array.isArray(cList) ? cList : []);
      setCustomers(Array.isArray(custList) ? custList : []);
    } catch {
      toast.error('Erro ao carregar os casos jurídicos.');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, [fetchData]);

  const modality = modalityByKey(activeModality) ?? MODALITIES[0];
  const modalityCases = cases.filter((c) => c.process_type === modality.key);

  // Casos de uma coluna, na modalidade ativa. Como `preparacao` é reusada por
  // duas modalidades com a MESMA chave, basta filtrar por status dentro da
  // lista já restrita à modalidade.
  const casesByStatus = (statusKey: string) =>
    modalityCases.filter((c) => c.status === statusKey);

  // Próximo status legítimo (1 passo) na ordem da MODALIDADE do caso.
  // Espelha LegalCase.status_order_for / _allowed_targets do backend.
  const statusOrderFor = (processType: string): string[] => {
    if (processType === 'aditivo') return ['nova_solicitacao', 'preparacao', 'aguardando_assinatura', 'assinado'];
    if (processType === 'validacao_documento') return ['preparacao', 'envio_assinatura', 'aguardando_assinatura', 'assinado', 'aprovado_dev'];
    return ['preparacao', 'envio_assinatura', 'aguardando_assinatura', 'assinado'];
  };
  // Terminalidade é POR MODALIDADE: não há "próximo" quando o status é o último
  // da ordem da modalidade (espelha _allowed_targets do backend). `assinado` é
  // terminal no Contrato, mas na Validação ainda avança p/ `aprovado_dev`.
  // `recusado` (ramo do Aditivo) não está na ordem → idx < 0 → sem próximo.
  const nextStatus = (legalCase: LegalCase): string | null => {
    const order = statusOrderFor(legalCase.process_type);
    const idx = order.indexOf(legalCase.status);
    if (idx < 0 || idx >= order.length - 1) return null;
    return order[idx + 1];
  };

  // Aditivo: em "Aguardando", além de "Assinado" há o ramo "Recusado".
  const canReject = (legalCase: LegalCase): boolean =>
    legalCase.process_type === 'aditivo' && legalCase.status === 'aguardando_assinatura';

  const applyUpdated = (updated: LegalCase) => {
    setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setDetailCase((prev) => (prev && prev.id === updated.id ? updated : prev));
  };

  // ── Checklist (LegalCaseTask) ──────────────────────────────────────────────
  const patchDetailTasks = (mut: (tasks: LegalCaseTask[]) => LegalCaseTask[]) =>
    setDetailCase((prev) => (prev ? { ...prev, tasks: mut(prev.tasks) } : prev));

  const toggleTask = async (task: LegalCaseTask) => {
    try {
      const updated = await api.patch<LegalCaseTask>(
        `/juridico/legal-case-tasks/${task.id}/`, { done: !task.done },
      );
      patchDetailTasks((tasks) => tasks.map((t) => (t.id === updated.id ? updated : t)));
    } catch {
      toast.error('Não foi possível atualizar a tarefa.');
    }
  };

  const addTask = async (caseId: number, label: string) => {
    if (!label.trim()) return;
    try {
      const created = await api.post<LegalCaseTask>(
        '/juridico/legal-case-tasks/', { case: caseId, label: label.trim() },
      );
      patchDetailTasks((tasks) => [...tasks, created]);
    } catch {
      toast.error('Não foi possível adicionar a tarefa.');
    }
  };

  const removeTask = async (task: LegalCaseTask) => {
    try {
      await api.delete(`/juridico/legal-case-tasks/${task.id}/`);
      patchDetailTasks((tasks) => tasks.filter((t) => t.id !== task.id));
    } catch {
      toast.error('Não foi possível remover a tarefa.');
    }
  };

  // ── Ferramentas (documento / notas / autentique) ───────────────────────────
  const uploadAttachment = async (caseId: number, file: File) => {
    try {
      const updated = await api.upload<LegalCase>(
        `/juridico/legal-cases/${caseId}/upload-attachment/`, file, 'attachment',
      );
      applyUpdated(updated);
      toast.success('Documento anexado.');
    } catch {
      toast.error('Falha ao anexar o documento (verifique tipo/tamanho).');
    }
  };

  const saveNotes = async (caseId: number, notes: string) => {
    try {
      const updated = await api.post<LegalCase>(
        `/juridico/legal-cases/${caseId}/notes/`, { notes },
      );
      applyUpdated(updated);
      toast.success('Notas salvas.');
    } catch {
      toast.error('Não foi possível salvar as notas.');
    }
  };

  const saveAutentique = async (caseId: number, autentiqueId: string, autentiqueLink: string) => {
    try {
      const updated = await api.post<LegalCase>(
        `/juridico/legal-cases/${caseId}/autentique/`,
        { autentique_id: autentiqueId, autentique_link: autentiqueLink },
      );
      applyUpdated(updated);
      toast.success('Link do Autentique atualizado.');
    } catch {
      toast.error('Não foi possível atualizar o link.');
    }
  };

  const doTransition = async (
    legalCase: LegalCase,
    target: string,
    extra?: { autentique_id?: string; autentique_link?: string },
  ) => {
    setTransitioning(legalCase.id);
    try {
      const body: Record<string, string> = { status: target };
      if (extra?.autentique_id) body.autentique_id = extra.autentique_id;
      if (extra?.autentique_link) body.autentique_link = extra.autentique_link;
      const updated = await api.post<LegalCase>(`/juridico/legal-cases/${legalCase.id}/transition/`, body);
      applyUpdated(updated);
      const allCols = MODALITIES.flatMap((m) => m.columns);
      const label = allCols.find((s) => s.key === target)?.label ?? target;
      toast.success(`Caso movido para "${label}".`);
    } catch {
      toast.error('Não foi possível avançar o caso. Verifique a ordem das etapas.');
    } finally {
      setTransitioning(null);
    }
  };

  const proceedAdvance = (legalCase: LegalCase) => {
    const target = nextStatus(legalCase);
    if (!target) return;
    // Upload no Autentique acontece na transição Preparação → Envio.
    // No Aditivo a etapa "Preparação" embute o envio; abrir o modal também ali.
    const goesToSignFlow =
      (legalCase.process_type !== 'aditivo' && legalCase.status === 'preparacao' && target === 'envio_assinatura')
      || (legalCase.process_type === 'aditivo' && legalCase.status === 'preparacao' && target === 'aguardando_assinatura');
    if (goesToSignFlow) {
      setAutentiqueId(legalCase.autentique_id || '');
      setAutentiqueLink(legalCase.autentique_link || '');
      setTransitionTarget(legalCase);
    } else {
      doTransition(legalCase, target);
    }
  };

  const handleAdvanceClick = (legalCase: LegalCase) => {
    const stageTasks = legalCase.tasks?.filter((t) => t.stage === legalCase.status) ?? [];
    const hasPending = stageTasks.some((t) => !t.done);
    if (hasPending) {
      setPendingAdvance(legalCase);   // abre o ConfirmDialog
      return;
    }
    proceedAdvance(legalCase);
  };

  const handleReject = (legalCase: LegalCase) => {
    doTransition(legalCase, 'recusado');
  };

  const handleTransitionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transitionTarget) return;
    const target = nextStatus(transitionTarget);
    if (!target) { setTransitionTarget(null); return; }
    await doTransition(transitionTarget, target, {
      autentique_id: autentiqueId.trim(),
      autentique_link: autentiqueLink.trim(),
    });
    setTransitionTarget(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customer) {
      setFormError('Cliente é obrigatório');
      return;
    }
    setSaving(true);
    try {
      const newCase = await api.post<LegalCase>('/juridico/legal-cases/', {
        customer: Number(formData.customer),
        process_type: formData.process_type,
        source: formData.source,
        notes: formData.notes,
      });
      setCases((prev) => [newCase, ...prev]);
      toast.success('Caso jurídico criado!');
      setActiveModality(newCase.process_type);
      setShowCreateModal(false);
      setFormData({ ...EMPTY_FORM });
      setFormError('');
    } catch {
      toast.error('Erro ao criar o caso. Verifique sua permissão de setor.');
    } finally {
      setSaving(false);
    }
  };

  const typeBadge = (processType: string) =>
    modalityByKey(processType)?.badge ??
    'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Jurídico</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Cada modalidade tem seu processo próprio — o documento vive no Autentique
          </p>
        </div>
        <button
          onClick={() => { setFormData({ ...EMPTY_FORM, process_type: activeModality }); setFormError(''); setShowCreateModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors"
        >
          <Plus className="w-5 h-5" />
          Novo Caso
        </button>
      </div>

      {/* Seletor de modalidade — cada uma é um processo/tela próprio */}
      <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label="Selecionar modalidade do processo">
        {MODALITIES.map((m) => {
          const count = cases.filter((c) => c.process_type === m.key).length;
          const active = activeModality === m.key;
          return (
            <button
              key={m.key}
              role="tab"
              aria-selected={active}
              onClick={() => setActiveModality(m.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                active
                  ? 'bg-accent-gold text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-accent-gold'
              }`}
            >
              <m.icon className="w-3.5 h-3.5" />
              {m.label} ({count})
            </button>
          );
        })}
      </div>

      {loading ? (
        <KanbanSkeleton />
      ) : (
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${GRID_COLS[modality.columns.length] ?? 'xl:grid-cols-4'}`}>
          <>
            {modality.columns.map((column) => {
              const columnCases = casesByStatus(column.key);
              return (
                <div key={`${modality.key}-${column.key}`} className={`${column.color} rounded-lg p-4`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <column.icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      <h2 className="font-medium text-sm text-gray-900 dark:text-gray-100">{column.label}</h2>
                    </div>
                    <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 text-xs rounded-full">
                      {columnCases.length}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {columnCases.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Nenhum caso</p>
                    ) : (
                      columnCases.map((legalCase) => (
                        <button
                          key={legalCase.id}
                          type="button"
                          onClick={() => setDetailCase(legalCase)}
                          className="w-full text-left bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-accent-gold transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100 flex-1">
                              <Sensitive>{legalCase.customer_name || `Cliente #${legalCase.customer}`}</Sensitive>
                            </h3>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 mb-2">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${typeBadge(legalCase.process_type)}`}>
                              {legalCase.process_type_display}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                              {SOURCE_LABELS[legalCase.source] ?? legalCase.source}
                            </span>
                          </div>

                          {legalCase.project_name && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                              <Sensitive>{legalCase.project_name}</Sensitive>
                            </p>
                          )}

                          {legalCase.autentique_link && (
                            <a
                              href={legalCase.autentique_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mb-2"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Documento no Autentique
                            </a>
                          )}

                          {legalCase.signed_at && (
                            <p className="text-xs text-green-600 dark:text-green-400 mb-2">
                              Assinado em {new Date(legalCase.signed_at).toLocaleDateString('pt-BR')}
                            </p>
                          )}

                          <div className="flex items-center justify-between gap-2 mt-2">
                            <span className="text-[11px] text-gray-400 dark:text-gray-500">
                              {new Date(legalCase.created_at).toLocaleDateString('pt-BR')}
                            </span>
                          {(() => {
                            const stageTasks = legalCase.tasks?.filter((t) => t.stage === legalCase.status) ?? [];
                            if (stageTasks.length === 0) return null;
                            const done = stageTasks.filter((t) => t.done).length;
                            return (
                              <span className="text-[11px] text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> {done}/{stageTasks.length}
                              </span>
                            );
                          })()}
                            <div className="flex items-center gap-1.5">
                              {canReject(legalCase) && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleReject(legalCase); }}
                                  disabled={transitioning === legalCase.id}
                                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-600 border border-rose-300 dark:border-rose-700 rounded-lg hover:bg-rose-600 hover:text-white transition-colors disabled:opacity-60"
                                  aria-label={`Recusar caso de ${legalCase.customer_name ?? legalCase.customer}`}
                                >
                                  <Ban className="w-3 h-3" />
                                  Recusar
                                </button>
                              )}
                              {nextStatus(legalCase) && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleAdvanceClick(legalCase); }}
                                  disabled={transitioning === legalCase.id}
                                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-accent-gold border border-accent-gold/40 rounded-lg hover:bg-accent-gold hover:text-white transition-colors disabled:opacity-60"
                                  aria-label={`Avançar caso de ${legalCase.customer_name ?? legalCase.customer}`}
                                >
                                  {transitioning === legalCase.id ? 'Avançando...' : 'Avançar'}
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </>
        </div>
      )}

      {/* Modal: detalhe do caso — painéis read-only + histórico (doc 09 itens 05/06) */}
      {detailCase && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <FocusTrap onClose={() => setDetailCase(null)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto shadow-modal animate-modal-in">
              <div className="flex items-start justify-between gap-3 p-6 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                    <Sensitive>{detailCase.customer_name || `Cliente #${detailCase.customer}`}</Sensitive>
                  </h2>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${typeBadge(detailCase.process_type)}`}>
                      {detailCase.process_type_display}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {detailCase.status_display}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {SOURCE_LABELS[detailCase.source] ?? detailCase.source}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setDetailCase(null)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Zona 1 — Etapa atual (workspace) */}
                <StageWorkspace
                  stageLabel={stageLabelFor(detailCase.status)}
                  tasks={detailCase.tasks.filter((t) => t.stage === detailCase.status)}
                  attachmentUrl={detailCase.attachment}
                  notes={detailCase.notes}
                  autentiqueId={detailCase.autentique_id}
                  autentiqueLink={detailCase.autentique_link}
                  onToggle={toggleTask}
                  onAdd={(label) => addTask(detailCase.id, label)}
                  onRemove={removeTask}
                  onUpload={(file) => uploadAttachment(detailCase.id, file)}
                  onSaveNotes={(n) => saveNotes(detailCase.id, n)}
                  onSaveAutentique={(id, link) => saveAutentique(detailCase.id, id, link)}
                />

                {/* Painel 1: Dados do Cliente (do onboarding vinculado) */}
                <details className="group" open>
                  <summary className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 cursor-pointer list-none">
                    <Building2 className="w-4 h-4 text-accent-gold" />
                    Dados do Cliente
                  </summary>
                  {detailCase.onboarding_data ? (
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                      {/* Empresa */}
                      <div className="p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">Empresa (Contratante)</p>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                          <DetailRow label="Razão Social" value={detailCase.onboarding_data.company_legal_name} sensitive />
                          <DetailRow label="CNPJ" value={detailCase.onboarding_data.company_cnpj} sensitive />
                          <DetailRow
                            label="Cidade/UF"
                            value={[detailCase.onboarding_data.company_city, detailCase.onboarding_data.company_state].filter(Boolean).join(' / ')}
                          />
                        </dl>
                      </div>
                      {/* Representante */}
                      <div className="p-4">
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
                          <User className="w-3 h-3" /> Representante Legal
                        </p>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                          <DetailRow label="Nome" value={detailCase.onboarding_data.rep_full_name} sensitive />
                          <DetailRow label="CPF" value={detailCase.onboarding_data.rep_cpf} sensitive />
                          <DetailRow label="Estado Civil" value={MARITAL_STATUS_LABELS[detailCase.onboarding_data.rep_marital_status] ?? detailCase.onboarding_data.rep_marital_status} />
                          <DetailRow label="Profissão" value={detailCase.onboarding_data.rep_profession} />
                        </dl>
                      </div>
                      {/* Contato Financeiro */}
                      <div className="p-4">
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
                          <Wallet className="w-3 h-3" /> Contato Financeiro
                        </p>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                          <DetailRow label="Nome" value={detailCase.onboarding_data.finance_contact_name} sensitive />
                          <DetailRow label="E-mail" value={detailCase.onboarding_data.finance_contact_email} sensitive />
                          <DetailRow label="Telefone" value={detailCase.onboarding_data.finance_contact_phone} sensitive />
                        </dl>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 dark:text-gray-500 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 p-4 text-center">
                      Sem Coleta de Dados vinculada (caso manual).
                    </p>
                  )}
                </details>

                {/* Painel 2: Proposta fechada (documento + valor/forma de pagamento) */}
                <details className="group" open>
                  <summary className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 cursor-pointer list-none">
                    <FileText className="w-4 h-4 text-accent-gold" />
                    Proposta Fechada
                  </summary>
                  {detailCase.proposal_data ? (
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <DetailRow label="Número" value={detailCase.proposal_data.number} />
                        <DetailRow label="Título" value={detailCase.proposal_data.title} sensitive />
                        <DetailRow label="Valor" value={formatCurrency(detailCase.proposal_data.total_value)} sensitive />
                        <DetailRow label="Forma de Pagamento" value={BILLING_TYPE_LABELS[detailCase.proposal_data.billing_type] ?? detailCase.proposal_data.billing_type} />
                      </dl>
                      {(detailCase.proposal_data.proposal_file || detailCase.proposal_data.public_token) && (
                        <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                          {detailCase.proposal_data.proposal_file && (
                            <a
                              href={detailCase.proposal_data.proposal_file}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Documento da proposta
                            </a>
                          )}
                          {detailCase.proposal_data.public_token && (
                            <a
                              href={`/p/${detailCase.proposal_data.public_token}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Link público
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 dark:text-gray-500 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 p-4 text-center">
                      Sem proposta vinculada.
                    </p>
                  )}
                </details>

                {/* Notas do Jurídico */}
                {detailCase.notes && (
                  <section>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Notas</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                      <Sensitive>{detailCase.notes}</Sensitive>
                    </p>
                  </section>
                )}

                {/* Painel 3: Timeline de histórico (LegalCaseEvent) */}
                <details className="group">
                  <summary className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 cursor-pointer list-none">
                    <History className="w-4 h-4 text-accent-gold" />
                    Histórico
                  </summary>
                  {detailCase.events && detailCase.events.length > 0 ? (
                    <ol className="relative border-l border-gray-200 dark:border-gray-700 ml-2 space-y-4">
                      {detailCase.events.map((ev) => {
                        const EvIcon = EVENT_ICONS[ev.event_type] ?? History;
                        return (
                          <li key={ev.id} className="ml-4">
                            <span className="absolute -left-[9px] flex items-center justify-center w-4 h-4 rounded-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600">
                              <EvIcon className="w-2.5 h-2.5 text-accent-gold" />
                            </span>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{ev.event_type_display}</span>
                              {(ev.from_status || ev.to_status) && (
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {ev.from_status || '—'} → {ev.to_status || '—'}
                                </span>
                              )}
                            </div>
                            {ev.description && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ev.description}</p>
                            )}
                            {ev.autentique_link && (
                              <a
                                href={ev.autentique_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mt-0.5"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Documento assinado
                              </a>
                            )}
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                              {new Date(ev.created_at).toLocaleString('pt-BR')} · {ev.created_by_name}
                            </p>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="text-sm text-gray-400 dark:text-gray-500 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 p-4 text-center">
                      Nenhum evento registrado.
                    </p>
                  )}
                </details>
              </div>
            </div>
          </FocusTrap>
        </div>
      )}

      {/* Modal: novo caso */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <FocusTrap onClose={() => setShowCreateModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto shadow-modal animate-modal-in">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Novo Caso Jurídico</h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
              <form onSubmit={handleCreate} className="space-y-4">
                <FormField label="Cliente" required error={formError}>
                  {(props) => (
                    <select
                      {...props}
                      value={formData.customer}
                      onChange={(e) => { setFormData({ ...formData, customer: e.target.value }); setFormError(''); }}
                      className="input-field bg-white dark:bg-gray-800"
                    >
                      <option value="">Selecione um cliente</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.company_name || c.name}</option>
                      ))}
                    </select>
                  )}
                </FormField>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Modalidade</label>
                    <select
                      value={formData.process_type}
                      onChange={(e) => setFormData({ ...formData, process_type: e.target.value })}
                      className="input-field bg-white dark:bg-gray-800"
                    >
                      {MODALITIES.map((m) => (
                        <option key={m.key} value={m.key}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Origem</label>
                    <select
                      value={formData.source}
                      onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                      className="input-field bg-white dark:bg-gray-800"
                    >
                      <option value="comercial">Comercial</option>
                      <option value="producao">Produção</option>
                      <option value="cliente">Cliente</option>
                    </select>
                  </div>
                </div>

                <FormField label="Notas">
                  {(props) => (
                    <textarea
                      {...props}
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                      placeholder="Info coletada p/ montar o documento"
                      className="input-field"
                    />
                  )}
                </FormField>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60"
                  >
                    {saving ? 'Salvando...' : 'Criar Caso'}
                  </button>
                </div>
              </form>
            </div>
          </FocusTrap>
        </div>
      )}

      {/* Modal: transição Preparação → Envio (anexa Autentique) */}
      {transitionTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <FocusTrap onClose={() => setTransitionTarget(null)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 shadow-modal animate-modal-in">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Enviar p/ Assinatura</h2>
                <button
                  onClick={() => setTransitionTarget(null)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                  aria-label="Fechar"
                >
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                O upload do documento acontece no Autentique nesta etapa. Informe o link (opcional).
              </p>
              <form onSubmit={handleTransitionSubmit} className="space-y-4">
                <FormField label="ID do documento no Autentique">
                  {(props) => (
                    <input
                      type="text" {...props}
                      value={autentiqueId}
                      onChange={(e) => setAutentiqueId(e.target.value)}
                      placeholder="ex: 0a1b2c3d"
                      className="input-field"
                    />
                  )}
                </FormField>
                <FormField label="Link do Autentique">
                  {(props) => (
                    <input
                      type="url" {...props}
                      value={autentiqueLink}
                      onChange={(e) => setAutentiqueLink(e.target.value)}
                      placeholder="https://app.autentique.com.br/..."
                      className="input-field"
                    />
                  )}
                </FormField>
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setTransitionTarget(null)}
                    className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={transitioning === transitionTarget.id}
                    className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60"
                  >
                    {transitioning === transitionTarget.id ? 'Enviando...' : 'Enviar p/ Assinatura'}
                  </button>
                </div>
              </form>
            </div>
          </FocusTrap>
        </div>
      )}

      <ConfirmDialog
        open={pendingAdvance !== null}
        danger={false}
        title="Tarefas pendentes"
        description="Há tarefas pendentes nesta etapa. Avançar mesmo assim?"
        confirmLabel="Avançar"
        onCancel={() => setPendingAdvance(null)}
        onConfirm={() => {
          const c = pendingAdvance;
          setPendingAdvance(null);
          if (c) proceedAdvance(c);
        }}
      />
    </div>
  );
}

// ── Linha rótulo/valor dos painéis read-only ────────────────────────────────
function DetailRow({ label, value, sensitive }: { label: string; value: string | null | undefined; sensitive?: boolean }) {
  const display = value && value.trim() ? value : '—';
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-800 dark:text-gray-200">
        {sensitive && value && value.trim() ? <Sensitive>{display}</Sensitive> : display}
      </dd>
    </div>
  );
}
