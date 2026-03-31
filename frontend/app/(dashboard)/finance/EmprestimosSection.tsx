'use client';
import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import FocusTrap from '@/components/ui/FocusTrap';
import { Sensitive } from '@/components/ui/Sensitive';
import api from '@/lib/api';

const fmt = (v: number | string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));

interface Installment {
  id: number;
  number: number;
  due_date: string;
  value: string;
  is_paid: boolean;
  paid_date: string | null;
}

interface Loan {
  id: number;
  partner: string;
  card_bank: string;
  description: string;
  total_amount: string;
  num_installments: number;
  installment_value: string;
  start_date: string;
  is_active: boolean;
  notes: string;
  paid_count: number;
  installments: Installment[];
}

const EMPTY = { partner: '', card_bank: '', description: '', total_amount: '', num_installments: '', start_date: '', notes: '' };

export default function EmprestimosSection({ isDemoMode }: { isDemoMode: boolean }) {
  const toast = useToast();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [delTarget, setDelTarget] = useState<Loan | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  const lbl = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<{ results: Loan[] } | Loan[]>('/finance/loans/');
      const list = (d as { results: Loan[] }).results ?? d;
      setLoans(Array.isArray(list) ? list : []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openNew = () => {
    setForm({ ...EMPTY });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.partner.trim()) { toast.error('Informe o sócio.'); return; }
    if (!form.total_amount || Number(form.total_amount) <= 0) { toast.error('Informe o valor total.'); return; }
    if (!form.num_installments || Number(form.num_installments) <= 0) { toast.error('Informe o número de parcelas.'); return; }
    if (!form.start_date) { toast.error('Informe a data de início.'); return; }
    setSaving(true);
    try {
      const payload = {
        partner: form.partner, card_bank: form.card_bank || '',
        description: form.description || '', notes: form.notes || '',
        total_amount: Number(form.total_amount),
        num_installments: Number(form.num_installments),
        start_date: form.start_date,
      };
      await api.post('/finance/loans/', payload);
      toast.success('Empréstimo criado!');
      setShowModal(false);
      fetchData();
    } catch { toast.error('Erro ao salvar.'); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!delTarget) return;
    try {
      await api.delete(`/finance/loans/${delTarget.id}/`);
      toast.success('Removido.');
      setDelTarget(null);
      fetchData();
    } catch { toast.error('Erro.'); }
  };

  const payInstallment = async (loanId: number, installmentId: number) => {
    const key = `${loanId}-${installmentId}`;
    if (payingId === key) return;
    setPayingId(key);
    try {
      await api.post(`/finance/loans/${loanId}/pay/${installmentId}/`, {});
      toast.success('Parcela paga!');
      fetchData();
    } catch { toast.error('Erro ao pagar parcela.'); } finally { setPayingId(null); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div />
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark">
          <Plus className="w-4 h-4" /> Novo Empréstimo
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400">Carregando...</div>
      ) : loans.length === 0 ? (
        <div className="p-12 text-center text-gray-400">Nenhum empréstimo cadastrado.</div>
      ) : (
        <div className="space-y-4">
          {loans.map(loan => {
            const progress = loan.num_installments > 0 ? Math.round((loan.paid_count / loan.num_installments) * 100) : 0;
            return (
              <div key={loan.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{loan.description}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      {loan.partner && <span>Parceiro: {loan.partner}</span>}
                      {loan.card_bank && <span>Banco/Cartão: {loan.card_bank}</span>}
                    </div>
                  </div>
                  <button onClick={() => setDelTarget(loan)} className="p-1.5 text-gray-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-3">
                  <div>
                    <span className="block text-xs text-gray-400">Total</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      <Sensitive>{fmt(loan.total_amount)}</Sensitive>
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs text-gray-400">Parcela</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      <Sensitive>{fmt(loan.installment_value)}</Sensitive>
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs text-gray-400">Progresso</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {loan.paid_count}/{loan.num_installments} ({progress}%)
                    </span>
                  </div>
                </div>

                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 mb-3">
                  <div className="h-2 rounded-full bg-accent-gold transition-all" style={{ width: `${progress}%` }} />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {loan.installments.map(inst => {
                    const isPaying = payingId === `${loan.id}-${inst.id}`;
                    return (
                      <button
                        key={inst.id}
                        onClick={() => !inst.is_paid && payInstallment(loan.id, inst.id)}
                        disabled={inst.is_paid || isPaying}
                        title={`Parcela ${inst.number} - ${inst.due_date}${inst.is_paid ? ' (Paga)' : ''}`}
                        className={`w-7 h-7 rounded text-[10px] font-medium flex items-center justify-center transition-colors ${
                          inst.is_paid
                            ? 'bg-green-500 text-white cursor-default'
                            : isPaying
                              ? 'bg-yellow-400 text-white cursor-wait'
                              : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 hover:bg-accent-gold hover:text-white cursor-pointer'
                        }`}
                      >
                        {inst.number}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <FocusTrap onClose={() => setShowModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 shadow-modal animate-modal-in">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Novo Empréstimo</h2>
                <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
              </div>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Parceiro</label>
                    <input type="text" value={form.partner} onChange={e => setForm({ ...form, partner: e.target.value })} className="input-field" />
                  </div>
                  <div>
                    <label className={lbl}>Banco / Cartão</label>
                    <input type="text" value={form.card_bank} onChange={e => setForm({ ...form, card_bank: e.target.value })} className="input-field" />
                  </div>
                </div>
                <div>
                  <label className={lbl}>Descrição *</label>
                  <input type="text" required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input-field" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Valor Total (R$) *</label>
                    <input type="number" step="0.01" required value={form.total_amount} onChange={e => setForm({ ...form, total_amount: e.target.value })} className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
                  </div>
                  <div>
                    <label className={lbl}>Nº Parcelas *</label>
                    <input type="number" min="1" required value={form.num_installments} onChange={e => setForm({ ...form, num_installments: e.target.value })} className="input-field" />
                  </div>
                </div>
                <div>
                  <label className={lbl}>Data Início *</label>
                  <input type="date" required value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="input-field" />
                </div>
                <div>
                  <label className={lbl}>Observação</label>
                  <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-field" />
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 rounded-lg">Cancelar</button>
                  <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg disabled:opacity-60">{saving ? 'Salvando...' : 'Criar Empréstimo'}</button>
                </div>
              </form>
            </div>
          </FocusTrap>
        </div>
      )}

      <ConfirmDialog
        open={!!delTarget}
        title="Remover Empréstimo"
        description={`Remover empréstimo "${delTarget?.description || ''}"? Todas as parcelas serão removidas.`}
        onConfirm={handleDelete}
        onCancel={() => setDelTarget(null)}
        danger
      />
    </div>
  );
}
