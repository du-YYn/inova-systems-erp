'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { X, Plus, Check, Package } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import FocusTrap from '@/components/ui/FocusTrap';
import api, { ApiError } from '@/lib/api';
import { buildProposalDefaults } from '@/lib/proposalDefaults';

// ─── Types ─────────────────────────────────────────────────────────

export interface Service {
  id: number;
  code: string;
  name: string;
  description: string;
  default_recurrence: 'one_time' | 'monthly';
  is_active: boolean;
  display_order: number;
}

export interface ProposalServiceItem {
  id?: number;
  service: number;
  service_code?: string;
  service_name?: string;
  service_default_recurrence?: string;
}

export interface PaymentPlanData {
  plan_type: 'one_time' | 'recurring_only' | 'setup_plus_recurring';
  one_time_amount: string;
  one_time_method: '' | 'pix' | 'credit_card' | 'boleto';
  one_time_installments: number;
  one_time_first_due: string;
  one_time_notes: string;
  recurring_amount: string;
  recurring_method: '' | 'pix' | 'credit_card' | 'boleto' | 'transfer';
  recurring_day_of_month: number | null;
  recurring_duration_months: number | null;
  recurring_first_due: string;
  recurring_notes: string;
}

export interface ExistingProposal {
  id: number;
  number?: string;
  title: string;
  customer_name?: string;
  prospect_company?: string;
  proposal_type: string;
  billing_type: string;
  total_value: string;
  valid_until: string | null;
  notes: string;
  services?: ProposalServiceItem[];
  payment_plan?: {
    plan_type?: string;
    one_time_amount?: string | number;
    one_time_method?: string;
    one_time_installments?: number;
    one_time_first_due?: string | null;
    one_time_notes?: string;
    recurring_amount?: string | number;
    recurring_method?: string;
    recurring_day_of_month?: number | null;
    recurring_duration_months?: number | null;
    recurring_first_due?: string | null;
    recurring_notes?: string;
  } | null;
}

export interface ProspectOption {
  id: number;
  company_name: string;
  contact_name: string;
  service_interest: string[];
  estimated_value?: number;
  proposal_value?: number | null;
  description?: string;
  meeting_transcript?: string;
  usage_type?: string;
}

interface ProposalFormModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingProposal?: ExistingProposal | null;
  presetProspect?: ProspectOption | null;
  prospects?: ProspectOption[];
}

// ─── Helpers ───────────────────────────────────────────────────────

const EMPTY_PAYMENT_PLAN: PaymentPlanData = {
  plan_type: 'one_time',
  one_time_amount: '',
  one_time_method: 'pix',
  one_time_installments: 1,
  one_time_first_due: '',
  one_time_notes: '',
  recurring_amount: '',
  recurring_method: 'pix',
  recurring_day_of_month: 10,
  recurring_duration_months: 12,
  recurring_first_due: '',
  recurring_notes: '',
};

const DURATION_PRESETS = [3, 6, 9, 12];

const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);

const formatBRL = (value: string | number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL',
  }).format(Number(value || 0));

// ─── Main component ────────────────────────────────────────────────

