'use client';
import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, X, ChevronDown, ChevronUp, CreditCard, CheckCircle, Clock } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import FocusTrap from '@/components/ui/FocusTrap';
import { Sensitive } from '@/components/ui/Sensitive';
import api from '@/lib/api';

const fmt = (v: number | string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));
const fmtDate = (d: string) => { try { return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR'); } catch { return d; } };

interface Installment { id: number; number: number; due_date: string; value: string; is_paid: boolean; paid_date: string | null; }
interface Loan { id: number; partner: string; card_bank: string; description: string; total_amount: string; num_installments: number; installment_value: string; start_date: string; is_active: boolean; notes: string; paid_count: number; installments: Installment[]; }

const EMPTY = { partner: '', card_bank: '', description: '', total_amount: '', num_installments: '', start_date: '', notes: '' };
const lbl = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1';

export default function EmprestimosSection({ isDemoMode }: { isDemoMode: boolean }) {
  const toast = useToast();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [delTarget, setDelTarget] = useState<Loan | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<{ results: Loan[] } | Loan[]>('/finance/loans/');
      const list = (d as { results: Loan[] }).results ?? d;
      setLoans(Array.isArray(list) ? list : []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.partner.trim()) { toast.error('Informe o sócio.'); return; }
    if (!form.total_amount || Number(form.total_amount) <= 0) { toast.error('Informe o valor total.'); return; }
    if (!form.num_installments || Number(form.num_installments) <= 0) { toast.error('Informe o número de parcelas.'); return; }
    if (!form.start_date) { toast.error('Informe a data de início.'); return; }
    setSaving(true);
    try {
      await api.post('/finance/loans/', {
        partner: form.partner, card_bank: form.card_bank || '',
        description: form.description || '', notes: form.notes || '',
        total_amount: Number(form.total_amount), num_installments: Number(form.num_installments),
        start_date: form.start_date,
      });
      toast.success('Empréstimo criado!');
      setShowModal(false); fetchData();
    } catch { toast.error('Erro ao salvar.'); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!delTarget) return;
    try { await api.delete(`/finance/loans/${delTarget.id}/`); toast.success('Removido.'); setDelTarget(null); fetchData(); }
    catch { toast.error('Erro.'); }
  };

  const payInstallment = async (loanId: number, installmentId: number) => {
    const key = `${loanId}-${installmentId}`;
    if (payingId === key) return;
    setPayingId(key);
    try { await api.post(`/finance/loans/${loanId}/pay/${installmentId}/`, {}); toast.success('Parcela paga!'); fetchData(); }
    catch { toast.error('Erro ao pagar.'); } finally { setPayingId(null); }
  };

  const toggle = (id: number) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const totalMensal = loans.reduce((s, l) => s + Number(l.installment_value || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Empréstimos</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {loans.length} empréstimo{loans.length !== 1 ? 's' : ''} • Parcela total/mês: <Sensitive>{fmt(totalMensal)}</Sensitive>
            </p>
          </div>
        </div>
        <button onClick={() => { setForm({ ...EMPTY }); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark text-sm font-medium">
          <Plus className="w-4 h-4" /> Novo Empréstimo
        </button>
      </div>

      {loading ? <div className="p-8 text-center text-gray-400">Carregando...</div> : loans.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-12 text-center text-gray-400">
          <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-30" /><p>Nenhum empréstimo cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {loans.map(loan => {
            const progress = loan.num_installments > 0 ? Math.round((loan.paid_count / loan.num_installments) * 100) : 0;
            const remaining = Number(loan.total_amount) - (loan.paid_count * Number(loan.installment_value));
            const isOpen = !!expanded[loan.id];

            return (
              <div key={loan.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                {/* Header */}
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{loan.description || loan.partner}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {loan.partner}{loan.card_bank ? ` • ${loan.card_bank}` : ''} • Início: {fmtDate(loan.start_date)}
                      </p>
                    </div>
                    <button onClick={() => setDelTarget(loan)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* 4 mini-cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Total</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5"><Sensitive>{fmt(loan.total_amount)}</Sensitive></p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Parcela</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5"><Sensitive>{fmt(loan.installment_value)}</Sensitive></p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Pagas</p>
                      <p className="text-sm font-bold text-green-600 mt-0.5">{loan.paid_count}/{loan.num_installments}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Restante</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5"><Sensitive>{fmt(Math.max(remaining, 0))}</Sensitive></p>
                    </div>
                  </div>

                  {/* Barra de progresso */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                      <div className={`h-2 rounded-full transition-all ${progress === 100 ? 'bg-green-500' : 'bg-accent-gold'}`} style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-10 text-right">{progress}%</span>
                  </div>
                </div>

                {/* Expandir parcelas */}
                <button onClick={() => toggle(loan.id)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border-t border-gray-100 dark:border-gray-700 text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  {isOpen ? 'Ocultar parcelas' : `Ver ${loan.num_installments} parcelas`}
                </button>

                {/* Tabela de parcelas (expandida) */}
                {isOpen && (
                  <div className="border-t border-gray-100 dark:border-gray-700">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800/50">
                          <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase">#</th>
                          <th className="text-left px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase">Vencimento</th>
                          <th className="text-right px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase">Valor</th>
                          <th className="text-center px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase">Status</th>
                          <th className="text-right px-4 py-2 text-[10px] font-semibold text-gray-400 uppercase">Ação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loan.installments.map(inst => {
                          const isPaying = payingId === `${loan.id}-${inst.id}`;
                          return (
                            <tr key={inst.id} className={`border-t border-gray-50 dark:border-gray-700/50 ${inst.is_paid ? 'opacity-60' : ''}`}>
                              <td className="px-4 py-2 text-xs text-gray-500 font-mono">{inst.number}</td>
                              <td className="px-4 py-2 text-xs text-gray-700 dark:text-gray-300">{fmtDate(inst.due_date)}</td>
                              <td className="px-4 py-2 text-xs text-right font-medium text-gray-900 dark:text-gray-100"><Sensitive>{fmt(inst.value)}</Sensitive></td>
                              <td className="px-4 py-2 text-center">
                                {inst.is_paid ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                                    <CheckCircle className="w-3 h-3" /> Paga {inst.paid_date ? fmtDate(inst.paid_date) : ''}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
                                    <Clock className="w-3 h-3" /> Pendente
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right">
                                {!inst.is_paid && (
                                  <button onClick={() => payInstallment(loan.id, inst.id)} disabled={isPaying}
                                    className="text-[10px] font-medium text-accent-gold hover:text-accent-gold-dark disabled:opacity-50 transition-colors">
                                    {isPaying ? 'Pagando...' : 'Marcar paga'}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Novo Empréstimo */}
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
                  <div><label className={lbl}>Sócio *</label><input type="text" required value={form.partner} onChange={e => setForm({ ...form, partner: e.target.value })} className="input-field" /></div>
                  <div><label className={lbl}>Banco / Cartão</label><input type="text" value={form.card_bank} onChange={e => setForm({ ...form, card_bank: e.target.value })} className="input-field" /></div>
                </div>
                <div><label className={lbl}>Descrição *</label><input type="text" required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="input-field" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={lbl}>Valor Total (R$) *</label><input type="number" step="0.01" required value={form.total_amount} onChange={e => setForm({ ...form, total_amount: e.target.value })} className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} /></div>
                  <div><label className={lbl}>Nº Parcelas *</label><input type="number" min="1" required value={form.num_installments} onChange={e => setForm({ ...form, num_installments: e.target.value })} className="input-field" /></div>
                </div>
                <div><label className={lbl}>Data Início *</label><input type="date" required value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="input-field" /></div>
                <div><label className={lbl}>Observação</label><input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="input-field" /></div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 rounded-lg">Cancelar</button>
                  <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg disabled:opacity-60">{saving ? 'Salvando...' : 'Criar Empréstimo'}</button>
                </div>
              </form>
            </div>
          </FocusTrap>
        </div>
      )}

      <ConfirmDialog open={!!delTarget} title="Remover Empréstimo" description={`Remover "${delTarget?.description}"? Todas as parcelas serão removidas.`} onConfirm={handleDelete} onCancel={() => setDelTarget(null)} danger />
    </div>
  );
}
