'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, CheckCircle, Calendar, Zap, TrendingDown, Wallet, CreditCard, Banknote } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import FocusTrap from '@/components/ui/FocusTrap';
import api, { ApiError } from '@/lib/api';

// ─── Types ─────────────────────────────────────────────────────────

interface Provider {
  id: number;
  code: string;
  name: string;
  is_active: boolean;
  rates: Array<{
    method: 'pix' | 'credit_card' | 'boleto';
    installment_fee_pct: string;
    installment_fee_fixed: string;
    anticipation_monthly_pct: string;
    fixed_fee: string;
  }>;
}

interface ScheduleItem {
  sequence: number;
  days_ahead: number;
  amount: string | number;
  label: string;
}

interface SimulationResult {
  method: 'pix' | 'credit_card' | 'boleto' | 'recurring';
  client_pays: string | number;
  client_installment_value: string | number;
  company_receives_total: string | number;
  company_schedule: ScheduleItem[];
  details: Record<string, any>;
  provider: { id: number; code: string; name: string };
}

type ActivationMode = 'pix' | 'card_anticipated' | 'card_installments' | 'boleto';

interface Contract {
  id: number;
  number: string;
  title: string;
  monthly_value: string | null;
  customer_name: string;
}

interface Props {
  contract: Contract;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────

const formatCurrency = (v: string | number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));

const formatDaysAhead = (days: number): string => {
  if (days === 0) return 'Hoje';
  if (days <= 3) return `D+${days}`;
  const months = Math.round(days / 30);
  return months === 1 ? '30 dias' : `${months} meses`;
};

const MODE_LABELS: Record<ActivationMode, { label: string; icon: any; desc: string }> = {
  pix:                { label: 'PIX à vista',           icon: Zap,         desc: 'Pagamento único, recebimento imediato.' },
  card_anticipated:   { label: 'Cartão antecipado',     icon: TrendingDown,desc: 'Cliente parcela, empresa recebe à vista (com desconto).' },
  card_installments:  { label: 'Cartão parcelado',      icon: CreditCard,  desc: 'Cliente parcela, empresa recebe cada parcela no seu mês.' },
  boleto:             { label: 'Boleto parcelado',      icon: Banknote,    desc: 'Divisão simples em N boletos mensais.' },
};

// ─── Component ──────────────────────────────────────────────────────

