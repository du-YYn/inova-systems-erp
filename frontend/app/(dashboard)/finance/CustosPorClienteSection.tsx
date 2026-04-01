'use client';
import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, X, Monitor, Users as UsersIcon, Server, DollarSign, Package, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import FocusTrap from '@/components/ui/FocusTrap';
import { Sensitive } from '@/components/ui/Sensitive';
import api from '@/lib/api';

const fmt = (v: number | string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));

interface ClientCost {
  id: number; customer: number; customer_name: string;
  cost_category: string; cost_category_display: string;
  description: string; value: string; frequency: string;
  reference_month: string; notes: string;
}

interface Props {
  isDemoMode: boolean;
  customers: { id: number; company_name: string; name: string }[];
}

const CATEGORIES = [
  { key: 'sistemas', label: 'Sistemas', icon: Monitor, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30',
    presets: ['Licença White Label', 'BotConversa', 'Z-API', 'Reserva Z-API', 'Hosting/Servidor', 'Make (automação)', 'ChatGPT / IA', 'CRM/ERP'] },
  { key: 'pessoas', label: 'Pessoas', icon: UsersIcon, color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/30',
    presets: ['Desenvolvedor Backend', 'Desenvolvedor Frontend', 'Desenvolvedor Full Stack', 'Desenvolvedor Mobile', 'Designer UI/UX', 'Designer Gráfico', 'Gerente de Projeto', 'Scrum Master', 'Product Owner', 'Analista de Requisitos', 'QA / Tester', 'DevOps / Infra', 'Suporte / CS', 'Social Media', 'Gestor de Tráfego', 'Copywriter', 'Editor de Vídeo', 'Consultor'] },
  { key: 'infraestrutura', label: 'Infraestrutura', icon: Server, color: 'text-green-600 bg-green-50 dark:bg-green-900/30',
    presets: ['Servidor/Cloud (AWS, GCP, Azure)', 'Domínio', 'CDN', 'SSL/Certificado', 'VPS', 'Backup', 'E-mail corporativo'] },
  { key: 'comercial', label: 'Comercial', icon: DollarSign, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30',
    presets: ['Comissão Closer', 'Comissão SDR', 'MIV (custo de lead)', 'Designer (arte de venda)', 'Anúncios/Tráfego pago', 'Bônus por meta'] },
  { key: 'outro', label: 'Outro', icon: Package, color: 'text-gray-600 bg-gray-50 dark:bg-gray-700/50',
    presets: [] },
];

const CAT_ICONS: Record<string, { icon: typeof Monitor; color: string }> = Object.fromEntries(
  CATEGORIES.map(c => [c.key, { icon: c.icon, color: c.color }])
);

const lbl = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1';

const FREQ_LABELS: Record<string, string> = { one_time: 'Único', monthly: 'Mensal', quarterly: 'Trimestral', semiannual: 'Semestral', yearly: 'Anual' };
interface CartItem { cost_category: string; description: string; value: string; frequency: string; }

