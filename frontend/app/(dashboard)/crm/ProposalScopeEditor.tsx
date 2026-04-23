'use client';

import { useState } from 'react';
import { Plus, Check, Package } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import api, { ApiError } from '@/lib/api';
import type { Service, PaymentPlanData } from './ProposalFormModal';

interface Props {
  services: Service[];
  selectedServiceIds: number[];
  onServicesChange: (ids: number[]) => void;
  paymentPlan: PaymentPlanData;
  onPaymentPlanChange: (plan: PaymentPlanData) => void;
  totalValue: string;
  isAdmin: boolean;
  onServiceCreated?: (service: Service) => void;
  loadingServices?: boolean;
}

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
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

export default function ProposalScopeEditor({
  services, selectedServiceIds, onServicesChange,
  paymentPlan, onPaymentPlanChange,
  totalValue, isAdmin, onServiceCreated,
  loadingServices = false,
}: Props) {
  const toast = useToast();
  const [showNewServiceForm, setShowNewServiceForm] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceRecurrence, setNewServiceRecurrence] = useState<'one_time' | 'monthly'>('one_time');
  const [creatingService, setCreatingService] = useState(false);

  const toggleService = (id: number) => {
    onServicesChange(
      selectedServiceIds.includes(id)
        ? selectedServiceIds.filter(x => x !== id)
        : [...selectedServiceIds, id],
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
      onServicesChange([...selectedServiceIds, created.id]);
      onServiceCreated?.(created);
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

  const setPlan = (updates: Partial<PaymentPlanData>) => {
    onPaymentPlanChange({ ...paymentPlan, ...updates });
  };

  const handleDurationPreset = (months: number | 'custom') => {
    if (months === 'custom') {
      setPlan({ recurring_duration_months: paymentPlan.recurring_duration_months || 1 });
    } else {
      setPlan({ recurring_duration_months: months });
    }
  };

  const isCustomDuration =
    paymentPlan.recurring_duration_months !== null &&
    !DURATION_PRESETS.includes(paymentPlan.recurring_duration_months);

  const showOneTimeBlock =
    paymentPlan.plan_type === 'one_time' ||
    paymentPlan.plan_type === 'setup_plus_recurring';
  const showRecurringBlock =
    paymentPlan.plan_type === 'recurring_only' ||
    paymentPlan.plan_type === 'setup_plus_recurring';
  const showInstallments = paymentPlan.one_time_method !== 'pix' && paymentPlan.one_time_method !== '';

  return (
    <div className="space-y-5">
      {/* ── Serviços ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="label-input mb-0">Serviços Incluídos</label>
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
          {loadingServices ? (
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

      {/* ── Forma de Pagamento ───────────────────────────────────── */}
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
                onClick={() => setPlan({ plan_type: opt.key })}
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
                  onChange={e => setPlan({ one_time_amount: e.target.value })}
                  className="input-field"
                  placeholder="0,00"
                />
              </div>
              <div>
                <label className="label-input">Forma</label>
                <select
                  value={paymentPlan.one_time_method}
                  onChange={e => setPlan({
                    one_time_method: e.target.value as PaymentPlanData['one_time_method'],
                    one_time_installments: e.target.value === 'pix' ? 1 : paymentPlan.one_time_installments,
                  })}
                  className="input-field bg-white dark:bg-gray-800"
                >
                  <option value="pix">PIX (à vista)</option>
                  <option value="credit_card">Cartão Parcelado</option>
                  <option value="boleto">Boleto Parcelado</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {showInstallments && (
                <div>
                  <label className="label-input">Parcelas</label>
                  <select
                    value={paymentPlan.one_time_installments}
                    onChange={e => setPlan({ one_time_installments: Number(e.target.value) })}
                    className="input-field bg-white dark:bg-gray-800"
                  >
                    {Array.from({ length: 12 }).map((_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1}x</option>
                    ))}
                  </select>
                </div>
              )}
              <div className={showInstallments ? '' : 'col-span-2'}>
                <label className="label-input">Data 1ª parcela</label>
                <input
                  type="date"
                  value={paymentPlan.one_time_first_due}
                  onChange={e => setPlan({ one_time_first_due: e.target.value })}
                  className="input-field"
                />
              </div>
            </div>
          </div>
        )}

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
                  onChange={e => setPlan({ recurring_amount: e.target.value })}
                  className="input-field"
                  placeholder="0,00"
                />
              </div>
              <div>
                <label className="label-input">Forma</label>
                <select
                  value={paymentPlan.recurring_method}
                  onChange={e => setPlan({ recurring_method: e.target.value as PaymentPlanData['recurring_method'] })}
                  className="input-field bg-white dark:bg-gray-800"
                >
                  <option value="pix">PIX</option>
                  <option value="credit_card">Cartão</option>
                  <option value="boleto">Boleto</option>
                  <option value="transfer">Transferência</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-input">Dia do vencimento</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={paymentPlan.recurring_day_of_month ?? ''}
                  onChange={e => setPlan({ recurring_day_of_month: e.target.value ? Number(e.target.value) : null })}
                  className="input-field"
                  placeholder="Ex: 10"
                />
              </div>
              <div>
                <label className="label-input">Data 1ª mensalidade</label>
                <input
                  type="date"
                  value={paymentPlan.recurring_first_due}
                  onChange={e => setPlan({ recurring_first_due: e.target.value })}
                  className="input-field"
                />
              </div>
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
                    onChange={e => setPlan({ recurring_duration_months: e.target.value ? Number(e.target.value) : null })}
                    placeholder="meses"
                    className="input-field w-28"
                  />
                )}
              </div>
            </div>
          </div>
        )}

        <PaymentSummary totalValue={totalValue} paymentPlan={paymentPlan} />
      </div>
    </div>
  );
}