export default function ContractActivationModal({ contract, open, onClose, onSuccess }: Props) {
  const toast = useToast();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [providerId, setProviderId] = useState<number | null>(null);

  const [setupValue, setSetupValue] = useState<number>(0);
  const [loadingContract, setLoadingContract] = useState(false);

  const [mode, setMode] = useState<ActivationMode>('pix');
  const [installments, setInstallments] = useState(12);
  const [repassFee, setRepassFee] = useState(false);

  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  const [activating, setActivating] = useState(false);

  // Fetch providers + contract detail (setup value) when modal opens
  useEffect(() => {
    if (!open) return;
    setLoadingProviders(true);
    api.get<Provider[] | { results: Provider[] }>('/finance/payment-providers/')
      .then((data) => {
        const list = Array.isArray(data) ? data : (data.results || []);
        setProviders(list);
        if (list.length > 0 && !providerId) {
          setProviderId(list[0].id);
        }
      })
      .catch((err) => {
        toast.error(err instanceof ApiError ? err.message : 'Erro ao carregar providers.');
      })
      .finally(() => setLoadingProviders(false));

    setLoadingContract(true);
    api.get<{ payment_plan?: { one_time_amount?: string | number } }>(`/sales/contracts/${contract.id}/`)
      .then((data) => {
        const oneTime = Number(data.payment_plan?.one_time_amount || 0);
        setSetupValue(oneTime);
      })
      .catch(() => {
        setSetupValue(0);
      })
      .finally(() => setLoadingContract(false));
  }, [open, contract.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Build payload for simulation
  const payload = useMemo(() => {
    if (!providerId || setupValue <= 0) return null;
    const gross = setupValue.toFixed(2);
    if (mode === 'pix') {
      return { method: 'pix', gross };
    }
    if (mode === 'boleto') {
      return { method: 'boleto', gross, installments };
    }
    if (mode === 'card_anticipated') {
      return { method: 'credit_card', gross, installments, anticipate: true, repass_fee: repassFee };
    }
    // card_installments
    return { method: 'credit_card', gross, installments, anticipate: false, repass_fee: repassFee };
  }, [providerId, setupValue, mode, installments, repassFee]);

  // Simulate when payload changes (debounced)
  useEffect(() => {
    if (!payload || !providerId) {
      setSimulation(null);
      return;
    }
    const timer = setTimeout(async () => {
      setSimulating(true);
      setSimError(null);
      try {
        const data = await api.post<SimulationResult>(
          `/finance/payment-providers/${providerId}/simulate/`,
          payload,
        );
        setSimulation(data);
      } catch (err) {
        setSimError(err instanceof ApiError ? err.message : 'Erro na simulação.');
        setSimulation(null);
      } finally {
        setSimulating(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [payload, providerId]);

  const handleActivate = async () => {
    if (!providerId || !simulation) return;
    setActivating(true);
    try {
      await api.post(`/sales/contracts/${contract.id}/activate/`, {
        payment_provider: providerId,
        activation_mode: mode,
        installments: (mode === 'pix') ? 1 : installments,
        anticipate: mode === 'card_anticipated',
        repass_fee: (mode === 'card_anticipated' || mode === 'card_installments') ? repassFee : false,
      });
      toast.success('Contrato ativado!');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao ativar contrato.');
    } finally {
      setActivating(false);
    }
  };

  if (!open) return null;

  const showInstallments = mode !== 'pix';
  const showRepass = mode === 'card_anticipated' || mode === 'card_installments';
  const monthlyValue = Number(contract.monthly_value || 0);

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={onClose}
    >
      <FocusTrap onClose={onClose}>
        <div
          className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-modal animate-modal-in"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Ativar Contrato {contract.number}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Cliente: <span className="font-medium text-gray-700 dark:text-gray-300">{contract.customer_name}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
              aria-label="Fechar"
            >
              <X className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Resumo do contrato */}
            <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 dark:bg-gray-900/40 rounded-lg border border-gray-100 dark:border-gray-700">
              <div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Setup</div>
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {loadingContract ? '…' : formatCurrency(setupValue)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Mensalidade</div>
                <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(monthlyValue)}</div>
              </div>
            </div>

            {!loadingContract && setupValue <= 0 && monthlyValue <= 0 && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 text-xs rounded-lg border border-yellow-200 dark:border-yellow-800/30">
                <strong>Aviso:</strong> contrato sem setup nem mensalidade cadastrados. Edite o contrato antes de ativar.
              </div>
            )}

            {/* Provider */}
            <div>
              <label className="label-input">Gateway / Banco *</label>
              <select
                required
                value={providerId ?? ''}
                onChange={(e) => setProviderId(Number(e.target.value))}
                disabled={loadingProviders}
                className="input-field bg-white dark:bg-gray-800"
              >
                {loadingProviders && <option>Carregando…</option>}
                {!loadingProviders && providers.length === 0 && (
                  <option value="">Nenhum provider cadastrado — configure em /configuracoes/bancos</option>
                )}
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Método (4 cards) */}
            <div>
              <label className="label-input">Método de Cobrança do Setup *</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {(Object.keys(MODE_LABELS) as ActivationMode[]).map((m) => {
                  const meta = MODE_LABELS[m];
                  const Icon = meta.icon;
                  const isActive = mode === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        isActive
                          ? 'border-accent-gold bg-accent-gold/5'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <Icon className={`w-5 h-5 mb-1.5 ${isActive ? 'text-accent-gold' : 'text-gray-500 dark:text-gray-400'}`} />
                      <div className="text-xs font-semibold text-gray-900 dark:text-gray-100">{meta.label}</div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">{meta.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Parcelas */}
            {showInstallments && (
              <div>
                <label className="label-input">Parcelas *</label>
                <select
                  value={installments}
                  onChange={(e) => setInstallments(Number(e.target.value))}
                  className="input-field bg-white dark:bg-gray-800"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                    <option key={n} value={n}>{n}x</option>
                  ))}
                </select>
              </div>
            )}

            {/* Repasse */}
            {showRepass && (
              <label className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800/30 cursor-pointer">
                <input
                  type="checkbox"
                  checked={repassFee}
                  onChange={(e) => setRepassFee(e.target.checked)}
                  className="mt-0.5"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Repassar taxa ao cliente</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    Cliente paga a taxa embutida — empresa recebe o bruto desejado.
                  </div>
                </div>
              </label>
            )}

            {/* Simulação */}
            <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-1.5">
                <Wallet className="w-4 h-4" /> Simulação
                {simulating && <span className="text-xs text-gray-400 font-normal">(calculando…)</span>}
              </h3>

              {simError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs rounded-lg border border-red-200 dark:border-red-800/30">
                  {simError}
                </div>
              )}

              {simulation && !simError && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-gray-50 dark:bg-gray-900/40 rounded-lg">
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cliente paga</div>
                      <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(simulation.client_pays)}</div>
                      {showInstallments && (
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                          {installments}x {formatCurrency(simulation.client_installment_value)}
                        </div>
                      )}
                    </div>
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-100 dark:border-green-800/30">
                      <div className="text-[10px] text-green-700 dark:text-green-300 uppercase tracking-wider">Empresa recebe</div>
                      <div className="text-sm font-bold text-green-700 dark:text-green-300">{formatCurrency(simulation.company_receives_total)}</div>
                    </div>
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-100 dark:border-amber-800/30">
                      <div className="text-[10px] text-amber-700 dark:text-amber-300 uppercase tracking-wider">Taxa retida</div>
                      <div className="text-sm font-bold text-amber-700 dark:text-amber-300">
                        {formatCurrency(Number(simulation.client_pays) - Number(simulation.company_receives_total))}
                      </div>
                    </div>
                  </div>

                  {simulation.company_schedule.length > 0 && (
                    <div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Cronograma de recebimento
                      </div>
                      <div className="max-h-32 overflow-y-auto border border-gray-100 dark:border-gray-700 rounded">
                        <table className="w-full text-xs">
                          <tbody>
                            {simulation.company_schedule.map((s) => (
                              <tr key={s.sequence} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                                <td className="px-2 py-1 text-gray-500 dark:text-gray-400 w-12">#{s.sequence}</td>
                                <td className="px-2 py-1 text-gray-700 dark:text-gray-300">{s.label}</td>
                                <td className="px-2 py-1 text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDaysAhead(s.days_ahead)}</td>
                                <td className="px-2 py-1 text-right font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                                  {formatCurrency(s.amount)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!simulation && !simError && !simulating && (
                <div className="p-3 text-center text-xs text-gray-500 dark:text-gray-400">
                  Selecione provider e método para ver a simulação.
                </div>
              )}
            </div>

            {monthlyValue > 0 && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-xs rounded-lg border border-blue-200 dark:border-blue-800/30">
                <strong>Mensalidade:</strong> {formatCurrency(monthlyValue)}/mês — será gerada como receita recorrente (MRR) ao ativar.
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-gray-700">
            <Button type="button" variant="secondary" onClick={onClose} disabled={activating}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleActivate}
              disabled={(setupValue > 0 && !simulation) || simulating || activating || !providerId || loadingContract}
            >
              <CheckCircle className="w-4 h-4 mr-1" />
              {activating ? 'Ativando…' : 'Ativar Contrato'}
            </Button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