export default function CustosPorClienteSection({ isDemoMode, customers }: Props) {
  const toast = useToast();
  const [items, setItems] = useState<ClientCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refMonth, setRefMonth] = useState(new Date().toISOString().slice(0, 7));
  const [delTarget, setDelTarget] = useState<ClientCost | null>(null);
  const [expandedCustomers, setExpandedCustomers] = useState<Record<number, boolean>>({});

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalCustomer, setModalCustomer] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [savingCart, setSavingCart] = useState(false);

  // Add item step
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [itemDesc, setItemDesc] = useState('');
  const [itemValue, setItemValue] = useState('');
  const [itemFrequency, setItemFrequency] = useState('monthly');
  const [customDesc, setCustomDesc] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (refMonth) params.month = refMonth + '-01';
      const d = await api.get<{ results: ClientCost[] } | ClientCost[]>('/finance/client-costs/', params);
      const list = (d as { results: ClientCost[] }).results ?? d;
      setItems(Array.isArray(list) ? list : []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [refMonth]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const openModal = () => {
    setModalCustomer('');
    setCart([]);
    setSelectedCat(null);
    setItemDesc(''); setItemValue(''); setItemFrequency('monthly');
    setShowModal(true);
  };

  const addToCart = () => {
    if (!selectedCat || !itemDesc.trim() || !itemValue) { toast.error('Preencha categoria, descrição e valor.'); return; }
    setCart(prev => [...prev, { cost_category: selectedCat, description: itemDesc.trim(), value: itemValue, frequency: itemFrequency }]);
    setItemDesc(''); setItemValue(''); setItemFrequency('monthly'); setCustomDesc(false);
    setSelectedCat(null);
  };

  const removeFromCart = (idx: number) => setCart(prev => prev.filter((_, i) => i !== idx));

  const handleSaveAll = async () => {
    if (!modalCustomer) { toast.error('Selecione um cliente.'); return; }
    if (cart.length === 0) { toast.error('Adicione pelo menos um item.'); return; }
    setSavingCart(true);
    let refDate = refMonth;
    if (refDate && !refDate.match(/^\d{4}-\d{2}-\d{2}$/)) refDate += '-01';
    try {
      for (const item of cart) {
        await api.post('/finance/client-costs/', {
          customer: Number(modalCustomer),
          cost_category: item.cost_category,
          description: item.description,
          value: Number(item.value),
          frequency: item.frequency,
          reference_month: refDate,
        });
      }
      toast.success(`${cart.length} custo${cart.length > 1 ? 's' : ''} cadastrado${cart.length > 1 ? 's' : ''}!`);
      setShowModal(false);
      fetchData();
    } catch { toast.error('Erro ao salvar custos.'); }
    finally { setSavingCart(false); }
  };

  const handleDelete = async () => {
    if (!delTarget) return;
    try { await api.delete(`/finance/client-costs/${delTarget.id}/`); toast.success('Removido.'); setDelTarget(null); fetchData(); }
    catch { toast.error('Erro.'); }
  };

  const toggleCustomer = (id: number) => setExpandedCustomers(prev => ({ ...prev, [id]: !prev[id] }));

  // Group items by customer
  const grouped: Record<number, { name: string; items: ClientCost[]; total: number }> = {};
  items.forEach(item => {
    if (!grouped[item.customer]) grouped[item.customer] = { name: item.customer_name, items: [], total: 0 };
    grouped[item.customer].items.push(item);
    grouped[item.customer].total += Number(item.value);
  });

  const grandTotal = items.reduce((s, i) => s + Number(i.value), 0);
  const cartTotal = cart.reduce((s, i) => s + Number(i.value || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Custos por Cliente</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Sistemas, pessoas, infraestrutura e comercial</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input type="month" value={refMonth} onChange={e => setRefMonth(e.target.value)} className="input-field w-40 text-sm" />
          <button onClick={openModal} className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark text-sm font-medium">
            <Plus className="w-4 h-4" /> Novo Custo
          </button>
        </div>
      </div>

      {/* Lista agrupada por cliente */}
      <div className="space-y-3">
        {loading ? <div className="p-8 text-center text-gray-400">Carregando...</div> : Object.keys(grouped).length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-12 text-center text-gray-400">
            <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>Nenhum custo cadastrado para este mês.</p>
          </div>
        ) : (
          <>
            {Object.entries(grouped).map(([custId, g]) => {
              const isOpen = expandedCustomers[Number(custId)] !== false;
              return (
                <div key={custId} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                  <button onClick={() => toggleCustomer(Number(custId))}
                    className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-accent-gold/10 rounded-full flex items-center justify-center">
                        <span className="text-xs font-bold text-accent-gold">{g.name.charAt(0)}</span>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100"><Sensitive>{g.name}</Sensitive></p>
                        <p className="text-[10px] text-gray-400">{g.items.length} custo{g.items.length > 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-100"><Sensitive>{fmt(g.total)}</Sensitive>/mês</span>
                      {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="border-t border-gray-100 dark:border-gray-700">
                      <table className="w-full text-sm">
                        <tbody>
                          {g.items.map(item => {
                            const catInfo = CAT_ICONS[item.cost_category] || CAT_ICONS.outro;
                            const CatIcon = catInfo.icon;
                            return (
                              <tr key={item.id} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/20">
                                <td className="px-4 py-2.5 w-8">
                                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${catInfo.color}`}>
                                    <CatIcon className="w-3.5 h-3.5" />
                                  </div>
                                </td>
                                <td className="py-2.5">
                                  <p className="text-xs font-medium text-gray-900 dark:text-gray-100">{item.description}</p>
                                  <p className="text-[10px] text-gray-400">{item.cost_category_display} • {FREQ_LABELS[item.frequency] || item.frequency}</p>
                                </td>
                                <td className="px-4 py-2.5 text-right text-xs font-semibold text-gray-900 dark:text-gray-100"><Sensitive>{fmt(item.value)}</Sensitive></td>
                                <td className="px-4 py-2.5 w-10">
                                  <button onClick={() => setDelTarget(item)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex justify-end px-2">
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Total Geral: <Sensitive>{fmt(grandTotal)}</Sensitive>/mês</span>
            </div>
          </>
        )}
      </div>

      {/* Modal — Carrinho de custos */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <FocusTrap onClose={() => setShowModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto shadow-modal animate-modal-in">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Custos do Cliente</h2>
                <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
              </div>

              {/* Cliente */}
              <div className="mb-4">
                <label className={lbl}>Cliente *</label>
                <select required value={modalCustomer} onChange={e => setModalCustomer(e.target.value)} className="input-field bg-white dark:bg-gray-800">
                  <option value="">Selecione</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.company_name || c.name}</option>)}
                </select>
              </div>

              {/* Carrinho */}
              {cart.length > 0 && (
                <div className="mb-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Itens adicionados</p>
                  <div className="space-y-2">
                    {cart.map((item, idx) => {
                      const catInfo = CATEGORIES.find(c => c.key === item.cost_category);
                      return (
                        <div key={idx} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-medium text-gray-400 uppercase">{catInfo?.label}</span>
                            <span className="text-xs font-medium text-gray-900 dark:text-gray-100">{item.description}</span>
                            <span className="text-[9px] text-gray-400">{FREQ_LABELS[item.frequency] || ''}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{fmt(item.value)}</span>
                            <button onClick={() => removeFromCart(idx)} className="p-0.5 text-gray-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-end mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100">Total: {fmt(cartTotal)}/mês</span>
                  </div>
                </div>
              )}

              {/* Adicionar item */}
              <div className="border border-dashed border-gray-200 dark:border-gray-600 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">+ Adicionar item</p>

                {/* Step 1: Selecionar categoria */}
                {!selectedCat ? (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {CATEGORIES.map(cat => (
                      <button key={cat.key} type="button" onClick={() => setSelectedCat(cat.key)}
                        className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-accent-gold hover:bg-accent-gold/5 transition-all text-center">
                        <cat.icon className={`w-5 h-5 mx-auto mb-1 ${cat.color.split(' ')[0]}`} />
                        <p className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">{cat.label}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <>
                    {/* Step 2: Selecionar/digitar item */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-accent-gold uppercase">{CATEGORIES.find(c => c.key === selectedCat)?.label}</span>
                        <button onClick={() => setSelectedCat(null)} className="text-[10px] text-gray-400 hover:text-gray-600">← Trocar categoria</button>
                      </div>

                      {/* Presets + Personalizado */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto pr-1">
                        {(CATEGORIES.find(c => c.key === selectedCat)?.presets || []).map(preset => (
                          <button key={preset} type="button" onClick={() => { setItemDesc(preset); setCustomDesc(false); }}
                            className={`text-[11px] px-2.5 py-1.5 rounded-lg border text-left transition-colors ${itemDesc === preset && !customDesc ? 'border-accent-gold bg-accent-gold/10 text-accent-gold font-medium' : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                            {preset}
                          </button>
                        ))}
                        <button type="button" onClick={() => { setItemDesc(''); setCustomDesc(true); }}
                          className={`text-[11px] px-2.5 py-1.5 rounded-lg border text-left transition-colors ${customDesc ? 'border-accent-gold bg-accent-gold/10 text-accent-gold font-medium' : 'border-dashed border-gray-300 dark:border-gray-600 text-gray-400 hover:border-accent-gold hover:text-accent-gold'}`}>
                          + Personalizado
                        </button>
                      </div>

                      {/* Campo descrição: sempre visível se personalizado, ou editável se preset */}
                      <div>
                        <label className={lbl}>{customDesc ? 'Nome personalizado *' : 'Descrição *'}</label>
                        <input type="text" value={itemDesc} onChange={e => setItemDesc(e.target.value)}
                          className="input-field" placeholder={customDesc ? 'Digite o nome do custo...' : 'Selecione acima ou digite'}
                          autoFocus={customDesc} />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={lbl}>Valor (R$) *</label>
                          <input type="number" step="0.01" min="0" value={itemValue} onChange={e => setItemValue(e.target.value)} className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
                        </div>
                        <div>
                          <label className={lbl}>Frequência</label>
                          <select value={itemFrequency} onChange={e => setItemFrequency(e.target.value)} className="input-field bg-white dark:bg-gray-800">
                            {Object.entries(FREQ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </div>
                      </div>

                      <button type="button" onClick={addToCart}
                        className="w-full flex items-center justify-center gap-2 py-2 border border-accent-gold/30 text-accent-gold rounded-lg hover:bg-accent-gold/5 text-sm font-medium transition-colors">
                        <Plus className="w-4 h-4" /> Adicionar ao carrinho
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Salvar */}
              <div className="flex gap-3 pt-6">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 rounded-lg">Cancelar</button>
                <button type="button" onClick={handleSaveAll} disabled={savingCart || cart.length === 0 || !modalCustomer}
                  className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg disabled:opacity-60">
                  {savingCart ? 'Salvando...' : `Salvar ${cart.length} custo${cart.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </FocusTrap>
        </div>
      )}

      <ConfirmDialog open={!!delTarget} title="Remover Custo" description={`Remover "${delTarget?.description}" de ${delTarget?.customer_name}?`} onConfirm={handleDelete} onCancel={() => setDelTarget(null)} danger />
    </div>
  );
}
