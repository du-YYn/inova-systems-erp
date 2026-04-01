"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, Package, X, Monitor, CreditCard } from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Sensitive } from "@/components/ui/Sensitive";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import FocusTrap from "@/components/ui/FocusTrap";

interface Asset {
  id: number;
  asset_type: string;
  asset_type_display: string;
  name: string;
  quantity: number;
  unit_value: string;
  total_value: number;
  useful_life_months: number;
  setup_cost: string;
  amortization_months: number;
  license_unit_cost: string;
  annual_cost: string;
  renewal_date: string | null;
  acquisition_date: string;
  notes: string;
  monthly_depreciation: string;
  life_used_months: number;
  is_active: boolean;
}

const EMPTY_FORM = {
  asset_type: "physical",
  name: "", quantity: "1", unit_value: "", useful_life_months: "",
  setup_cost: "", amortization_months: "", license_unit_cost: "",
  annual_cost: "", renewal_date: "",
  acquisition_date: new Date().toISOString().split("T")[0], notes: "",
};

const fmt = (v: number | string) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));
const TYPE_BADGES: Record<string, { label: string; color: string }> = {
  physical: { label: "Físico", color: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300" },
  software: { label: "Software", color: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" },
  annual_license: { label: "Licença Anual", color: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" },
};
const lbl = "block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1";

export default function AtivosSection({ isDemoMode }: { isDemoMode: boolean }) {
  const toast = useToast();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [delTarget, setDelTarget] = useState<Asset | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/finance/assets/");
      const list = (res as { results?: Asset[] }).results ?? res;
      setAssets(Array.isArray(list) ? list : []);
    } catch { toast.error("Erro ao carregar ativos."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const openNew = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setShowModal(true); };
  const openEdit = (a: Asset) => {
    setEditing(a);
    setForm({
      asset_type: a.asset_type, name: a.name,
      quantity: String(a.quantity), unit_value: String(a.unit_value || ""),
      useful_life_months: String(a.useful_life_months || ""),
      setup_cost: String(a.setup_cost || ""), amortization_months: String(a.amortization_months || ""),
      license_unit_cost: String(a.license_unit_cost || ""),
      annual_cost: String(a.annual_cost || ""), renewal_date: a.renewal_date || "",
      acquisition_date: a.acquisition_date, notes: a.notes || "",
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Informe o nome."); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        asset_type: form.asset_type, name: form.name,
        acquisition_date: form.acquisition_date, notes: form.notes,
        quantity: Number(form.quantity) || 1,
        unit_value: Number(form.unit_value) || 0,
        useful_life_months: Number(form.useful_life_months) || 0,
        setup_cost: Number(form.setup_cost) || 0,
        amortization_months: Number(form.amortization_months) || 0,
        license_unit_cost: Number(form.license_unit_cost) || 0,
        annual_cost: Number(form.annual_cost) || 0,
      };
      if (form.renewal_date) payload.renewal_date = form.renewal_date;
      if (editing) await api.patch(`/finance/assets/${editing.id}/`, payload);
      else await api.post("/finance/assets/", payload);
      toast.success(editing ? "Atualizado!" : "Ativo cadastrado!");
      setShowModal(false); fetchData();
    } catch { toast.error("Erro ao salvar."); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!delTarget) return;
    try { await api.delete(`/finance/assets/${delTarget.id}/`); toast.success("Removido."); setDelTarget(null); fetchData(); }
    catch { toast.error("Erro ao remover."); }
  };

  const totalDeprec = assets.reduce((s, a) => s + Number(a.monthly_depreciation || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
            <Package className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Ativos & Depreciação</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Controle patrimonial</p>
          </div>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark text-sm font-medium">
          <Plus className="w-4 h-4" /> Novo Ativo
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading ? <div className="p-8 text-center text-gray-400">Carregando...</div> : assets.length === 0 ? (
          <div className="p-12 text-center text-gray-400"><Package className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>Nenhum ativo cadastrado.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tipo</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Valor</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Deprec./mês</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Info</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Ações</th>
              </tr></thead>
              <tbody>
                {assets.map(a => {
                  const badge = TYPE_BADGES[a.asset_type] || TYPE_BADGES.physical;
                  const lifeTotal = a.asset_type === 'physical' ? a.useful_life_months : a.asset_type === 'software' ? a.amortization_months : 12;
                  const pct = lifeTotal > 0 ? Math.min((a.life_used_months / lifeTotal) * 100, 100) : 0;
                  return (
                    <tr key={a.id} className="border-b border-gray-50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100"><Sensitive>{a.name}</Sensitive></td>
                      <td className="px-4 py-3"><span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${badge.color}`}>{badge.label}</span></td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300"><Sensitive>{fmt(a.total_value)}</Sensitive></td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100"><Sensitive>{fmt(a.monthly_depreciation)}</Sensitive></td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {a.asset_type === 'physical' && `${a.quantity}x • ${a.useful_life_months}m vida útil`}
                        {a.asset_type === 'software' && (
                          <>Setup {fmt(a.setup_cost)}{a.amortization_months > 0 ? ` • ${a.amortization_months}m amort.` : ''}{Number(a.license_unit_cost) > 0 ? ` • Lic. ${fmt(a.license_unit_cost)}/un` : ''}</>
                        )}
                        {a.asset_type === 'annual_license' && `Anual ${fmt(a.annual_cost)}${a.renewal_date ? ` • Renova ${new Date(a.renewal_date + 'T00:00:00').toLocaleDateString('pt-BR')}` : ''}`}
                        {lifeTotal > 0 && (
                          <div className="mt-1 w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-accent-gold" style={{ width: `${pct}%` }} />
                          </div>
                        )}
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
                  <td className="px-4 py-3 text-sm" colSpan={3}>Total Depreciação Mensal</td>
                  <td className="px-4 py-3 text-sm text-right"><Sensitive>{fmt(totalDeprec)}</Sensitive></td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <FocusTrap onClose={() => setShowModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto shadow-modal animate-modal-in">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{editing ? 'Editar Ativo' : 'Novo Ativo'}</h2>
                <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                {/* Tipo */}
                <div>
                  <label className={lbl}>Tipo de Ativo *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { v: 'physical', label: 'Bem Físico', icon: Package, desc: 'Notebook, celular' },
                      { v: 'software', label: 'Software', icon: Monitor, desc: 'White label, sistema' },
                      { v: 'annual_license', label: 'Licença Anual', icon: CreditCard, desc: 'Adobe, domínio' },
                    ].map(t => (
                      <button key={t.v} type="button" onClick={() => setForm({ ...form, asset_type: t.v })}
                        className={`p-3 rounded-xl border text-left transition-all ${form.asset_type === t.v ? 'border-accent-gold bg-accent-gold/5 ring-1 ring-accent-gold' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}>
                        <t.icon className={`w-5 h-5 mb-1 ${form.asset_type === t.v ? 'text-accent-gold' : 'text-gray-400'}`} />
                        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{t.label}</p>
                        <p className="text-[10px] text-gray-400">{t.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Nome */}
                <div>
                  <label className={lbl}>Nome *</label>
                  <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-field" placeholder="Ex: Notebook Dell XPS" />
                </div>

                {/* Campos condicionais por tipo */}
                {form.asset_type === 'physical' && (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div><label className={lbl}>Quantidade</label><input type="number" min="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className="input-field" /></div>
                      <div><label className={lbl}>Valor Unit. (R$)</label><input type="number" step="0.01" min="0" value={form.unit_value} onChange={e => setForm({ ...form, unit_value: e.target.value })} className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} /></div>
                      <div><label className={lbl}>Vida Útil (meses)</label><input type="number" min="1" value={form.useful_life_months} onChange={e => setForm({ ...form, useful_life_months: e.target.value })} className="input-field" /></div>
                    </div>
                  </>
                )}

                {form.asset_type === 'software' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className={lbl}>Custo Setup/Aquisição (R$)</label><input type="number" step="0.01" min="0" value={form.setup_cost} onChange={e => setForm({ ...form, setup_cost: e.target.value })} className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} /></div>
                      <div><label className={lbl}>Amortização (meses)</label><input type="number" min="0" value={form.amortization_months} onChange={e => setForm({ ...form, amortization_months: e.target.value })} className="input-field" placeholder="0 = sem" /></div>
                    </div>
                    <div>
                      <label className={lbl}>Custo por Licença (R$/mês) — informativo</label>
                      <input type="number" step="0.01" min="0" value={form.license_unit_cost} onChange={e => setForm({ ...form, license_unit_cost: e.target.value })} className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} placeholder="Valor cobrado por unidade/cliente" />
                    </div>
                  </>
                )}

                {form.asset_type === 'annual_license' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className={lbl}>Valor Anual (R$)</label><input type="number" step="0.01" min="0" value={form.annual_cost} onChange={e => setForm({ ...form, annual_cost: e.target.value })} className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} /></div>
                      <div><label className={lbl}>Data de Renovação</label><input type="date" value={form.renewal_date} onChange={e => setForm({ ...form, renewal_date: e.target.value })} className="input-field" /></div>
                    </div>
                  </>
                )}

                {/* Data de aquisição + Observações */}
                <div><label className={lbl}>Data de Aquisição</label><input type="date" value={form.acquisition_date} onChange={e => setForm({ ...form, acquisition_date: e.target.value })} className="input-field" /></div>
                <div><label className={lbl}>Observações</label><textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-field resize-none" /></div>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 rounded-lg">Cancelar</button>
                  <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg disabled:opacity-60">{saving ? 'Salvando...' : editing ? 'Atualizar' : 'Cadastrar'}</button>
                </div>
              </form>
            </div>
          </FocusTrap>
        </div>
      )}

      <ConfirmDialog open={!!delTarget} title="Remover Ativo" description={`Remover "${delTarget?.name}"?`} onConfirm={handleDelete} onCancel={() => setDelTarget(null)} danger />
    </div>
  );
}