function PaymentSummary({ totalValue, paymentPlan }: {
  totalValue: string; paymentPlan: PaymentPlanData;
}) {
  const oneTime = Number(paymentPlan.one_time_amount || 0);
  const recurring = Number(paymentPlan.recurring_amount || 0);
  const months = paymentPlan.recurring_duration_months || 0;
  const commercial = Number(totalValue || 0);
  const recurringTotal = recurring * months;
  const tcv = (paymentPlan.plan_type === 'recurring_only' ? 0 : oneTime) + recurringTotal;

  if (oneTime === 0 && recurring === 0) return null;

  const showCommercial = paymentPlan.plan_type !== 'recurring_only' && oneTime > 0;
  const showRecurring = paymentPlan.plan_type !== 'one_time' && recurring > 0 && months > 0;

  return (
    <div className="mt-3 text-xs rounded-md bg-gray-50 dark:bg-gray-900/40 text-gray-700 dark:text-gray-300 divide-y divide-gray-200 dark:divide-gray-700">
      {showCommercial && (
        <div className="px-3 py-2 space-y-1">
          <p className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
            Valor comercial
            <span className="text-[10px] font-normal text-gray-400 normal-case">setup</span>
          </p>
          <div className="flex justify-between">
            <span>Setup</span>
            <span className="tabular-nums font-semibold text-gray-900 dark:text-gray-100">
              {commercial > 0 ? formatBRL(commercial) : formatBRL(oneTime)}
            </span>
          </div>
        </div>
      )}
      {showRecurring && (
        <div className="px-3 py-2 space-y-1 bg-blue-50/40 dark:bg-blue-900/10">
          <p className="font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
            Receita recorrente
            <span className="text-[10px] font-normal text-blue-400 normal-case">
              MRR: {formatBRL(recurring)}/mês
            </span>
          </p>
          <div className="flex justify-between">
            <span>{months}× {formatBRL(recurring)}/mês</span>
            <span className="tabular-nums">{formatBRL(recurringTotal)}</span>
          </div>
        </div>
      )}
      {showCommercial && showRecurring && (
        <div className="px-3 py-2 flex justify-between text-gray-500 dark:text-gray-400">
          <span>TCV estimado ({months} meses)</span>
          <span className="tabular-nums">{formatBRL(tcv)}</span>
        </div>
      )}
    </div>
  );
}
