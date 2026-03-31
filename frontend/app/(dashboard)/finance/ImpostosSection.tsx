'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Filter,
  Receipt,
  Loader2,
} from 'lucide-react';
import api from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { Sensitive } from '@/components/ui/Sensitive';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import FocusTrap from '@/components/ui/FocusTrap';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Tax {
  id: number;
  tax_type: string;
  reference_month: string;
  rate: string;
  base_amount: string;
  value: string;
  notes: string;
}

interface ImpostosSectionProps {
  isDemoMode: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TAX_TYPE_LABELS: Record<string, string> = {
  das: 'DAS Faturamento',
  das_parcelamento: 'DAS Parcelamento',
  inss: 'INSS Pro labore',
  taxa_bancaria: 'Taxa Bancária',
  taxa_asaas: 'Taxa ASAAS',
  other: 'Outro',
};

const TAX_TYPES = Object.entries(TAX_TYPE_LABELS).map(([value, label]) => ({ value, label }));

const EMPTY_FORM = {
  tax_type: 'das',
  reference_month: '',
  rate: '',
  base_amount: '',
  value: '',
  notes: '',
};

const formatCurrency = (v: number | string) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));

// ─── Component ──────────────────────────────────────────────────────────────

export default function ImpostosSection({ isDemoMode }: ImpostosSectionProps) {
  const toast = useToast();
  const [taxes, setTaxes] = useState<Tax[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Tax | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [confirmDelete, setConfirmDelete] = useState<Tax | null>(null);

  const fetchTaxes = useCallback(async (month = filterMonth) => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (month) params.reference_month = month;
      const data = await api.get<{ results?: Tax[] }>('/finance/taxes/', params);
      const list = data.results || data;
      setTaxes(Array.isArray(list) ? list : []);
    } catch {
      toast.error('Erro ao carregar impostos.');
    } finally {
      setLoading(false);
    }
  }, [filterMonth]);

  useEffect(() => { fetchTaxes(); }, [fetchTaxes]);

  const updateForm = (patch: Partial<typeof form>) => {
    setForm(prev => {
      const next = { ...prev, ...patch };
      const rate = parseFloat(next.rate);
      const base = parseFloat(next.base_amount);
      if (!isNaN(rate) && !isNaN(base) && rate > 0 && base > 0) {
        next.value = ((rate / 100) * base).toFixed(2);
      }
      return next;
    });
  };

  const openNew = () => {
    const today = new Date();
    const refMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    setEditing(null);
    setForm({ ...EMPTY_FORM, reference_month: refMonth });
    setShowModal(true);
  };

  const openEdit = (tax: Tax) => {
    setEditing(tax);
    setForm({ tax_type: tax.tax_type, reference_month: tax.reference_month, rate: tax.rate, base_amount: tax.base_amount, value: tax.value, notes: tax.notes || '' });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.reference_month) { toast.error('Informe o mês de referência.'); return; }
    if (!form.value && !form.rate) { toast.error('Informe o valor ou alíquota + base.'); return; }
    setSaving(true);
    try {
      // Garante formato YYYY-MM-DD para o backend DateField
      let refMonth = form.reference_month;
      if (refMonth && !refMonth.match(/^\d{4}-\d{2}-\d{2}$/)) {
        refMonth = refMonth + '-01';
      }
      const payload: Record<string, unknown> = {
        tax_type: form.tax_type,
        reference_month: refMonth,
        rate: form.rate ? Number(form.rate) : 0,
        base_amount: form.base_amount ? Number(form.base_amount) : 0,
        value: form.value ? Number(form.value) : 0,
        notes: form.notes || '',
      };
      if (editing) {
        await api.patch(`/finance/taxes/${editing.id}/`, payload);
      } else {
        await api.post('/finance/taxes/', payload);
      }
      toast.success(editing ? 'Imposto atualizado!' : 'Imposto criado!');
      setShowModal(false);
      fetchTaxes();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar imposto.';
      toast.error(msg);
      console.error('[ImpostosSection] save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/finance/taxes/${confirmDelete.id}/`);
      toast.success('Imposto removido.');
      setConfirmDelete(null);
      fetchTaxes();
    } catch {
      toast.error('Erro ao remover imposto.');
    }
  };

  const total = taxes.reduce((sum, t) => sum + Number(t.value || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-50 dark:bg-red-900/30 rounded-xl flex items-center justify-center">
            <Receipt className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Impostos &amp; Taxas</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Gestão de tributos e taxas mensais</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-gray-400" />
            <input type="month" value={filterMonth} onChange={e => { setFilterMonth(e.target.value); fetchTaxes(e.target.value); }} className="input-field text-sm py-1.5 px-3" />
          </div>
          <button onClick={openNew} className="bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Novo
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : taxes.length === 0 ? (
          <div className="text-center py-16 text-sm text-gray-400">Nenhum imposto encontrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tipo</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Base Cálculo</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Alíquota</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Valor</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody>
                {taxes.map(tax => (
                  <tr key={tax.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{TAX_TYPE_LABELS[tax.tax_type] || tax.tax_type}</td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                      <Sensitive>{tax.base_amount ? formatCurrency(tax.base_amount) : '—'}</Sensitive>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">
                      {tax.rate ? `${Number(tax.rate).toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">
                      <Sensitive>{formatCurrency(tax.value)}</Sensitive>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(tax)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Editar">
                          <Pencil className="w-4 h-4 text-gray-500" />
                        </button>
                        <button onClick={() => setConfirmDelete(tax)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" title="Remover">
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 dark:bg-gray-700/40">
                  <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Total</td>
                  <td className="px-4 py-3 text-right text-sm font-bold text-gray-900 dark:text-gray-100">
                    <Sensitive>{formatCurrency(total)}</Sensitive>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <FocusTrap onClose={() => setShowModal(false)}>
            <div role="dialog" aria-modal="true" className="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-lg w-full mx-4 shadow-modal animate-modal-in">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
                {editing ? 'Editar Imposto' : 'Novo Imposto'}
              </h3>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Tipo de Imposto</label>
                  <select value={form.tax_type} onChange={e => updateForm({ tax_type: e.target.value })} className="input-field bg-white dark:bg-gray-800" required>
                    {TAX_TYPES.map(t => (<option key={t.value} value={t.value}>{t.label}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Mês de Referência</label>
                  <input type="month" value={form.reference_month} onChange={e => updateForm({ reference_month: e.target.value })} className="input-field" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Alíquota (%)</label>
                    <input type="number" step="0.01" min="0" value={form.rate} onChange={e => updateForm({ rate: e.target.value })} className="input-field" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Base de Cálculo</label>
                    <input type="number" step="0.01" min="0" value={form.base_amount} onChange={e => updateForm({ base_amount: e.target.value })} className="input-field" placeholder="0.00" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Valor</label>
                  <input type="number" step="0.01" min="0" value={form.value} onChange={e => updateForm({ value: e.target.value })} className="input-field" required placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Observações</label>
                  <textarea value={form.notes} onChange={e => updateForm({ notes: e.target.value })} className="input-field min-h-[60px] resize-y" rows={2} />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">Cancelar</button>
                  <button type="submit" disabled={saving} className="bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2">
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {editing ? 'Salvar' : 'Criar'}
                  </button>
                </div>
              </form>
            </div>
          </FocusTrap>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Remover Imposto"
        description={`Deseja remover o imposto "${TAX_TYPE_LABELS[confirmDelete?.tax_type || ''] || ''}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Remover"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
        danger
      />
    </div>
  );
}
