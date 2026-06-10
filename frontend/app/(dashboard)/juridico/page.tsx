'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, X, FileText, FileCheck2, FilePlus2, FileX2,
  ExternalLink, ArrowRight, PenLine, Send, Hourglass, CheckCircle2,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import FocusTrap from '@/components/ui/FocusTrap';
import { FormField } from '@/components/ui/FormField';
import api from '@/lib/api';
import { Sensitive } from '@/components/ui/Sensitive';

interface LegalCase {
  id: number;
  customer: number;
  customer_name: string | null;
  project: number | null;
  project_name: string | null;
  process_type: string;
  process_type_display: string;
  status: string;
  status_display: string;
  source: string;
  autentique_id: string;
  autentique_link: string;
  signed_at: string | null;
  notes: string;
  created_at: string;
}

interface Customer {
  id: number;
  company_name: string;
  name: string;
}

// Macro-etapas (doc processo-v32/02 §2) — ordem canônica do kanban
const STATUS_COLUMNS = [
  { key: 'preparacao', label: 'Preparação', icon: PenLine, color: 'bg-gray-50 dark:bg-gray-700/50' },
  { key: 'envio_assinatura', label: 'Envio p/ Assinatura', icon: Send, color: 'bg-blue-50 dark:bg-blue-900/30' },
  { key: 'aguardando_assinatura', label: 'Aguardando Assinatura', icon: Hourglass, color: 'bg-amber-50 dark:bg-amber-900/30' },
  { key: 'assinado', label: 'Assinado', icon: CheckCircle2, color: 'bg-green-50 dark:bg-green-900/30' },
];

const STATUS_ORDER = STATUS_COLUMNS.map((c) => c.key);

// As 4 trilhas (process_type)
const PROCESS_TYPES = [
  { key: 'contrato', label: 'Contrato', icon: FileText, badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
  { key: 'validacao_documento', label: 'Validação de Documento', icon: FileCheck2, badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300' },
  { key: 'aditivo', label: 'Aditivo', icon: FilePlus2, badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  { key: 'encerramento', label: 'Encerramento', icon: FileX2, badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
];

const SOURCE_LABELS: Record<string, string> = {
  comercial: 'Comercial',
  producao: 'Produção',
  cliente: 'Cliente',
};

const EMPTY_FORM = { customer: '', process_type: 'contrato', source: 'comercial', notes: '' };

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
  const [typeFilter, setTypeFilter] = useState<string>('todos');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  // Transição Preparação → Envio pede o link do Autentique (upload acontece aqui)
  const [transitionTarget, setTransitionTarget] = useState<LegalCase | null>(null);
  const [autentiqueId, setAutentiqueId] = useState('');
  const [autentiqueLink, setAutentiqueLink] = useState('');
  const [transitioning, setTransitioning] = useState<number | null>(null);

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

  const filteredCases = typeFilter === 'todos'
    ? cases
    : cases.filter((c) => c.process_type === typeFilter);

  const casesByStatus = (statusKey: string) =>
    filteredCases.filter((c) => c.status === statusKey);

  const nextStatus = (current: string): string | null => {
    const idx = STATUS_ORDER.indexOf(current);
    if (idx < 0 || idx >= STATUS_ORDER.length - 1) return null;
    return STATUS_ORDER[idx + 1];
  };

  const doTransition = async (legalCase: LegalCase, extra?: { autentique_id?: string; autentique_link?: string }) => {
    const target = nextStatus(legalCase.status);
    if (!target) return;
    setTransitioning(legalCase.id);
    try {
      const body: Record<string, string> = { status: target };
      if (extra?.autentique_id) body.autentique_id = extra.autentique_id;
      if (extra?.autentique_link) body.autentique_link = extra.autentique_link;
      const updated = await api.post<LegalCase>(`/juridico/legal-cases/${legalCase.id}/transition/`, body);
      setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      const label = STATUS_COLUMNS.find((s) => s.key === target)?.label ?? target;
      toast.success(`Caso movido para "${label}".`);
    } catch {
      toast.error('Não foi possível avançar o caso. Verifique a ordem das etapas.');
    } finally {
      setTransitioning(null);
    }
  };

  const handleAdvanceClick = (legalCase: LegalCase) => {
    if (legalCase.status === 'preparacao') {
      // Upload no Autentique acontece na transição Preparação → Envio
      setAutentiqueId(legalCase.autentique_id || '');
      setAutentiqueLink(legalCase.autentique_link || '');
      setTransitionTarget(legalCase);
    } else {
      doTransition(legalCase);
    }
  };

  const handleTransitionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transitionTarget) return;
    await doTransition(transitionTarget, {
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
    PROCESS_TYPES.find((t) => t.key === processType)?.badge ??
    'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Jurídico</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Fluxo de assinaturas — o documento vive no Autentique
          </p>
        </div>
        <button
          onClick={() => { setFormData({ ...EMPTY_FORM }); setFormError(''); setShowCreateModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors"
        >
          <Plus className="w-5 h-5" />
          Novo Caso
        </button>
      </div>

      {/* Filtro por trilha (process_type) */}
      <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label="Filtrar por tipo de processo">
        <button
          role="tab"
          aria-selected={typeFilter === 'todos'}
          onClick={() => setTypeFilter('todos')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            typeFilter === 'todos'
              ? 'bg-accent-gold text-white'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-accent-gold'
          }`}
        >
          Todos ({cases.length})
        </button>
        {PROCESS_TYPES.map((t) => {
          const count = cases.filter((c) => c.process_type === t.key).length;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={typeFilter === t.key}
              onClick={() => setTypeFilter(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                typeFilter === t.key
                  ? 'bg-accent-gold text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-accent-gold'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label} ({count})
            </button>
          );
        })}
      </div>

      {loading ? (
        <KanbanSkeleton />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {STATUS_COLUMNS.map((column) => {
            const columnCases = casesByStatus(column.key);
            return (
              <div key={column.key} className={`${column.color} rounded-lg p-4`}>
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
                      <div
                        key={legalCase.id}
                        className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-accent-gold transition-colors"
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

                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[11px] text-gray-400 dark:text-gray-500">
                            {new Date(legalCase.created_at).toLocaleDateString('pt-BR')}
                          </span>
                          {nextStatus(legalCase.status) && (
                            <button
                              onClick={() => handleAdvanceClick(legalCase)}
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
                    ))
                  )}
                </div>
              </div>
            );
          })}
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
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Tipo de Processo</label>
                    <select
                      value={formData.process_type}
                      onChange={(e) => setFormData({ ...formData, process_type: e.target.value })}
                      className="input-field bg-white dark:bg-gray-800"
                    >
                      {PROCESS_TYPES.map((t) => (
                        <option key={t.key} value={t.key}>{t.label}</option>
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
    </div>
  );
}
