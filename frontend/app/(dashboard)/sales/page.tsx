'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus, Search, Edit, Trash2, FileText, TrendingUp, CheckCircle,
  X, Send, ThumbsUp, ThumbsDown, ArrowRight,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton, CardSkeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { FormField } from '@/components/ui/FormField';
import FocusTrap from '@/components/ui/FocusTrap';
import api from '@/lib/api';
import { Sensitive } from '@/components/ui/Sensitive';

interface Proposal {
  id: number;
  number: string;
  title: string;
  customer: number | null;
  customer_name: string;
  prospect_company: string;
  proposal_type: string;
  billing_type: string;
  total_value: string;
  status: string;
  valid_until: string | null;
  notes: string;
  hours_estimated: string;
  hourly_rate: string;
  created_at: string;
}

interface Customer { id: number; company_name: string; name: string; }

const PAGE_SIZE = 10;

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'purple' | 'gold' | 'neutral';

const statusBadge: Record<string, BadgeVariant> = {
  draft: 'neutral', sent: 'info', viewed: 'info',
  discussion: 'warning', approved: 'success', rejected: 'error', expired: 'warning',
};

const statusLabels: Record<string, string> = {
  draft: 'Rascunho', sent: 'Enviada', viewed: 'Visualizada',
  discussion: 'Em Negociação', approved: 'Aprovada', rejected: 'Rejeitada', expired: 'Expirada',
};

const proposalTypeLabels: Record<string, string> = {
  software_dev: 'Desenvolvimento', maintenance: 'Manutenção',
  consulting: 'Consultoria', support: 'Suporte',
};

const formatCurrency = (v: string | number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));

const EMPTY_FORM = {
  title: '', proposal_type: 'software_dev', billing_type: 'fixed',
  total_value: '', hours_estimated: '', hourly_rate: '',
  customer: '', notes: '', valid_until: '',
};

