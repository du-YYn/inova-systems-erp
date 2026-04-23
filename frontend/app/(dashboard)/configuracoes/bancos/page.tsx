'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, X, Landmark, Percent, DollarSign } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/Skeleton';
import FocusTrap from '@/components/ui/FocusTrap';
import { FormField } from '@/components/ui/FormField';
import api, { ApiError } from '@/lib/api';

interface Rate {
  id: number;
  method: 'credit_card' | 'boleto' | 'pix';
  method_display: string;
  installment_fee_pct: string;
  installment_fee_fixed: string;
  anticipation_monthly_pct: string;
  fixed_fee: string;
  notes: string;
}

interface Provider {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  display_order: number;
  notes: string;
  rates: Rate[];
  created_at: string;
  updated_at: string;
}

const METHOD_ORDER: Record<string, number> = { credit_card: 1, boleto: 2, pix: 3 };
const METHOD_LABEL: Record<string, string> = {
  credit_card: 'Cartão de Crédito',
  boleto: 'Boleto',
  pix: 'PIX',
};

const slugify = (text: string) =>
  text.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '').slice(0, 50);

const fmtPct = (v: string | number) => `${Number(v).toFixed(2)}%`;
const fmtBRL = (v: string | number) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function BancosConfigPage() {
  const toast = useToast();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Modal de edição de provider
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [isNewProvider, setIsNewProvider] = useState(false);
  const [providerForm, setProviderForm] = useState({
    code: '', name: '', is_active: true, display_order: 0, notes: '',
  });

  // Modal de edição de taxa
  const [editingRate, setEditingRate] = useState<{ provider: Provider; rate: Rate | null; method: Rate['method'] } | null>(null);
  const [rateForm, setRateForm] = useState({
    installment_fee_pct: '0',
    installment_fee_fixed: '0',
    anticipation_monthly_pct: '0',
    fixed_fee: '0',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      setIsAdmin(u?.role === 'admin');
    } catch { /* */ }
  }, []);

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Provider[] | { results: Provider[] }>(
        '/finance/payment-providers/',
        { include_inactive: '1' },
      );
      const list = Array.isArray(data) ? data : (data.results ?? []);
      setProviders(list);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao carregar bancos');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchProviders(); }, [fetchProviders]);

  // ─── Provider ─────────────────────────────────────────────────────────────

  const openNewProvider = () => {
    setIsNewProvider(true);
    setEditingProvider(null);
    setProviderForm({
      code: '', name: '', is_active: true,
      display_order: providers.length + 1, notes: '',
    });
  };

  const openEditProvider = (p: Provider) => {
    setIsNewProvider(false);
    setEditingProvider(p);
    setProviderForm({
      code: p.code, name: p.name, is_active: p.is_active,
      display_order: p.display_order, notes: p.notes,
    });
  };

  const saveProvider = async () => {
    if (!providerForm.name.trim()) {
      toast.error('Nome do banco é obrigatório');
      return;
    }
    const code = isNewProvider ? slugify(providerForm.code || providerForm.name) : providerForm.code;
    setSaving(true);
    try {
      if (isNewProvider) {
        await api.post('/finance/payment-providers/', { ...providerForm, code });
        toast.success('Banco cadastrado');
      } else if (editingProvider) {
        await api.patch(`/finance/payment-providers/${editingProvider.id}/`, providerForm);
        toast.success('Banco atualizado');
      }
      setEditingProvider(null);
      setIsNewProvider(false);
      fetchProviders();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  // ─── Rate ─────────────────────────────────────────────────────────────────

  const openEditRate = (provider: Provider, method: Rate['method']) => {
    const existing = provider.rates.find(r => r.method === method) || null;
    setEditingRate({ provider, rate: existing, method });
    if (existing) {
      setRateForm({
        installment_fee_pct: existing.installment_fee_pct,
        installment_fee_fixed: existing.installment_fee_fixed,
        anticipation_monthly_pct: existing.anticipation_monthly_pct,
        fixed_fee: existing.fixed_fee,
        notes: existing.notes,
      });
    } else {
      setRateForm({
        installment_fee_pct: '0',
        installment_fee_fixed: '0',
        anticipation_monthly_pct: '0',
        fixed_fee: '0',
        notes: '',
      });
    }
  };

  const saveRate = async () => {
    if (!editingRate) return;
    setSaving(true);
    try {
      const payload = {
        provider: editingRate.provider.id,
        method: editingRate.method,
        ...rateForm,
      };
      if (editingRate.rate) {
        await api.patch(`/finance/payment-provider-rates/${editingRate.rate.id}/`, payload);
      } else {
        await api.post('/finance/payment-provider-rates/', payload);
      }
      toast.success('Taxas atualizadas');
      setEditingRate(null);
      fetchProviders();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao salvar taxa');
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Landmark className="w-6 h-6 text-accent-gold" />
            Bancos e Taxas
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Gateways de pagamento (Asaas, PagSeguro, etc.) e suas taxas por método.
            {!isAdmin && ' (Somente administradores podem editar.)'}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={openNewProvider}
            className="flex items-center gap-2 px-4 py-2 bg-accent-gold hover:bg-accent-gold/90 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Novo banco
          </button>
        )}
      </div>

      {loading ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-card p-4">
          <TableSkeleton rows={3} />
        </div>
      ) : providers.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-card p-12 text-center text-gray-400">
          <Landmark className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Nenhum banco cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {providers.map(p => (
            <div
              key={p.id}
              className={`bg-white dark:bg-gray-800 rounded-xl shadow-card p-5 ${!p.is_active ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{p.name}</h2>
                    {p.is_active ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">ATIVO</span>
                    ) : (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500">INATIVO</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">{p.code}</p>
                  {p.notes && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{p.notes}</p>}
                </div>
                {isAdmin && (
                  <button
                    onClick={() => openEditProvider(p)}
                    className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                    title="Editar banco"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(['credit_card', 'boleto', 'pix'] as Rate['method'][]).sort((a, b) => METHOD_ORDER[a] - METHOD_ORDER[b]).map(method => {
                  const rate = p.rates.find(r => r.method === method);
                  return (
                    <div
                      key={method}
                      className="border border-gray-100 dark:border-gray-700 rounded-lg p-3 bg-gray-50/50 dark:bg-gray-900/30"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                          {METHOD_LABEL[method]}
                        </span>
                        {isAdmin && (
                          <button
                            onClick={() => openEditRate(p, method)}
                            className="text-[11px] font-medium text-accent-gold hover:underline"
                          >
                            {rate ? 'Editar' : 'Cadastrar'}
                          </button>
                        )}
                      </div>
                      {rate ? (
                        <ul className="space-y-1 text-xs text-gray-700 dark:text-gray-300">
                          {method === 'credit_card' ? (
                            <>
                              <li className="flex items-center gap-1">
                                <Percent className="w-3 h-3 text-gray-400" />
                                <span>{fmtPct(rate.installment_fee_pct)} + {fmtBRL(rate.installment_fee_fixed)}/parcela</span>
                              </li>
                              <li className="flex items-center gap-1">
                                <Percent className="w-3 h-3 text-gray-400" />
                                <span>Antecipação: {fmtPct(rate.anticipation_monthly_pct)}/mês</span>
                              </li>
                            </>
                          ) : (
                            <li className="flex items-center gap-1">
                              <DollarSign className="w-3 h-3 text-gray-400" />
                              <span>
                                {Number(rate.fixed_fee) > 0
                                  ? `Taxa fixa: ${fmtBRL(rate.fixed_fee)}`
                                  : 'Sem taxa'}
                              </span>
                            </li>
                          )}
                        </ul>
                      ) : (
                        <p className="text-xs text-gray-400">Não configurado</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Provider */}
      {(editingProvider || isNewProvider) && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => { setEditingProvider(null); setIsNewProvider(false); }}
        >
          <FocusTrap onClose={() => { setEditingProvider(null); setIsNewProvider(false); }}>
            <div
              className="bg-white dark:bg-gray-800 rounded-xl shadow-modal w-full max-w-md animate-modal-in"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {isNewProvider ? 'Novo banco' : 'Editar banco'}
                </h2>
                <button
                  onClick={() => { setEditingProvider(null); setIsNewProvider(false); }}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <FormField label="Nome" required>
                  {({ id }) => (
                    <input id={id} type="text" value={providerForm.name}
                      onChange={e => setProviderForm(p => ({ ...p, name: e.target.value }))}
                      className="input-field" placeholder="Ex: Asaas" />
                  )}
                </FormField>
                <FormField label="Código" helperText="Identificador único (será normalizado).">
                  {({ id }) => (
                    <input id={id} type="text" value={providerForm.code}
                      onChange={e => setProviderForm(p => ({ ...p, code: slugify(e.target.value) }))}
                      disabled={!isNewProvider}
                      className="input-field font-mono disabled:opacity-60"
                      placeholder="asaas" />
                  )}
                </FormField>
                <FormField label="Observações">
                  {({ id }) => (
                    <textarea id={id} value={providerForm.notes}
                      onChange={e => setProviderForm(p => ({ ...p, notes: e.target.value }))}
                      rows={2} className="input-field resize-none"
                      placeholder="Ex: Taxas vigentes a partir de…" />
                  )}
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Ordem">
                    {({ id }) => (
                      <input id={id} type="number" value={providerForm.display_order}
                        onChange={e => setProviderForm(p => ({ ...p, display_order: Number(e.target.value) }))}
                        className="input-field" />
                    )}
                  </FormField>
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={providerForm.is_active}
                        onChange={e => setProviderForm(p => ({ ...p, is_active: e.target.checked }))}
                        className="rounded border-gray-300 text-accent-gold focus:ring-accent-gold/40" />
                      Ativo
                    </label>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => { setEditingProvider(null); setIsNewProvider(false); }}
                  className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveProvider} disabled={saving}
                  className="px-4 py-2 text-sm font-medium bg-accent-gold hover:bg-accent-gold/90 text-white rounded-lg disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </FocusTrap>
        </div>
      )}

      {/* Modal Rate */}
      {editingRate && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setEditingRate(null)}
        >
          <FocusTrap onClose={() => setEditingRate(null)}>
            <div
              className="bg-white dark:bg-gray-800 rounded-xl shadow-modal w-full max-w-md animate-modal-in"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    Taxas — {METHOD_LABEL[editingRate.method]}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">{editingRate.provider.name}</p>
                </div>
                <button onClick={() => setEditingRate(null)}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                {editingRate.method === 'credit_card' ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <FormField label="Taxa por parcela (%)" helperText="Ex: 3.99 = 3,99%">
                        {({ id }) => (
                          <input id={id} type="number" step="0.0001" min="0"
                            value={rateForm.installment_fee_pct}
                            onChange={e => setRateForm(p => ({ ...p, installment_fee_pct: e.target.value }))}
                            className="input-field" />
                        )}
                      </FormField>
                      <FormField label="Taxa fixa (R$/parcela)">
                        {({ id }) => (
                          <input id={id} type="number" step="0.01" min="0"
                            value={rateForm.installment_fee_fixed}
                            onChange={e => setRateForm(p => ({ ...p, installment_fee_fixed: e.target.value }))}
                            className="input-field" />
                        )}
                      </FormField>
                    </div>
                    <FormField label="Taxa de antecipação mensal (%)" helperText="Ex: 1.70 = 1,70% ao mês">
                      {({ id }) => (
                        <input id={id} type="number" step="0.0001" min="0"
                          value={rateForm.anticipation_monthly_pct}
                          onChange={e => setRateForm(p => ({ ...p, anticipation_monthly_pct: e.target.value }))}
                          className="input-field" />
                      )}
                    </FormField>
                  </>
                ) : (
                  <FormField label="Taxa fixa por emissão (R$)" helperText={`Para ${METHOD_LABEL[editingRate.method]}, geralmente 0.`}>
                    {({ id }) => (
                      <input id={id} type="number" step="0.01" min="0"
                        value={rateForm.fixed_fee}
                        onChange={e => setRateForm(p => ({ ...p, fixed_fee: e.target.value }))}
                        className="input-field" />
                    )}
                  </FormField>
                )}
                <FormField label="Observações">
                  {({ id }) => (
                    <input id={id} type="text" value={rateForm.notes}
                      onChange={e => setRateForm(p => ({ ...p, notes: e.target.value }))}
                      className="input-field" placeholder="Ex: vigente a partir de 01/04/2026" />
                  )}
                </FormField>
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700">
                <button onClick={() => setEditingRate(null)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                  Cancelar
                </button>
                <button onClick={saveRate} disabled={saving}
                  className="px-4 py-2 text-sm font-medium bg-accent-gold hover:bg-accent-gold/90 text-white rounded-lg disabled:opacity-50">
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </FocusTrap>
        </div>
      )}
    </div>
  );
}