export default function ProposalFormModal({
  open, onClose, onSuccess, editingProposal, presetProspect, prospects = [],
}: ProposalFormModalProps) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [prospectId, setProspectId] = useState<string>('');
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [totalValue, setTotalValue] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlanData>({ ...EMPTY_PAYMENT_PLAN });

  // Mini-form: criar serviço
  const [showNewServiceForm, setShowNewServiceForm] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceRecurrence, setNewServiceRecurrence] = useState<'one_time' | 'monthly'>('one_time');
  const [creatingService, setCreatingService] = useState(false);

  // Detectar se é admin
  useEffect(() => {
    try {
      const userData = localStorage.getItem('user');
      if (userData) {
        const parsed = JSON.parse(userData);
        setIsAdmin(parsed?.role === 'admin');
      }
    } catch {
      setIsAdmin(false);
    }
  }, []);

  // Carregar catálogo ao abrir
  const loadServices = useCallback(async () => {
    setServicesLoading(true);
    try {
      const data = await api.get<Service[] | { results: Service[] }>('/sales/services/');
      const list = Array.isArray(data) ? data : (data.results ?? []);
      setServices(list.filter(s => s.is_active));
    } catch (err) {
      // Graceful degradation: se o backend está numa versão antiga sem
      // /sales/services/ (404), avisa o usuário em vez de silenciar.
      if (err instanceof ApiError && err.status === 404) {
        toast.warning('Catálogo de serviços indisponível nesta versão do backend');
      } else {
        console.error('[ProposalFormModal] services error:', err);
      }
      setServices([]);
    } finally {
      setServicesLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open) loadServices();
  }, [open, loadServices]);

  // REGRA DE NEGÓCIO: total_value da proposta = APENAS valor comercial one-time
  // (setup / projeto único). Esse é o número que entra no pipeline comercial,
  // aprovado_value, comissões etc.
  //
  // A mensalidade é INFORMATIVA na proposta (projeção de receita recorrente).
  // Só vira receita de verdade quando o contrato é fechado/ativado — aí o
  // Contract.monthly_value alimenta o MRR no Dashboard Financeiro e as faturas
  // mensais são geradas no módulo Finance.
  //
  // - plan_type = one_time              → total = one_time_amount
  // - plan_type = setup_plus_recurring  → total = one_time_amount (só setup)
  // - plan_type = recurring_only        → total = 0 (não há venda one-time)
  useEffect(() => {
    const oneTime = Number(paymentPlan.one_time_amount || 0);
    let commercialValue = 0;
    if (paymentPlan.plan_type === 'one_time' || paymentPlan.plan_type === 'setup_plus_recurring') {
      commercialValue = oneTime;
    }
    setTotalValue(commercialValue > 0 ? commercialValue.toFixed(2) : '');
  }, [paymentPlan.plan_type, paymentPlan.one_time_amount]);

  // Pré-selecionar serviços quando catálogo e presetProspect/prospect-selecionado estão disponíveis
  useEffect(() => {
    if (!open || editingProposal || services.length === 0) return;
    const prospect = presetProspect ?? prospects.find(p => String(p.id) === prospectId);
    if (!prospect) return;
    // Só pré-seleciona se nenhum serviço selecionado ainda (não sobrescreve escolha manual)
    if (selectedServiceIds.length > 0) return;
    const interestCodes = new Set(prospect.service_interest || []);
    const matches = services
      .filter(s => interestCodes.has(s.code))
      .map(s => s.id);
    if (matches.length > 0) setSelectedServiceIds(matches);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, services, presetProspect, prospectId, editingProposal]);

  // Inicializar form quando abre
  useEffect(() => {
    if (!open) return;

    if (editingProposal) {
      setTitle(editingProposal.title || '');
      setProspectId('');
      setTotalValue(editingProposal.total_value || '');
      setValidUntil(editingProposal.valid_until || '');
      setNotes(editingProposal.notes || '');
      setSelectedServiceIds(
        (editingProposal.services || []).map(s => s.service),
      );
      setPaymentPlan({
        ...EMPTY_PAYMENT_PLAN,
        ...(editingProposal.payment_plan || {}),
        one_time_amount: String(editingProposal.payment_plan?.one_time_amount ?? ''),
        recurring_amount: String(editingProposal.payment_plan?.recurring_amount ?? ''),
      } as PaymentPlanData);

      // Enriquecer com dados completos caso a lista não tenha services/payment_plan
      const needsFetch =
        editingProposal.services === undefined ||
        editingProposal.payment_plan === undefined;
      if (needsFetch) {
        api.get<ExistingProposal>(`/sales/proposals/${editingProposal.id}/`)
          .then(full => {
            setSelectedServiceIds((full.services || []).map(s => s.service));
            if (full.payment_plan) {
              setPaymentPlan({
                ...EMPTY_PAYMENT_PLAN,
                ...full.payment_plan,
                one_time_amount: String(full.payment_plan.one_time_amount ?? ''),
                recurring_amount: String(full.payment_plan.recurring_amount ?? ''),
              } as PaymentPlanData);
            }
          })
          .catch(() => {/* silently ignore */});
      }
    } else if (presetProspect) {
      const defaults = buildProposalDefaults(presetProspect);
      setTitle(defaults.title);
      setProspectId(String(presetProspect.id));
      setTotalValue(defaults.total_value);
      setValidUntil(defaults.valid_until);
      setNotes(defaults.notes);
      setSelectedServiceIds([]);
      setPaymentPlan({ ...EMPTY_PAYMENT_PLAN });
    } else {
      setTitle('');
      setProspectId('');
      setTotalValue('');
      setValidUntil('');
      setNotes('');
      setSelectedServiceIds([]);
      setPaymentPlan({ ...EMPTY_PAYMENT_PLAN });
    }
    setShowNewServiceForm(false);
    setNewServiceName('');
    setNewServiceRecurrence('one_time');
  }, [open, editingProposal, presetProspect]);

  // Pré-selecionar serviços do lead ao selecionar no dropdown (apenas nova)
  const handleProspectChange = (id: string) => {
    setProspectId(id);
    if (!id) return;
    const selected = prospects.find(p => String(p.id) === id);
    if (!selected) return;
    const defaults = buildProposalDefaults(selected);
    setTitle(defaults.title);
    setTotalValue(defaults.total_value);
    setValidUntil(defaults.valid_until);
    setNotes(defaults.notes);
    // Pré-selecionar serviços do catálogo que batem com service_interest do lead
    const interestCodes = new Set(selected.service_interest || []);
    const matches = services
      .filter(s => interestCodes.has(s.code))
      .map(s => s.id);
    if (matches.length > 0) setSelectedServiceIds(matches);
  };

  const toggleService = (id: number) => {
    setSelectedServiceIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };

  const handleCreateService = async () => {
    if (!newServiceName.trim()) {
      toast.error('Nome do serviço é obrigatório');
      return;
    }
    setCreatingService(true);
    try {
      const created = await api.post<Service>('/sales/services/', {
        code: slugify(newServiceName),
        name: newServiceName.trim(),
        default_recurrence: newServiceRecurrence,
        is_active: true,
        display_order: services.length + 1,
      });
      setServices(prev => [...prev, created]);
      setSelectedServiceIds(prev => [...prev, created.id]);
      setShowNewServiceForm(false);
      setNewServiceName('');
      setNewServiceRecurrence('one_time');
      toast.success('Serviço adicionado ao catálogo');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao criar serviço');
    } finally {
      setCreatingService(false);
    }
  };

  const handleDurationPreset = (months: number | 'custom') => {
    if (months === 'custom') {
      setPaymentPlan(p => ({ ...p, recurring_duration_months: p.recurring_duration_months || 1 }));
    } else {
      setPaymentPlan(p => ({ ...p, recurring_duration_months: months }));
    }
  };

  const isCustomDuration =
    paymentPlan.recurring_duration_months !== null &&
    !DURATION_PRESETS.includes(paymentPlan.recurring_duration_months);

  // Derivação de proposal_type/billing_type para manter compatibilidade
  const derivedFields = useMemo(() => {
    const selectedCodes = services
      .filter(s => selectedServiceIds.includes(s.id))
      .map(s => s.code);
    let proposal_type = 'software_dev';
    if (selectedCodes.length >= 2) proposal_type = 'mixed';
    else if (selectedCodes.length === 1) {
      const code = selectedCodes[0];
      if (['automation', 'ai', 'consulting', 'support'].includes(code)) {
        proposal_type = code;
      } else {
        proposal_type = 'software_dev';
      }
    }
    let billing_type: 'fixed' | 'monthly' = 'fixed';
    if (paymentPlan.plan_type !== 'one_time') billing_type = 'monthly';
    return { proposal_type, billing_type };
  }, [selectedServiceIds, services, paymentPlan.plan_type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Título é obrigatório');
      return;
    }
    if (!validUntil) {
      toast.error('Data de validade é obrigatória');
      return;
    }
    if (!editingProposal && !presetProspect && !prospectId) {
      toast.error('Selecione o lead');
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        proposal_type: derivedFields.proposal_type,
        billing_type: derivedFields.billing_type,
        notes: notes,
        valid_until: validUntil,
        total_value: totalValue || '0',
        service_ids: selectedServiceIds,
        payment_plan: buildPaymentPlanPayload(paymentPlan),
      };
      if (!editingProposal && prospectId) {
        body.prospect = Number(prospectId);
      }

      if (editingProposal) {
        await api.patch(`/sales/proposals/${editingProposal.id}/`, body);
        toast.success('Proposta atualizada!');
      } else {
        await api.post('/sales/proposals/', body);
        toast.success('Proposta criada!');
      }
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao salvar proposta');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const showOneTimeBlock =
    paymentPlan.plan_type === 'one_time' ||
    paymentPlan.plan_type === 'setup_plus_recurring';
  const showRecurringBlock =
    paymentPlan.plan_type === 'recurring_only' ||
    paymentPlan.plan_type === 'setup_plus_recurring';
  const showInstallments = paymentPlan.one_time_method !== 'pix' && paymentPlan.one_time_method !== '';

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={onClose}
    >
      <FocusTrap onClose={onClose}>
        <div
          className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-modal animate-modal-in"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {editingProposal ? 'Editar Proposta' : 'Nova Proposta'}
              </h2>
              {(presetProspect || editingProposal?.customer_name || editingProposal?.prospect_company) && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Lead: <span className="font-medium text-gray-700 dark:text-gray-300">
                    {presetProspect?.company_name
                      || editingProposal?.customer_name
                      || editingProposal?.prospect_company}
                  </span>
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
              aria-label="Fechar"
            >
              <X className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Seletor de lead (apenas em nova sem preset) */}
            {!editingProposal && !presetProspect && (
              <div>
                <label className="label-input">Lead *</label>
                <select
                  required
                  value={prospectId}
                  onChange={e => handleProspectChange(e.target.value)}
                  className="input-field bg-white dark:bg-gray-800"
                >
                  <option value="">Selecione o lead…</option>
                  {prospects.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.company_name} — {p.contact_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Título */}
            <div>
              <label className="label-input">Título *</label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="input-field"
                placeholder="Ex: Proposta Sistema Web + Automação — ACME Ltda"
              />
            </div>

            {/* Serviços */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label-input mb-0">Serviços Incluídos *</label>
                {isAdmin && !showNewServiceForm && (
                  <button
                    type="button"
                    onClick={() => setShowNewServiceForm(true)}
                    className="text-xs font-medium text-accent-gold hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Novo serviço
                  </button>
                )}
              </div>

              <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50/50 dark:bg-gray-900/30 p-2 max-h-52 overflow-y-auto">
                {servicesLoading ? (
                  <p className="text-xs text-gray-400 px-2 py-3">Carregando serviços…</p>
                ) : services.length === 0 ? (
                  <p className="text-xs text-gray-400 px-2 py-3">
                    Nenhum serviço cadastrado. {isAdmin && 'Clique em "Novo serviço" acima.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {services.map(s => {
                      const checked = selectedServiceIds.includes(s.id);
                      return (
                        <button
                          type="button"
                          key={s.id}
                          onClick={() => toggleService(s.id)}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-left transition-colors border ${
                            checked
                              ? 'bg-accent-gold/10 border-accent-gold/40 text-gray-800 dark:text-gray-100'
                              : 'bg-white dark:bg-gray-800 border-transparent hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
                          }`}
                        >
                          <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                            checked ? 'bg-accent-gold border-accent-gold text-white' : 'border-gray-300 dark:border-gray-600'
                          }`}>
                            {checked && <Check className="w-3 h-3" />}
                          </span>
                          <span className="flex-1 truncate">{s.name}</span>
                          {s.default_recurrence === 'monthly' && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 uppercase tracking-wide flex-shrink-0">
                              mensal
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {showNewServiceForm && (
                  <div className="mt-2 p-3 bg-white dark:bg-gray-800 border border-accent-gold/30 rounded-md space-y-2">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-accent-gold" />
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">Adicionar ao catálogo</p>
                    </div>
                    <input
                      type="text"
                      value={newServiceName}
                      onChange={e => setNewServiceName(e.target.value)}
                      placeholder="Nome do serviço"
                      className="input-field text-sm"
                      autoFocus
                    />
                    <select
                      value={newServiceRecurrence}
                      onChange={e => setNewServiceRecurrence(e.target.value as 'one_time' | 'monthly')}
                      className="input-field text-sm bg-white dark:bg-gray-800"
                    >
                      <option value="one_time">Pagamento Único</option>
                      <option value="monthly">Mensal</option>
                    </select>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => { setShowNewServiceForm(false); setNewServiceName(''); }}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        loading={creatingService}
                        onClick={handleCreateService}
                      >
                        Adicionar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              {selectedServiceIds.length > 0 && (
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {selectedServiceIds.length} serviço(s) selecionado(s)
                </p>
              )}
            </div>

            {/* Valor total (calculado) + Validade */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label-input flex items-center gap-1.5">
                  Valor Comercial (R$)
                  <span className="text-[10px] font-normal text-gray-400 normal-case tracking-normal">
                    setup — entra no pipeline
                  </span>
                </label>
                <input
                  type="text"
                  readOnly
                  value={totalValue ? formatBRL(totalValue) : 'R$ 0,00'}
                  className="input-field bg-gray-100 dark:bg-gray-900/60 cursor-not-allowed text-gray-700 dark:text-gray-300 font-semibold"
                  title="Valor comercial da proposta (setup/projeto único). A receita recorrente só vira MRR quando o contrato é ativado."
                />
              </div>
              <div>
                <label className="label-input">Validade *</label>
                <input
                  type="date"
                  required
                  value={validUntil}
                  onChange={e => setValidUntil(e.target.value)}
                  className="input-field"
                />
              </div>
            </div>

            {/* ── Forma de Pagamento ────────────────────────────────── */}
            <div className="border-t border-gray-100 dark:border-gray-700 pt-5">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Forma de Pagamento
              </p>

              <div className="grid grid-cols-3 gap-2 mb-4">
                {([
                  { key: 'one_time', label: 'Único' },
                  { key: 'setup_plus_recurring', label: 'Setup + Mensal' },
                  { key: 'recurring_only', label: 'Só Mensal' },
                ] as const).map(opt => {
                  const active = paymentPlan.plan_type === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setPaymentPlan(p => ({ ...p, plan_type: opt.key }))}
                      className={`px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                        active
                          ? 'bg-accent-gold text-white border-accent-gold'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {/* Bloco One-Time / Setup */}
              {showOneTimeBlock && (
                <div className="space-y-3 mb-4 p-3 bg-gray-50 dark:bg-gray-900/40 rounded-lg">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    {paymentPlan.plan_type === 'one_time' ? 'Pagamento Único' : 'Setup'}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label-input">Valor (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={paymentPlan.one_time_amount}
                        onChange={e => setPaymentPlan(p => ({ ...p, one_time_amount: e.target.value }))}
                        className="input-field"
                        placeholder="0,00"
                      />
                    </div>
                    <div>
                      <label className="label-input">Forma</label>
                      <select
                        value={paymentPlan.one_time_method}
                        onChange={e => {
                          const method = e.target.value as PaymentPlanData['one_time_method'];
                          setPaymentPlan(p => ({
                            ...p,
                            one_time_method: method,
                            // PIX à vista = pagamento único; parcelas e data
                            // da 1ª parcela perdem sentido. Resetamos para
                            // não enviar lixo pro backend.
                            one_time_installments: method === 'pix' ? 1 : p.one_time_installments,
                            one_time_first_due: method === 'pix' ? '' : p.one_time_first_due,
                          }));
                        }}
                        className="input-field bg-white dark:bg-gray-800"
                      >
                        <option value="pix">PIX (à vista)</option>
                        <option value="credit_card">Cartão Parcelado</option>
                        <option value="boleto">Boleto Parcelado</option>
                      </select>
                    </div>
                  </div>
                  {/* Na proposta declaramos apenas a INTENÇÃO de pagamento
                      (método + parcelamento). A data efetiva é definida
                      quando o contrato é fechado e o pagamento é confirmado
                      no módulo Financeiro. */}
                  {showInstallments && (
                    <div>
                      <label className="label-input">Parcelas</label>
                      <select
                        value={paymentPlan.one_time_installments}
                        onChange={e => setPaymentPlan(p => ({ ...p, one_time_installments: Number(e.target.value) }))}
                        className="input-field bg-white dark:bg-gray-800"
                      >
                        {Array.from({ length: 12 }).map((_, i) => (
                          <option key={i + 1} value={i + 1}>{i + 1}x</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Bloco Recorrente */}
              {showRecurringBlock && (
                <div className="space-y-3 p-3 bg-blue-50/50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide">
                    Mensalidade
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label-input">Valor mensal (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={paymentPlan.recurring_amount}
                        onChange={e => setPaymentPlan(p => ({ ...p, recurring_amount: e.target.value }))}
                        className="input-field"
                        placeholder="0,00"
                      />
                    </div>
                    <div>
                      <label className="label-input">Forma</label>
                      <select
                        value={paymentPlan.recurring_method}
                        onChange={e => setPaymentPlan(p => ({
                          ...p, recurring_method: e.target.value as PaymentPlanData['recurring_method'],
                        }))}
                        className="input-field bg-white dark:bg-gray-800"
                      >
                        <option value="pix">PIX</option>
                        <option value="credit_card">Cartão</option>
                        <option value="boleto">Boleto</option>
                        <option value="transfer">Transferência</option>
                      </select>
                    </div>
                  </div>
                  {/* Dia do vencimento é uma INTENÇÃO (ex: todo dia 10).
                      A data efetiva da 1ª mensalidade é definida quando o
                      contrato é ativado e o financeiro gera as faturas. */}
                  <div>
                    <label className="label-input">Dia do vencimento</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={paymentPlan.recurring_day_of_month ?? ''}
                      onChange={e => setPaymentPlan(p => ({
                        ...p, recurring_day_of_month: e.target.value ? Number(e.target.value) : null,
                      }))}
                      className="input-field"
                      placeholder="Ex: 10"
                    />
                  </div>
                  <div>
                    <label className="label-input">Duração</label>
                    <div className="flex flex-wrap gap-2">
                      {DURATION_PRESETS.map(m => {
                        const active = paymentPlan.recurring_duration_months === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => handleDurationPreset(m)}
                            className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                              active
                                ? 'bg-accent-gold text-white border-accent-gold'
                                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {m} meses
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => handleDurationPreset('custom')}
                        className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                          isCustomDuration
                            ? 'bg-accent-gold text-white border-accent-gold'
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        Personalizado
                      </button>
                      {isCustomDuration && (
                        <input
                          type="number"
                          min="1"
                          max="120"
                          value={paymentPlan.recurring_duration_months ?? ''}
                          onChange={e => setPaymentPlan(p => ({
                            ...p, recurring_duration_months: e.target.value ? Number(e.target.value) : null,
                          }))}
                          placeholder="meses"
                          className="input-field w-28"
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Verificação soft do total */}
              <PaymentSummary
                totalValue={totalValue}
                paymentPlan={paymentPlan}
              />
            </div>

            {/* Observações */}
            <div>
              <label className="label-input">Observações</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                className="input-field resize-none"
                placeholder="Observações sobre a proposta…"
              />
            </div>
          </form>

          <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-700">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving} onClick={handleSubmit}>
              {editingProposal ? 'Atualizar' : 'Criar Proposta'}
            </Button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function PaymentSummary({ totalValue, paymentPlan }: {
  totalValue: string; paymentPlan: PaymentPlanData;
}) {
  const oneTime = Number(paymentPlan.one_time_amount || 0);
  const recurring = Number(paymentPlan.recurring_amount || 0);
  const months = paymentPlan.recurring_duration_months || 0;
  const commercial = Number(totalValue || 0);
  const recurringTotal = recurring * months;
  const tcv = commercial + recurringTotal;

  if (oneTime === 0 && recurring === 0) return null;

  const showCommercial = paymentPlan.plan_type !== 'recurring_only' && oneTime > 0;
  const showRecurring = paymentPlan.plan_type !== 'one_time' && recurring > 0 && months > 0;

  return (
    <div className="mt-3 text-xs rounded-md bg-gray-50 dark:bg-gray-900/40 text-gray-700 dark:text-gray-300 divide-y divide-gray-200 dark:divide-gray-700">
      {/* Valor comercial — o que vai pro pipeline/aprovado_value */}
      {showCommercial && (
        <div className="px-3 py-2 space-y-1">
          <p className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
            Valor comercial
            <span className="text-[10px] font-normal text-gray-400 normal-case">
              vai pro pipeline
            </span>
          </p>
          <div className="flex justify-between">
            <span>Setup</span>
            <span className="tabular-nums font-semibold text-gray-900 dark:text-gray-100">
              {formatBRL(oneTime)}
            </span>
          </div>
        </div>
      )}

      {/* Receita recorrente — informativo (só vira MRR no contrato ativo) */}
      {showRecurring && (
        <div className="px-3 py-2 space-y-1 bg-blue-50/40 dark:bg-blue-900/10">
          <p className="font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
            Receita recorrente
            <span className="text-[10px] font-normal text-blue-400 normal-case">
              informativo — só entra no MRR quando o contrato for ativado
            </span>
          </p>
          <div className="flex justify-between">
            <span>{months}× {formatBRL(recurring)}/mês</span>
            <span className="tabular-nums">{formatBRL(recurringTotal)}</span>
          </div>
        </div>
      )}

      {/* TCV estimado — só pra referência */}
      {showCommercial && showRecurring && (
        <div className="px-3 py-2 flex justify-between text-gray-500 dark:text-gray-400">
          <span>TCV estimado ({months} meses)</span>
          <span className="tabular-nums">{formatBRL(tcv)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Payload builder ────────────────────────────────────────────────

function buildPaymentPlanPayload(plan: PaymentPlanData) {
  const out: Record<string, unknown> = {
    plan_type: plan.plan_type,
    one_time_amount: plan.one_time_amount || '0',
    one_time_method: plan.one_time_method || '',
    one_time_installments: plan.one_time_installments || 1,
    one_time_notes: plan.one_time_notes || '',
    recurring_amount: plan.recurring_amount || '0',
    recurring_method: plan.recurring_method || '',
    recurring_notes: plan.recurring_notes || '',
  };
  if (plan.one_time_first_due) out.one_time_first_due = plan.one_time_first_due;
  else out.one_time_first_due = null;
  if (plan.recurring_first_due) out.recurring_first_due = plan.recurring_first_due;
  else out.recurring_first_due = null;
  out.recurring_day_of_month = plan.recurring_day_of_month;
  out.recurring_duration_months = plan.recurring_duration_months;
  return out;
}
