'use client';
import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import FocusTrap from '@/components/ui/FocusTrap';
import { Sensitive } from '@/components/ui/Sensitive';
import api from '@/lib/api';

const fmt = (v: number | string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));

interface Asset {
  id: number;
  name: string;
  quantity: number;
  unit_value: string;
  useful_life_months: number;
  acquisition_date: string;
  monthly_depreciation: string;
  total_value: number;
  life_used_months: number;
  is_active: boolean;
  notes: string;
}

const EMPTY = { name: '', quantity: '1', unit_value: '', useful_life_months: '', acquisition_date: '', notes: '' };

export default function AtivosSection({ isDemoMode }: { isDemoMode: boolean }) {
  const toast = useToast();
  const [items, setItems] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [delTarget, setDelTarget] = useState<Asset | null>(null);

  const lbl = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<{ results: Asset[] } | Asset[]>('/finance/assets/');
      const list = (d as { results: Asset[] }).results ?? d;
      setItems(Array.isArray(list) ? list : []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setShowModal(true);
  };

  const openEdit = (a: Asset) => {
    setEditing(a);
    setForm({
      name: a.name,
      quantity: String(a.quantity),
      unit_value: a.unit_value,
      useful_life_months: String(a.useful_life_months),
      acquisition_date: a.acquisition_date,
      notes: a.notes,
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        quantity: Number(form.quantity),
        useful_life_months: Number(form.useful_life_months),
      };
      if (editing) await api.patch(`/finance/assets/${editing.id}/`, payload);
      else await api.post('/finance/assets/', payload);
      toast.success('Salvo!');
      setShowModal(false);
      fetchData();
    } catch { toast.error('Erro ao salvar.'); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!delTarget) return;
    try {
      await api.delete(`/finance/assets/${delTarget.id}/`);
      toast.success('Removido.');
      setDelTarget(null);
      fetchData();
    } catch { toast.error('Erro.'); }
  };

  const totalDepreciation = items.reduce((s, a) => s + Number(a.monthly_depreciation), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div />
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark">
          <Plus className="w-4 h-4" /> Novo Ativo
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Carregando...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-gray-400">Nenhum ativo cadastrado.</div>
        ) : (
          <table className="w-full table-premium">
            <thead>
              <tr>
                <th className="text-left">Nome</th>
                <th className="text-right">Qtd</th>
                <th className="text-right">Valor Unit.</th>
                <th className="text-center">Vida Útil</th>
                <th className="text-right">Deprec./mês</th>
                <th className="w-32">Progresso</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map(a => {
                const lifeUsed = a.life_used_months ?? 0;
                const usefulLife = a.useful_life_months ?? 1;
                const pct = Math.min((lifeUsed / usefulLife) * 100, 100);
                return (
                  <tr key={a.id}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{a.name}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-500">{a.quantity}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-gray-100">
                      <Sensitive>{fmt(a.unit_value)}</Sensitive>
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-gray-500">{a.useful_life_months} meses</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">
                      <Sensitive>{fmt(a.monthly_depreciation)}</Sensitive>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                          <div className="h-2 rounded-full bg-accent-gold" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap">{lifeUsed}/{usefulLife}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => openEdit(a)} className="p-1.5 text-gray-400 hover:text-accent-gold"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => setDelTarget(a)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-gray-50 dark:bg-gray-700/30 font-semibold">
                <td className="px-4 py-3 text-sm" colSpan={4}>TOTAL DEPRECIAÇÃO MENSAL</td>
                <td className="px-4 py-3 text-sm text-right"><Sensitive>{fmt(totalDepreciation)}</Sensitive></td>
                <td colSpan={2} />
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
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar' : 'Novo'} Ativo</h2>
                <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className={lbl}>Nome *</label>
                  <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Quantidade *</label>
                    <input type="number" min="1" required value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className="input-field" />
                  </div>
                  <div>
                    <label className={lbl}>Valor Unitário (R$) *</label>
                    <input type="number" step="0.01" required value={form.unit_value} onChange={e => setForm({ ...form, unit_value: e.target.value })} className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Vida Útil (meses) *</label>
                    <input type="number" min="1" required value={form.useful_life_months} onChange={e => setForm({ ...form, useful_life_months: e.target.value })} className="input-field" />
                  </div>
                  <div>
                    <label className={lbl}>Data Aquisição *</label>
                    <input type="date" required value={form.acquisition_date} onChange={e => setForm({ ...form, acquisition_date: e.target.value })} className="input-field" />
                  </div>
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
        title="Remover Ativo"
        description={`Remover "${delTarget?.name || ''}"?`}
        onConfirm={handleDelete}
        onCancel={() => setDelTarget(null)}
        danger
      />
    </div>
  );
}
