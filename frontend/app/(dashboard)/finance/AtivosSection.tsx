"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, Package, X } from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Sensitive } from "@/components/ui/Sensitive";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import FocusTrap from "@/components/ui/FocusTrap";

interface Asset {
  id: number;
  name: string;
  quantity: number;
  unit_value: string;
  total_value: string;
  useful_life_months: number;
  acquisition_date: string;
  notes: string;
  monthly_depreciation: string;
  life_used_months: number;
}

const EMPTY_FORM = {
  name: "",
  quantity: "1",
  unit_value: "",
  useful_life_months: "",
  acquisition_date: new Date().toISOString().split("T")[0],
  notes: "",
};

const formatCurrency = (value: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));

export default function AtivosSection({ isDemoMode }: { isDemoMode: boolean }) {
  const toast = useToast();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Asset | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/finance/assets/");
      setAssets(Array.isArray(res.data) ? res.data : res.data.results ?? []);
    } catch {
      toast.error("Erro ao carregar ativos.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, acquisition_date: new Date().toISOString().split("T")[0] });
    setShowModal(true);
  };

  const openEdit = (asset: Asset) => {
    setEditing(asset);
    setForm({
      name: asset.name, quantity: String(asset.quantity),
      unit_value: String(asset.unit_value),
      useful_life_months: String(asset.useful_life_months),
      acquisition_date: asset.acquisition_date, notes: asset.notes || "",
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name, quantity: Number(form.quantity), unit_value: form.unit_value,
        useful_life_months: Number(form.useful_life_months),
        acquisition_date: form.acquisition_date, notes: form.notes,
      };
      if (editing) {
        await api.patch(`/finance/assets/${editing.id}/`, payload);
        toast.success("Ativo atualizado!");
      } else {
        await api.post("/finance/assets/", payload);
        toast.success("Ativo cadastrado!");
      }
      setShowModal(false);
      fetchAssets();
    } catch {
      toast.error("Erro ao salvar ativo.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/finance/assets/${confirmDelete.id}/`);
      toast.success("Ativo removido.");
      setConfirmDelete(null);
      fetchAssets();
    } catch {
      toast.error("Erro ao remover ativo.");
    }
  };

  const totalMonthlyDepreciation = assets.reduce(
    (sum, a) => sum + Number(a.monthly_depreciation || 0), 0,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
            <Package className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Ativos &amp; Depreciacao</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Controle patrimonial</p>
          </div>
        </div>
        <button onClick={openNew} className="bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark px-4 py-2 flex items-center gap-2 text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Novo Ativo
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Carregando...</div>
        ) : assets.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Nenhum ativo cadastrado.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase text-xs tracking-wide">Nome</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase text-xs tracking-wide">Qtd</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase text-xs tracking-wide">Valor Unit.</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase text-xs tracking-wide">Vida Util</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase text-xs tracking-wide">Deprec./mes</th>
                  <th className="px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase text-xs tracking-wide">Vida Restante</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 uppercase text-xs tracking-wide">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {assets.map((asset) => {
                  const pct = asset.useful_life_months > 0
                    ? Math.min((asset.life_used_months / asset.useful_life_months) * 100, 100) : 0;
                  const remainingMonths = Math.max(asset.useful_life_months - asset.life_used_months, 0);
                  return (
                    <tr key={asset.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                      <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium">{asset.name}</td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{asset.quantity}</td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        <Sensitive>{formatCurrency(asset.unit_value)}</Sensitive>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700 dark:text-gray-300">{asset.useful_life_months} meses</td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        <Sensitive>{formatCurrency(asset.monthly_depreciation)}</Sensitive>
                      </td>
                      <td className="px-4 py-3 min-w-[180px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full transition-all"
                              style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {remainingMonths} meses
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(asset)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors" title="Editar">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => setConfirmDelete(asset)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Remover">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {assets.length > 0 && (
          <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50">
            <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">Total Depreciacao Mensal</span>
            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
              <Sensitive>{formatCurrency(totalMonthlyDepreciation)}</Sensitive>
            </span>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <FocusTrap onClose={() => setShowModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto shadow-modal animate-modal-in">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {editing ? "Editar Ativo" : "Novo Ativo"}
                </h2>
                <button onClick={() => setShowModal(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Nome</label>
                  <input type="text"
                    className={`input-field ${isDemoMode ? "sensitive-blur" : ""}`}
                    value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required placeholder="Ex: Notebook Dell Latitude" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Quantidade</label>
                    <input type="number" className="input-field" value={form.quantity}
                      onChange={(e) => setForm({ ...form, quantity: e.target.value })} required min="1" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Valor Unitario (R$)</label>
                    <input type="number"
                      className={`input-field ${isDemoMode ? "sensitive-blur" : ""}`}
                      value={form.unit_value} onChange={(e) => setForm({ ...form, unit_value: e.target.value })}
                      required min="0" step="0.01" placeholder="0.00" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Vida Util (meses)</label>
                    <input type="number" className="input-field" value={form.useful_life_months}
                      onChange={(e) => setForm({ ...form, useful_life_months: e.target.value })}
                      required min="1" placeholder="Ex: 60" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Data de Aquisicao</label>
                    <input type="date" className="input-field" value={form.acquisition_date}
                      onChange={(e) => setForm({ ...form, acquisition_date: e.target.value })} required />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Observacoes</label>
                  <textarea className="input-field" value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                    placeholder="Observacoes opcionais..." />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowModal(false)}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                    Cancelar
                  </button>
                  <button type="submit" disabled={saving}
                    className="bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark px-6 py-2 text-sm font-medium transition-colors disabled:opacity-50">
                    {saving ? "Salvando..." : editing ? "Salvar" : "Cadastrar"}
                  </button>
                </div>
              </form>
            </div>
          </FocusTrap>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Remover Ativo"
        description={`Deseja remover o ativo "${confirmDelete?.name}"?`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
