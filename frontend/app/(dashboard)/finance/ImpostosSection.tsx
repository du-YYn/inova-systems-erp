'use client';
import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import FocusTrap from '@/components/ui/FocusTrap';
import { Sensitive } from '@/components/ui/Sensitive';
import api from '@/lib/api';

const fmt = (v: number | string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));
const TYPE_LABELS: Record<string, string> = { das: 'DAS Faturamento', das_parcelamento: 'DAS Parcelamento', inss: 'INSS Pro labore', taxa_bancaria: 'Taxa Bancária', taxa_asaas: 'Taxa ASAAS', other: 'Outro' };

interface Tax { id: number; tax_type: string; reference_month: string; rate: string; base_amount: string; value: string; notes: string; }
const EMPTY = { tax_type: 'das', reference_month: '', rate: '', base_amount: '', value: '', notes: '' };

export default function ImpostosSection({ isDemoMode }: { isDemoMode: boolean }) {
  const toast = useToast();
  const [items, setItems] = useState<Tax[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Tax | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [delTarget, setDelTarget] = useState<Tax | null>(null);
  const [refMonth, setRefMonth] = useState(new Date().toISOString().slice(0, 7));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<{ results: Tax[] } | Tax[]>('/finance/taxes/', { month: refMonth + '-01' });
      const list = (d as { results: Tax[] }).results ?? d;
      setItems(Array.isArray(list) ? list : []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [refMonth]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const openNew = () => { setEditing(null); setForm({ ...EMPTY, reference_month: refMonth + '-01' }); setShowModal(true); };
  const openEdit = (t: Tax) => { setEditing(t); setForm({ tax_type: t.tax_type, reference_month: t.reference_month, rate: t.rate, base_amount: t.base_amount, value: t.value, notes: t.notes }); setShowModal(true); };
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try { if (editing) await api.patch(`/finance/taxes/${editing.id}/`, form); else await api.post('/finance/taxes/', form); toast.success('Salvo!'); setShowModal(false); fetchData(); } catch { toast.error('Erro ao salvar.'); } finally { setSaving(false); }
  };
  const handleDelete = async () => { if (!delTarget) return; try { await api.delete(`/finance/taxes/${delTarget.id}/`); toast.success('Removido.'); setDelTarget(null); fetchData(); } catch { toast.error('Erro.'); } };
  const total = items.reduce((s, t) => s + Number(t.value), 0);
  const lbl = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1';

  return (<div>
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3"><label className="text-sm text-gray-500 dark:text-gray-400">Mês:</label><input type="month" value={refMonth} onChange={e => setRefMonth(e.target.value)} className="input-field w-40" /></div>
      <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark"><Plus className="w-4 h-4" /> Novo Imposto</button>
    </div>
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
      {loading ? <div className="p-8 text-center text-gray-400">Carregando...</div> : items.length === 0 ? <div className="p-12 text-center text-gray-400">Nenhum imposto neste mês.</div> : (
        <table className="w-full table-premium"><thead><tr><th className="text-left">Tipo</th><th className="text-right">Base</th><th className="text-right">Alíquota</th><th className="text-right">Valor</th><th></th></tr></thead>
          <tbody>{items.map(t => (<tr key={t.id}><td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{TYPE_LABELS[t.tax_type] || t.tax_type}</td><td className="px-4 py-3 text-sm text-right text-gray-500"><Sensitive>{Number(t.base_amount) > 0 ? fmt(t.base_amount) : '—'}</Sensitive></td><td className="px-4 py-3 text-sm text-right text-gray-500">{Number(t.rate) > 0 ? `${t.rate}%` : '—'}</td><td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100"><Sensitive>{fmt(t.value)}</Sensitive></td><td className="px-4 py-3"><div className="flex gap-1 justify-end"><button onClick={() => openEdit(t)} className="p-1.5 text-gray-400 hover:text-accent-gold"><Pencil className="w-4 h-4" /></button><button onClick={() => setDelTarget(t)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button></div></td></tr>))}
          <tr className="bg-gray-50 dark:bg-gray-700/30 font-semibold"><td className="px-4 py-3 text-sm" colSpan={3}>TOTAL</td><td className="px-4 py-3 text-sm text-right"><Sensitive>{fmt(total)}</Sensitive></td><td /></tr></tbody></table>)}
    </div>
    {showModal && <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"><FocusTrap onClose={() => setShowModal(false)}><div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 shadow-modal animate-modal-in">
      <div className="flex items-center justify-between mb-6"><h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar' : 'Novo'} Imposto</h2><button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button></div>
      <form onSubmit={handleSave} className="space-y-4">
        <div><label className={lbl}>Tipo *</label><select required value={form.tax_type} onChange={e => setForm({...form, tax_type: e.target.value})} className="input-field bg-white dark:bg-gray-800">{Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className={lbl}>Mês Referência *</label><input type="date" required value={form.reference_month} onChange={e => setForm({...form, reference_month: e.target.value})} className="input-field" /></div>
        <div className="grid grid-cols-2 gap-3"><div><label className={lbl}>Alíquota (%)</label><input type="number" step="0.01" value={form.rate} onChange={e => setForm({...form, rate: e.target.value})} className="input-field" /></div><div><label className={lbl}>Base (R$)</label><input type="number" step="0.01" value={form.base_amount} onChange={e => setForm({...form, base_amount: e.target.value})} className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} /></div></div>
        <div><label className={lbl}>Valor (R$)</label><input type="number" step="0.01" value={form.value} onChange={e => setForm({...form, value: e.target.value})} className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} placeholder="Auto se alíquota+base" /></div>
        <div><label className={lbl}>Observação</label><input type="text" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="input-field" /></div>
        <div className="flex gap-3 pt-4"><button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 rounded-lg">Cancelar</button><button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar'}</button></div>
      </form></div></FocusTrap></div>}
    <ConfirmDialog open={!!delTarget} title="Remover Imposto" description={`Remover ${TYPE_LABELS[delTarget?.tax_type||'']}?`} onConfirm={handleDelete} onCancel={() => setDelTarget(null)} danger />
  </div>);
}