export default function SalesPage() {
  const toast = useToast();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingProposal, setEditingProposal] = useState<Proposal | null>(null);
  const [saving, setSaving] = useState(false);
  const [performingAction, setPerformingAction] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Proposal | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const isDirty = useMemo(() => {
    if (editingProposal) {
      return formData.title !== editingProposal.title ||
        formData.customer !== (editingProposal.customer ? String(editingProposal.customer) : '') ||
        formData.total_value !== (editingProposal.total_value || '') ||
        formData.proposal_type !== editingProposal.proposal_type ||
        formData.billing_type !== editingProposal.billing_type ||
        formData.hours_estimated !== (editingProposal.hours_estimated || '') ||
        formData.hourly_rate !== (editingProposal.hourly_rate || '') ||
        formData.notes !== (editingProposal.notes || '') ||
        formData.valid_until !== (editingProposal.valid_until || '');
    }
    return formData.title !== '' || formData.customer !== '' || formData.total_value !== '';
  }, [formData, editingProposal]);

  const handleCloseModal = useCallback(() => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      setShowModal(false);
    }
  }, [isDirty]);

  const validateField = (field: string, value: string) => {
    let error = '';
    switch (field) {
      case 'title':
        if (!value.trim()) error = 'Título é obrigatório';
        break;
      case 'customer':
        if (!value) error = 'Cliente é obrigatório';
        break;
      case 'total_value':
        if (!value) error = 'Valor é obrigatório';
        else if (Number(value) <= 0) error = 'Valor deve ser maior que zero';
        break;
    }
    setErrors(prev => ({ ...prev, [field]: error }));
    return error;
  };

  const validateAll = () => {
    const e1 = validateField('title', formData.title);
    const e2 = validateField('customer', formData.customer);
    const e3 = validateField('total_value', formData.total_value);
    return !e1 && !e2 && !e3;
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), page_size: String(PAGE_SIZE) };
      if (search) params.search = search;
      const [propData, custData] = await Promise.all([
        api.get<{ results: Proposal[]; count: number }>('/sales/proposals/', params),
        api.get<{ results: Customer[] }>('/sales/customers/'),
      ]);
      const pList = propData.results || propData;
      const cList = custData.results || custData;
      setProposals(Array.isArray(pList) ? pList : []);
      setTotal(propData.count ?? (Array.isArray(pList) ? pList.length : 0));
      setCustomers(Array.isArray(cList) ? cList : []);
    } catch {
      toast.error('Erro ao carregar propostas');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const approvedValue = proposals.filter(p => p.status === 'approved').reduce((s, p) => s + Number(p.total_value || 0), 0);
  const approvedCount = proposals.filter(p => p.status === 'approved').length;

  const openNewModal = () => { setEditingProposal(null); setFormData(EMPTY_FORM); setErrors({}); setShowModal(true); };

  const openEditModal = (p: Proposal) => {
    setEditingProposal(p);
    setFormData({
      title: p.title, proposal_type: p.proposal_type, billing_type: p.billing_type,
      total_value: p.total_value || '', hours_estimated: p.hours_estimated || '',
      hourly_rate: p.hourly_rate || '', customer: p.customer ? String(p.customer) : '',
      notes: p.notes || '', valid_until: p.valid_until || '',
    });
    setErrors({});
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAll()) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: formData.title, proposal_type: formData.proposal_type,
        billing_type: formData.billing_type, notes: formData.notes,
      };
      if (formData.customer) body.customer = Number(formData.customer);
      if (formData.total_value) body.total_value = formData.total_value;
      if (formData.hours_estimated) body.hours_estimated = formData.hours_estimated;
      if (formData.hourly_rate) body.hourly_rate = formData.hourly_rate;
      if (formData.valid_until) body.valid_until = formData.valid_until;
      if (editingProposal) {
        await api.patch(`/sales/proposals/${editingProposal.id}/`, body);
      } else {
        await api.post('/sales/proposals/', body);
      }
      toast.success(editingProposal ? 'Proposta atualizada!' : 'Proposta criada!');
      setShowModal(false);
      fetchData();
    } catch {
      toast.error('Erro ao salvar proposta.');
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (proposal: Proposal, action: 'send' | 'approve' | 'reject' | 'convert_to_contract') => {
    const actionKey = `${proposal.id}-${action}`;
    setPerformingAction(actionKey);
    try {
      await api.post(`/sales/proposals/${proposal.id}/${action}/`);
      const labels: Record<string, string> = {
        send: 'Proposta enviada!', approve: 'Proposta aprovada!',
        reject: 'Proposta rejeitada.', convert_to_contract: 'Contrato criado!',
      };
      toast.success(labels[action]);
      fetchData();
    } catch {
      toast.error('Erro ao executar ação.');
    } finally {
      setPerformingAction(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/sales/proposals/${confirmDelete.id}/`);
      toast.success(`Proposta "${confirmDelete.number || confirmDelete.title}" excluída.`);
      setConfirmDelete(null);
      fetchData();
    } catch {
      toast.error('Erro ao excluir proposta.');
    }
  };

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Vendas</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Propostas e ciclo de vida comercial</p>
        </div>
        <Button onClick={openNewModal}>
          <Plus className="w-4 h-4" /> Nova Proposta
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {loading ? Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />) : (
          <>
            {[
              { icon: FileText, bg: 'bg-blue-50 dark:bg-blue-900/30', color: 'text-blue-600', label: 'Total de Propostas', value: <Sensitive>{total}</Sensitive> },
              { icon: CheckCircle, bg: 'bg-emerald-50 dark:bg-emerald-900/30', color: 'text-emerald-600', label: 'Aprovadas', value: <Sensitive>{approvedCount}</Sensitive> },
              { icon: TrendingUp, bg: 'bg-violet-50 dark:bg-violet-900/30', color: 'text-violet-600', label: 'Valor Aprovado', value: <Sensitive>{formatCurrency(approvedValue)}</Sensitive> },
            ].map(({ icon: Icon, bg, color, label, value }) => (
              <div key={label} className="card card-hover p-5">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 ${bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">{label}</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{value}</p>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input type="text" placeholder="Buscar propostas..."
              value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              className="input-field pl-9" />
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? <TableSkeleton rows={6} cols={8} /> : (
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/80 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
                  <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Número</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Título</th>
                  <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Cliente</th>
                  <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tipo</th>
                  <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Valor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {proposals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-gray-400 dark:text-gray-500 text-sm">
                      Nenhuma proposta encontrada
                    </td>
                  </tr>
                ) : proposals.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="hidden md:table-cell px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400"><Sensitive>{p.number}</Sensitive></td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100"><Sensitive>{p.title}</Sensitive></td>
                    <td className="hidden md:table-cell px-4 py-3 text-sm text-gray-500 dark:text-gray-400"><Sensitive>{p.customer_name || p.prospect_company || '—'}</Sensitive></td>
                    <td className="hidden md:table-cell px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{proposalTypeLabels[p.proposal_type] || p.proposal_type}</td>
                    <td className="hidden md:table-cell px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                      {p.total_value ? <Sensitive>{formatCurrency(p.total_value)}</Sensitive> : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusBadge[p.status] || 'neutral'}>
                        {statusLabels[p.status] || p.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {p.status === 'draft' && (
                          <button
                            onClick={() => handleAction(p, 'send')}
                            disabled={performingAction === `${p.id}-send`}
                            title="Enviar proposta"
                            aria-label="Enviar proposta"
                            className="p-1.5 text-gray-300 dark:text-gray-500 hover:text-blue-600 transition-colors rounded-lg hover:bg-blue-50 disabled:opacity-50">
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        {['sent', 'viewed', 'discussion'].includes(p.status) && (
                          <>
                            <button onClick={() => handleAction(p, 'approve')} disabled={!!performingAction}
                              title="Aprovar"
                              aria-label="Aprovar"
                              className="p-1.5 text-gray-300 dark:text-gray-500 hover:text-emerald-600 transition-colors rounded-lg hover:bg-emerald-50 disabled:opacity-50">
                              <ThumbsUp className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleAction(p, 'reject')} disabled={!!performingAction}
                              title="Rejeitar"
                              aria-label="Rejeitar"
                              className="p-1.5 text-gray-300 dark:text-gray-500 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 disabled:opacity-50">
                              <ThumbsDown className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {p.status === 'approved' && (
                          <button onClick={() => handleAction(p, 'convert_to_contract')} disabled={!!performingAction}
                            title="Converter em Contrato"
                            aria-label="Converter em Contrato"
                            className="p-1.5 text-gray-300 dark:text-gray-500 hover:text-accent-gold transition-colors rounded-lg hover:bg-accent-gold/5 disabled:opacity-50">
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => openEditModal(p)}
                          aria-label="Editar"
                          className="p-1.5 text-gray-300 dark:text-gray-500 hover:text-accent-gold transition-colors rounded-lg hover:bg-accent-gold/5">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => setConfirmDelete(p)}
                          aria-label="Excluir"
                          className="p-1.5 text-gray-300 dark:text-gray-500 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Pagination page={page} totalPages={totalPages} totalItems={total} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
        <div className="flex items-center gap-1"><Send className="w-3.5 h-3.5 text-blue-400" /> Enviar</div>
        <div className="flex items-center gap-1"><ThumbsUp className="w-3.5 h-3.5 text-emerald-500" /> Aprovar</div>
        <div className="flex items-center gap-1"><ThumbsDown className="w-3.5 h-3.5 text-red-400" /> Rejeitar</div>
        <div className="flex items-center gap-1"><ArrowRight className="w-3.5 h-3.5 text-accent-gold" /> Converter em Contrato</div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <FocusTrap onClose={handleCloseModal}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto shadow-modal animate-modal-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {editingProposal ? 'Editar Proposta' : 'Nova Proposta'}
              </h2>
              <button onClick={handleCloseModal} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors" aria-label="Fechar">
                <X className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <FormField label="Título" required error={errors.title}>
                {(props) => (
                  <input type="text" {...props} value={formData.title}
                    onChange={(e) => { setFormData({ ...formData, title: e.target.value }); setErrors(prev => ({ ...prev, title: '' })); }}
                    onBlur={() => validateField('title', formData.title)}
                    className="input-field" placeholder="Título da proposta" />
                )}
              </FormField>
              <FormField label="Cliente" required error={errors.customer}>
                {(props) => (
                  <select {...props} value={formData.customer}
                    onChange={(e) => { setFormData({ ...formData, customer: e.target.value }); setErrors(prev => ({ ...prev, customer: '' })); }}
                    onBlur={() => validateField('customer', formData.customer)}
                    className="input-field bg-white dark:bg-gray-800">
                    <option value="">Selecione um cliente</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.company_name || c.name}</option>)}
                  </select>
                )}
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Tipo">
                  {(props) => (
                    <select {...props} value={formData.proposal_type} onChange={(e) => setFormData({ ...formData, proposal_type: e.target.value })}
                      className="input-field bg-white dark:bg-gray-800">
                      <option value="software_dev">Desenvolvimento</option>
                      <option value="maintenance">Manutenção</option>
                      <option value="consulting">Consultoria</option>
                      <option value="support">Suporte</option>
                    </select>
                  )}
                </FormField>
                <FormField label="Cobrança">
                  {(props) => (
                    <select {...props} value={formData.billing_type} onChange={(e) => setFormData({ ...formData, billing_type: e.target.value })}
                      className="input-field bg-white dark:bg-gray-800">
                      <option value="fixed">Valor Fixo</option>
                      <option value="hourly">Por Hora</option>
                      <option value="monthly">Mensal</option>
                      <option value="milestone">Por Marco</option>
                    </select>
                  )}
                </FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Valor Total (R$)" required error={errors.total_value}>
                  {(props) => (
                    <input type="number" step="0.01" {...props} value={formData.total_value}
                      onChange={(e) => { setFormData({ ...formData, total_value: e.target.value }); setErrors(prev => ({ ...prev, total_value: '' })); }}
                      onBlur={() => validateField('total_value', formData.total_value)}
                      className="input-field" />
                  )}
                </FormField>
                <FormField label="Validade">
                  {(props) => (
                    <input type="date" {...props} value={formData.valid_until}
                      onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                      className="input-field" />
                  )}
                </FormField>
              </div>
              <FormField label="Observações">
                {(props) => (
                  <textarea {...props} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3} className="input-field resize-none" placeholder="Observações sobre a proposta..." />
                )}
              </FormField>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="secondary" className="flex-1" onClick={handleCloseModal}>
                  Cancelar
                </Button>
                <Button type="submit" loading={saving} className="flex-1">
                  {editingProposal ? 'Atualizar' : 'Criar Proposta'}
                </Button>
              </div>
            </form>
          </div>
          </FocusTrap>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Excluir proposta"
        description={`Tem certeza que deseja excluir a proposta "${confirmDelete?.number || confirmDelete?.title}"?`}
        confirmLabel="Excluir"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmDialog
        open={showDiscardConfirm}
        title="Descartar alterações?"
        description="Você tem alterações não salvas. Deseja descartá-las?"
        confirmLabel="Descartar"
        danger
        onConfirm={() => {
          setShowDiscardConfirm(false);
          setShowModal(false);
          setFormData(EMPTY_FORM);
          setEditingProposal(null);
        }}
        onCancel={() => setShowDiscardConfirm(false)}
      />
    </div>
  );
}
