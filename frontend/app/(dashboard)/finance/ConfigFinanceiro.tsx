'use client';
import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import FocusTrap from '@/components/ui/FocusTrap';
import { Sensitive } from '@/components/ui/Sensitive';
import api from '@/lib/api';

const fmt = (v: number | string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));

interface Partner {
  id: number;
  name: string;
  share_pct: string;
  is_active: boolean;
}

interface ProfitDistConfig {
  id: number;
  working_capital_pct: string;
  reserve_fund_pct: string;
  directors_pct: string;
  directors_cap: string;
  partners: Partner[];
}

export default function ConfigFinanceiro({ isDemoMode }: { isDemoMode: boolean }) {
  const toast = useToast();
  const [config, setConfig] = useState<ProfitDistConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    working_capital_pct: '',
    reserve_fund_pct: '',
    directors_pct: '',
    directors_cap: '',
  });
  const [newPartnerName, setNewPartnerName] = useState('');
  const [newPartnerPct, setNewPartnerPct] = useState('');
  const [showAddPartner, setShowAddPartner] = useState(false);
  const [addingPartner, setAddingPartner] = useState(false);
  const [delPartner, setDelPartner] = useState<Partner | null>(null);

  const lbl = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<{ results: ProfitDistConfig[] } | ProfitDistConfig[]>('/finance/profit-dist/');
      const list = (d as { results: ProfitDistConfig[] }).results ?? d;
      const arr = Array.isArray(list) ? list : [];
      if (arr.length > 0) {
        const c = arr[0];
        setConfig(c);
        setForm({
          working_capital_pct: c.working_capital_pct,
          reserve_fund_pct: c.reserve_fund_pct,
          directors_pct: c.directors_pct,
          directors_cap: c.directors_cap,
        });
      } else {
        setConfig(null);
      }
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      await api.post('/finance/profit-dist/', {
        working_capital_pct: '0',
        reserve_fund_pct: '0',
        directors_pct: '0',
        directors_cap: '0',
      });
      toast.success('Configuração criada!');
      fetchData();
    } catch { toast.error('Erro ao criar.'); } finally { setSaving(false); }
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api.patch(`/finance/profit-dist/${config.id}/`, form);
      toast.success('Configuração salva!');
      fetchData();
    } catch { toast.error('Erro ao salvar.'); } finally { setSaving(false); }
  };

  const handleAddPartner = async () => {
    if (!config || !newPartnerName.trim() || !newPartnerPct.trim()) return;
    setAddingPartner(true);
    try {
      await api.post(`/finance/profit-dist/${config.id}/partners/`, {
        name: newPartnerName.trim(),
        share_pct: newPartnerPct,
      });
      toast.success('Sócio adicionado!');
      setNewPartnerName('');
      setNewPartnerPct('');
      setShowAddPartner(false);
      fetchData();
    } catch { toast.error('Erro ao adicionar sócio.'); } finally { setAddingPartner(false); }
  };

  const handleDeletePartner = async () => {
    if (!config || !delPartner) return;
    try {
      await api.delete(`/finance/profit-dist/${config.id}/partners/${delPartner.id}/`);
      toast.success('Sócio removido.');
      setDelPartner(null);
      fetchData();
    } catch { toast.error('Erro.'); }
  };

  const partnerTotal = config?.partners.reduce((s, p) => s + Number(p.share_pct), 0) ?? 0;
  const partnerValid = Math.abs(partnerTotal - 100) < 0.01;

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Carregando...</div>;
  }

  if (!config) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-8 text-center">
        <p className="text-gray-500 mb-4">Nenhuma configuração de distribuição de lucros encontrada.</p>
        <button onClick={handleCreate} disabled={saving} className="px-6 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark disabled:opacity-60">
          {saving ? 'Criando...' : 'Criar Configuração'}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">Distribuição de Lucros</h3>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className={lbl}>Capital de Giro (%)</label>
            <input
              type="number"
              step="0.01"
              value={form.working_capital_pct}
              onChange={e => setForm({ ...form, working_capital_pct: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className={lbl}>Fundo de Reserva (%)</label>
            <input
              type="number"
              step="0.01"
              value={form.reserve_fund_pct}
              onChange={e => setForm({ ...form, reserve_fund_pct: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className={lbl}>Diretoria (%)</label>
            <input
              type="number"
              step="0.01"
              value={form.directors_pct}
              onChange={e => setForm({ ...form, directors_pct: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className={lbl}>Teto Diretoria (R$)</label>
            <input
              type="number"
              step="0.01"
              value={form.directors_cap}
              onChange={e => setForm({ ...form, directors_cap: e.target.value })}
              className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`}
            />
          </div>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700 pt-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Sócios</h4>
            {!partnerValid && config.partners.length > 0 && (
              <span className="text-xs text-red-500 font-medium">
                Soma das participações: {partnerTotal.toFixed(2)}% (deve ser 100%)
              </span>
            )}
          </div>

          {config.partners.length === 0 ? (
            <p className="text-sm text-gray-400 mb-4">Nenhum sócio cadastrado.</p>
          ) : (
            <div className="space-y-2 mb-4">
              {config.partners.map(p => (
                <div key={p.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg px-4 py-2.5">
                  <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">{p.name}</span>
                  <span className="text-sm text-gray-500">{p.share_pct}%</span>
                  <span className={`inline-block w-2 h-2 rounded-full ${p.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <button onClick={() => setDelPartner(p)} className="p-1 text-gray-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {showAddPartner ? (
            <div className="flex items-end gap-3 bg-gray-50 dark:bg-gray-700/20 rounded-lg p-3">
              <div className="flex-1">
                <label className={lbl}>Nome</label>
                <input
                  type="text"
                  value={newPartnerName}
                  onChange={e => setNewPartnerName(e.target.value)}
                  className="input-field"
                  placeholder="Nome do sócio"
                />
              </div>
              <div className="w-28">
                <label className={lbl}>Part. (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={newPartnerPct}
                  onChange={e => setNewPartnerPct(e.target.value)}
                  className="input-field"
                  placeholder="50"
                />
              </div>
              <button
                onClick={handleAddPartner}
                disabled={addingPartner || !newPartnerName.trim() || !newPartnerPct.trim()}
                className="px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark disabled:opacity-60 text-sm whitespace-nowrap"
              >
                {addingPartner ? 'Adicionando...' : 'Adicionar'}
              </button>
              <button
                onClick={() => { setShowAddPartner(false); setNewPartnerName(''); setNewPartnerPct(''); }}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddPartner(true)}
              className="flex items-center gap-2 text-sm text-accent-gold hover:text-accent-gold-dark font-medium"
            >
              <Plus className="w-4 h-4" /> Adicionar sócio
            </button>
          )}
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark disabled:opacity-60"
          >
            {saving ? 'Salvando...' : 'Salvar Configuração'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={!!delPartner}
        title="Remover Sócio"
        description={`Remover "${delPartner?.name || ''}" da distribuição?`}
        onConfirm={handleDeletePartner}
        onCancel={() => setDelPartner(null)}
        danger
      />
    </div>
  );
}
