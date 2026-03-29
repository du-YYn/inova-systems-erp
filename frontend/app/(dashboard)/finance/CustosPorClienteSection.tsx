'use client';
import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import FocusTrap from '@/components/ui/FocusTrap';
import { Sensitive } from '@/components/ui/Sensitive';
import api from '@/lib/api';

const fmt = (v: number | string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));

const COST_TYPE_LABELS: Record<string, string> = {
  license_erp: 'Lic. Sist. Parceiro',
  license_botconversa: 'BotConversa',
  license_zapi: 'Z-API',
  reserve_zapi: 'Reserva Z-API',
  commission_closer: 'Comissão Closer',
  commission_sdr: 'Comissão SDR',
  miv: 'MIV',
  designer: 'Designer',
  other: 'Outro',
};

interface ClientCost {
  id: number;
  customer: number;
  customer_name: string;
  cost_type: string;
  cost_type_display: string;
  value: string;
  reference_month: string;
  notes: string;
}

interface Props {
  isDemoMode: boolean;
  customers: { id: number; company_name: string; name: string }[];
}

const EMPTY = { customer: '', cost_type: 'license_erp', value: '', reference_month: '', notes: '' };

export default function CustosPorClienteSection({ isDemoMode, customers }: Props) {
  const toast = useToast();
  const [items, setItems] = useState<ClientCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ClientCost | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [delTarget, setDelTarget] = useState<ClientCost | null>(null);
  const [refMonth, setRefMonth] = useState(new Date().toISOString().slice(0, 7));
  const [filterCustomer, setFilterCustomer] = useState('');

  const lbl = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { month: refMonth + '-01' };
      if (filterCustomer) params.customer = filterCustomer;
      const d = await api.get<{ results: ClientCost[] } | ClientCost[]>('/finance/client-costs/', params);
      const list = (d as { results: ClientCost[] }).results ?? d;
      setItems(Array.isArray(list) ? list : []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [refMonth, filterCustomer]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY, reference_month: refMonth + '-01' });
    setShowModal(true);
  };

  const openEdit = (c: ClientCost) => {
    setEditing(c);
    setForm({
      customer: String(c.customer),
      cost_type: c.cost_type,
      value: c.value,
      reference_month: c.reference_month,
      notes: c.notes,
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, customer: Number(form.customer) };
      if (editing) await api.patch(`/finance/client-costs/${editing.id}/`, payload);
      else await api.post('/finance/client-costs/', payload);
      toast.success('Salvo!');
      setShowModal(false);
      fetchData();
    } catch { toast.error('Erro ao salvar.'); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!delTarget) return;
    try {
      await api.delete(`/finance/client-costs/${delTarget.id}/`);
      toast.success('Removido.');
      setDelTarget(null);
      fetchData();
    } catch { toast.error('Erro.'); }
  };

  const total = items.reduce((s, c) => s + Number(c.value), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm text-gray-500 dark:text-gray-400">Mês:</label>
          <input type="month" value={refMonth} onChange={e => setRefMonth(e.target.value)} className="input-field w-40" />
          <label className="text-sm text-gray-500 dark:text-gray-400">Cliente:</label>
          <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} className="input-field w-48 bg-white dark:bg-gray-800">
            <option value="">Todos</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.company_name || c.name}</option>
            ))}
          </select>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark">
          <Plus className="w-4 h-4" /> Novo Custo
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-gray-400">Nenhum custo neste mês.</div>
        ) : (
          <table className="w-full table-premium">
            <thead>
              <tr>
                <th className="text-left">Cliente</th>
                <th className="text-left">Tipo</th>
                <th className="text-right">Valor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map(c => (
                <tr key={c.id}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{c.customer_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{COST_TYPE_LABELS[c.cost_type] || c.cost_type_display || c.cost_type}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">
                    <Sensitive>{fmt(c.value)}</Sensitive>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(c)} className="p-1.5 text-gray-400 hover:text-accent-gold"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => setDelTarget(c)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="bg-gray-50 dark:bg-gray-700/30 font-semibold">
                <td className="px-4 py-3 text-sm" colSpan={2}>TOTAL</td>
                <td className="px-4 py-3 text-sm text-right"><Sensitive>{fmt(total)}</Sensitive></td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <FocusTrap onClose={() => setShowModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 shadow-modal animate-modal-in">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar' : 'Novo'} Custo por Cliente</h2>
                <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className={lbl}>Cliente *</label>
                  <select required value={form.customer} onChange={e => setForm({ ...form, customer: e.target.value })} className="input-field bg-white dark:bg-gray-800">
                    <option value="">Selecione...</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.company_name || c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Tipo *</label>
                  <select required value={form.cost_type} onChange={e => setForm({ ...form, cost_type: e.target.value })} className="input-field bg-white dark:bg-gray-800">
                    {Object.entries(COST_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Valor (R$) *</label>
                  <input type="number" step="0.01" required value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
                </div>
                <div>
                  <label className={lbl}>Mês Referência *</label>
                  <input type="date" required value={form.reference_month} onChange={e => setForm({ ...form, reference_month: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className={lbl}>Observação</label>
                  <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-field" />
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 rounded-lg">Cancelar</button>
                  <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar'}</button>
                </div>
              </form>
            </div>
          </FocusTrap>
        </div>
      )}

      <ConfirmDialog
        open={!!delTarget}
        title="Remover Custo"
        description={`Remover custo ${COST_TYPE_LABELS[delTarget?.cost_type || ''] || ''} de ${delTarget?.customer_name || ''}?`}
        onConfirm={handleDelete}
        onCancel={() => setDelTarget(null)}
        danger
      />
    </div>
  );
}
