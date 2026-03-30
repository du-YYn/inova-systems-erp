"use client";

import { useEffect, useState, useCallback } from "react";
import { Settings, Plus, Trash2, AlertCircle, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Sensitive } from "@/components/ui/Sensitive";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import FocusTrap from "@/components/ui/FocusTrap";

interface Partner {
  id: number;
  name: string;
  share_pct: string;
}

interface ProfitDistConfig {
  id: number;
  working_capital_pct: string;
  reserve_fund_pct: string;
  directors_pct: string;
  directors_cap: string;
  partners: Partner[];
}

const EMPTY_CONFIG = {
  working_capital_pct: "",
  reserve_fund_pct: "",
  directors_pct: "",
  directors_cap: "",
};

const EMPTY_PARTNER = { name: "", share_pct: "" };

const formatCurrency = (value: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value));

export default function ConfigFinanceiro({ isDemoMode }: { isDemoMode: boolean }) {
  const toast = useToast();
  const [config, setConfig] = useState<ProfitDistConfig | null>(null);
  const [configForm, setConfigForm] = useState({ ...EMPTY_CONFIG });
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newPartner, setNewPartner] = useState({ ...EMPTY_PARTNER });
  const [addingPartner, setAddingPartner] = useState(false);
  const [confirmDeletePartner, setConfirmDeletePartner] = useState<Partner | null>(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/finance/profit-dist/");
      const items = Array.isArray(res) ? res : (res as { results?: unknown[] }).results ?? [];
      if (items.length > 0) {
        const cfg = items[0];
        setConfig(cfg);
        setConfigForm({
          working_capital_pct: String(cfg.working_capital_pct),
          reserve_fund_pct: String(cfg.reserve_fund_pct),
          directors_pct: String(cfg.directors_pct),
          directors_cap: String(cfg.directors_cap),
        });
        setPartners(cfg.partners || []);
      } else {
        setConfig(null);
        setConfigForm({ ...EMPTY_CONFIG });
        setPartners([]);
      }
    } catch {
      toast.error("Erro ao carregar configuracao.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        working_capital_pct: configForm.working_capital_pct,
        reserve_fund_pct: configForm.reserve_fund_pct,
        directors_pct: configForm.directors_pct,
        directors_cap: configForm.directors_cap,
      };
      if (config) {
        await api.patch(`/finance/profit-dist/${config.id}/`, payload);
        toast.success("Configuracao atualizada!");
      } else {
        await api.post("/finance/profit-dist/", payload);
        toast.success("Configuracao criada!");
      }
      fetchConfig();
    } catch {
      toast.error("Erro ao salvar configuracao.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddPartner = async () => {
    if (!config) return;
    if (!newPartner.name || !newPartner.share_pct) {
      toast.error("Preencha nome e percentual do socio.");
      return;
    }
    setAddingPartner(true);
    try {
      await api.post(`/finance/profit-dist/${config.id}/partners/`, {
        name: newPartner.name,
        share_pct: newPartner.share_pct,
      });
      toast.success("Socio adicionado!");
      setNewPartner({ ...EMPTY_PARTNER });
      fetchConfig();
    } catch {
      toast.error("Erro ao adicionar socio.");
    } finally {
      setAddingPartner(false);
    }
  };

  const handleDeletePartner = async () => {
    if (!config || !confirmDeletePartner) return;
    try {
      await api.delete(`/finance/profit-dist/${config.id}/partners/${confirmDeletePartner.id}/`);
      toast.success("Socio removido.");
      setConfirmDeletePartner(null);
      fetchConfig();
    } catch {
      toast.error("Erro ao remover socio.");
    }
  };

  const totalPct =
    Number(configForm.working_capital_pct || 0) +
    Number(configForm.reserve_fund_pct || 0) +
    Number(configForm.directors_pct || 0) +
    partners.reduce((sum, p) => sum + Number(p.share_pct || 0), 0);

  const isValid = Math.abs(totalPct - 100) < 0.01;

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
          <Settings className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Distribuicao de Lucros</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Configure os percentuais de distribuicao e socios</p>
        </div>
      </div>

      <form onSubmit={handleSaveConfig}>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Capital de Giro (%)</label>
              <input type="number" className="input-field" value={configForm.working_capital_pct}
                onChange={(e) => setConfigForm({ ...configForm, working_capital_pct: e.target.value })}
                min="0" max="100" step="0.01" placeholder="0.00" required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Fundo de Reserva (%)</label>
              <input type="number" className="input-field" value={configForm.reserve_fund_pct}
                onChange={(e) => setConfigForm({ ...configForm, reserve_fund_pct: e.target.value })}
                min="0" max="100" step="0.01" placeholder="0.00" required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Diretoria (%)</label>
              <input type="number" className="input-field" value={configForm.directors_pct}
                onChange={(e) => setConfigForm({ ...configForm, directors_pct: e.target.value })}
                min="0" max="100" step="0.01" placeholder="0.00" required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Teto Diretoria (R$)</label>
              <input type="number"
                className={`input-field ${isDemoMode ? "sensitive-blur" : ""}`}
                value={configForm.directors_cap}
                onChange={(e) => setConfigForm({ ...configForm, directors_cap: e.target.value })}
                min="0" step="0.01" placeholder="0.00" required />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isValid ? (
              <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            )}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Total: <strong className={isValid ? "text-green-600" : "text-amber-600"}>{totalPct.toFixed(2)}%</strong>
                </span>
                <span className="text-xs text-gray-400">{isValid ? "Distribuicao valida" : "A soma deve ser 100%"}</span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                <div
                  className={`${isValid ? "bg-green-500" : totalPct > 100 ? "bg-red-500" : "bg-amber-500"} h-full rounded-full transition-all`}
                  style={{ width: `${Math.min(totalPct, 100)}%` }}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-700 pt-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Socios</h3>
            {partners.length > 0 && (
              <div className="space-y-2 mb-4">
                {partners.map((partner) => (
                  <div key={partner.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg px-4 py-2.5">
                    <span className="flex-1 text-sm text-gray-900 dark:text-gray-100 font-medium">{partner.name}</span>
                    <span className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                      <Sensitive>{partner.share_pct}%</Sensitive>
                    </span>
                    <button type="button" onClick={() => setConfirmDeletePartner(partner)}
                      className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Remover">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {config && (
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Nome do Socio</label>
                  <input type="text"
                    className={`input-field ${isDemoMode ? "sensitive-blur" : ""}`}
                    value={newPartner.name} onChange={(e) => setNewPartner({ ...newPartner, name: e.target.value })}
                    placeholder="Nome do socio" />
                </div>
                <div className="w-32">
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">% Participacao</label>
                  <input type="number" className="input-field" value={newPartner.share_pct}
                    onChange={(e) => setNewPartner({ ...newPartner, share_pct: e.target.value })}
                    min="0" max="100" step="0.01" placeholder="0.00" />
                </div>
                <button type="button" onClick={handleAddPartner} disabled={addingPartner}
                  className="bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark px-4 py-2 flex items-center gap-2 text-sm font-medium transition-colors disabled:opacity-50 h-[42px]">
                  <Plus className="w-4 h-4" /> {addingPartner ? "..." : "Adicionar"}
                </button>
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <button type="submit" disabled={saving}
              className="bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark px-6 py-2 text-sm font-medium transition-colors disabled:opacity-50">
              {saving ? "Salvando..." : "Salvar Configuracao"}
            </button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={!!confirmDeletePartner}
        title="Remover Socio"
        description={`Deseja remover o socio "${confirmDeletePartner?.name}"?`}
        onConfirm={handleDeletePartner}
        onCancel={() => setConfirmDeletePartner(null)}
      />
    </div>
  );
}
