'use client';
import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import FocusTrap from '@/components/ui/FocusTrap';
import { Sensitive } from '@/components/ui/Sensitive';
import api from '@/lib/api';

const fmt = (v: number | string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));

const CATEGORY_LABELS: Record<string, string> = {
  salarios: 'Salários',
  imovel: 'Imóvel',
  manutencao: 'Manutenção',
  materiais: 'Materiais',
  sistemas: 'Sistemas/Assinaturas',
  equipamentos: 'Equipamentos',
  marketing: 'Marketing',
  honorarios: 'Honorários',
  gerais: 'Despesas Gerais',
};

interface RecurringExpense {
  id: number;
  expense_category: string;
  expense_category_display: string;
  description: string;
  value: string;
  due_day: number;
  is_recurring: boolean;
  is_active: boolean;
  notes: string;
}

const EMPTY = { expense_category: 'salarios', description: '', value: '', due_day: '1', is_recurring: true, is_active: true, notes: '' };

export default function DespesasFixasSection({ isDemoMode }: { isDemoMode: boolean }) {
  const toast = useToast();
  const [items, setItems] = useState<RecurringExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<RecurringExpense | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [delTarget, setDelTarget] = useState<RecurringExpense | null>(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const lbl = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterCategory) params.category = filterCategory;
      if (activeOnly) params.active = 'true';
      const d = await api.get<{ results: RecurringExpense[] } | RecurringExpense[]>('/finance/recurring-expenses/', params);
      const list = (d as { results: RecurringExpense[] }).results ?? d;
      setItems(Array.isArray(list) ? list : []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [filterCategory, activeOnly]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setShowModal(true);
  };

  const openEdit = (item: RecurringExpense) => {
    setEditing(item);
    setForm({
      expense_category: item.expense_category,
      description: item.description,
      value: item.value,
      due_day: String(item.due_day),
      is_recurring: item.is_recurring,
      is_active: item.is_active,
      notes: item.notes,
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, due_day: Number(form.due_day) };
      if (editing) await api.patch(`/finance/recurring-expenses/${editing.id}/`, payload);
      else await api.post('/finance/recurring-expenses/', payload);
      toast.success('Salvo!');
      setShowModal(false);
      fetchData();
    } catch { toast.error('Erro ao salvar.'); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!delTarget) return;
    try {
      await api.delete(`/finance/recurring-expenses/${delTarget.id}/`);
      toast.success('Removido.');
      setDelTarget(null);
      fetchData();
    } catch { toast.error('Erro.'); }
  };

  const toggleCategory = (cat: string) => {
    setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  // Group items by category
  const grouped = items.reduce<Record<string, RecurringExpense[]>>((acc, item) => {
    const cat = item.expense_category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const grandTotal = items.reduce((s, i) => s + Number(i.value), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm text-gray-500 dark:text-gray-400">Categoria:</label>
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="input-field w-48 bg-white dark:bg-gray-800">
            <option value="">Todas</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 cursor-pointer">
            <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)} className="rounded border-gray-300 text-accent-gold focus:ring-accent-gold" />
            Somente ativas
          </label>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark">
          <Plus className="w-4 h-4" /> Nova Despesa
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center text-gray-400">Nenhuma despesa fixa cadastrada.</div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([cat, catItems]) => {
            const subtotal = catItems.reduce((s, i) => s + Number(i.value), 0);
            const isExpanded = expanded[cat] !== false; // default expanded
            return (
              <div key={cat} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                <button
                  onClick={() => toggleCategory(cat)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                >
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {CATEGORY_LABELS[cat] || cat}
                    <span className="ml-2 text-xs text-gray-400 font-normal">({catItems.length} {catItems.length === 1 ? 'item' : 'itens'})</span>
                  </span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    <Sensitive>{fmt(subtotal)}</Sensitive>
                  </span>
                </button>
                {isExpanded && (
                  <div className="border-t border-gray-100 dark:border-gray-700">
                    <table className="w-full table-premium">
                      <thead>
                        <tr>
                          <th className="text-left">Descrição</th>
                          <th className="text-right">Valor</th>
                          <th className="text-center">Dia Venc.</th>
                          <th className="text-center">Recorrente</th>
                          <th className="text-center">Ativa</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {catItems.map(item => (
                          <tr key={item.id}>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{item.description}</td>
                            <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">
                              <Sensitive>{fmt(item.value)}</Sensitive>
                            </td>
                            <td className="px-4 py-3 text-sm text-center text-gray-500">{item.due_day}</td>
                            <td className="px-4 py-3 text-sm text-center text-gray-500">{item.is_recurring ? 'Sim' : 'Não'}</td>
                            <td className="px-4 py-3 text-sm text-center">
                              <span className={`inline-block w-2 h-2 rounded-full ${item.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1 justify-end">
                                <button onClick={() => openEdit(item)} className="p-1.5 text-gray-400 hover:text-accent-gold"><Pencil className="w-4 h-4" /></button>
                                <button onClick={() => setDelTarget(item)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">TOTAL GERAL</span>
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100"><Sensitive>{fmt(grandTotal)}</Sensitive></span>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <FocusTrap onClose={() => setShowModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 shadow-modal animate-modal-in">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar' : 'Nova'} Despesa Fixa</h2>
                <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className={lbl}>Categoria *</label>
                  <select required value={form.expense_category} onChange={e => setForm({ ...form, expense_category: e.target.value })} className="input-field bg-white dark:bg-gray-800">
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={lbl}>Descrição *</label>
                  <input type="text" required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input-field" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Valor (R$) *</label>
                    <input type="number" step="0.01" required value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
                  </div>
                  <div>
                    <label className={lbl}>Dia Vencimento *</label>
                    <input type="number" min="1" max="31" required value={form.due_day} onChange={e => setForm({ ...form, due_day: e.target.value })} className="input-field" />
                  </div>
                </div>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" checked={form.is_recurring === true} onChange={e => setForm({ ...form, is_recurring: e.target.checked })} className="rounded border-gray-300 text-accent-gold focus:ring-accent-gold" />
                    Recorrente
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" checked={form.is_active === true} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="rounded border-gray-300 text-accent-gold focus:ring-accent-gold" />
                    Ativa
                  </label>
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
        title="Remover Despesa"
        description={`Remover "${delTarget?.description || ''}"?`}
        onConfirm={handleDelete}
        onCancel={() => setDelTarget(null)}
        danger
      />
    </div>
  );
}
