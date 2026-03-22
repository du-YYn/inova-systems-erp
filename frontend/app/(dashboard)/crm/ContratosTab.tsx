'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, ScrollText, TrendingUp, CheckCircle, AlertTriangle, Trash2, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton, CardSkeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
import FocusTrap from '@/components/ui/FocusTrap';
import { Sensitive } from '@/components/ui/Sensitive';
import api, { ApiError } from '@/lib/api';

interface Contract {
  id: number;
  number: string;
  title: string;
  customer: number | null;
  customer_name: string;
  proposal_title: string;
  contract_type: string;
  billing_type: string;
  start_date: string | null;
  end_date: string | null;
  monthly_value: string | null;
  hourly_rate: string | null;
  total_hours_monthly: string | null;
  status: string;
  auto_renew: boolean;
  created_at: string;
}

interface Customer { id: number; company_name: string; name: string; }
interface DashboardStats {
  total_contracts: number;
  active_contracts: number;
  mrr: number;
  expiring_contracts: number;
}

const PAGE_SIZE = 10;

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200',
  pending_signature: 'bg-yellow-100 text-yellow-800',
  active: 'bg-green-100 text-green-800',
  suspended: 'bg-orange-100 text-orange-800',
  cancelled: 'bg-red-100 text-red-800',
  expired: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
};
const statusLabels: Record<string, string> = {
  draft: 'Rascunho', pending_signature: 'Aguard. Assinatura',
  active: 'Ativo', suspended: 'Suspenso',
  cancelled: 'Cancelado', expired: 'Expirado',
};
const contractTypeLabels: Record<string, string> = {
  custom_dev: 'Desenvolvimento', saas: 'SaaS', maintenance: 'Manutenção',
  support: 'Suporte', consulting: 'Consultoria', internal: 'Interno',
};
const billingTypeLabels: Record<string, string> = {
  fixed: 'Valor Fixo', hourly: 'Por Hora', monthly: 'Mensal',
  milestone: 'Por Marco', not_billed: 'Não Faturado',
};

const formatCurrency = (v: string | number | null) =>
  v ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v)) : '—';
const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const EMPTY_FORM = {
  title: '', customer: '', contract_type: 'custom_dev', billing_type: 'fixed',
  start_date: '', end_date: '', monthly_value: '', hourly_rate: '',
  total_hours_monthly: '', auto_renew: false, notes: '', terms: '',
};

export default function ContratosTab() {
  const toast = useToast();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Contract | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), page_size: String(PAGE_SIZE) };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;

      const [contractsData, customersData, statsData] = await Promise.all([
        api.get<{ results: Contract[]; count: number }>('/sales/contracts/', params),
        api.get<{ results: Customer[] }>('/sales/customers/', { page_size: '200' }),
        api.get<DashboardStats>('/sales/contracts/dashboard/').catch(() => ({} as DashboardStats)),
      ]);
      const cList = contractsData.results || contractsData;
      const kList = customersData.results || customersData;
      setContracts(Array.isArray(cList) ? cList : []);
      setTotal(contractsData.count ?? (Array.isArray(cList) ? cList.length : 0));
      setCustomers(Array.isArray(kList) ? kList : []);
      if (statsData && !(statsData as unknown as Record<string, unknown>).detail) setStats(statsData);
    } catch {
      toast.error('Erro ao carregar contratos.');
    } finally {
      setLoading(false);
    }
  }, [page, search, filterStatus]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: formData.title,
        contract_type: formData.contract_type,
        billing_type: formData.billing_type,
        auto_renew: formData.auto_renew,
      };
      if (formData.customer) body.customer = Number(formData.customer);
      if (formData.start_date) body.start_date = formData.start_date;
      if (formData.end_date) body.end_date = formData.end_date;
      if (formData.monthly_value) body.monthly_value = formData.monthly_value;
      if (formData.hourly_rate) body.hourly_rate = formData.hourly_rate;
      if (formData.total_hours_monthly) body.total_hours_monthly = formData.total_hours_monthly;
      if (formData.notes) body.notes = formData.notes;
      if (formData.terms) body.terms = formData.terms;

      await api.post('/sales/contracts/', body);
      toast.success('Contrato criado com sucesso!');
      setShowModal(false);
      setFormData({ ...EMPTY_FORM });
      fetchData();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Erro ao criar contrato.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusAction = async (contract: Contract, action: 'activate' | 'cancel') => {
    try {
      await api.post(`/sales/contracts/${contract.id}/${action}/`);
      toast.success(action === 'activate' ? 'Contrato ativado!' : 'Contrato cancelado.');
      fetchData();
    } catch {
      toast.error('Erro ao atualizar status do contrato.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/sales/contracts/${deleteTarget.id}/`);
      toast.success(`Contrato "${deleteTarget.number}" removido.`);
      setDeleteTarget(null);
      fetchData();
    } catch {
      toast.error('Erro ao remover contrato.');
    } finally {
      setDeleting(false);
    }
  };

  const statusTabs = [
    ['', 'Todos'],
    ['pending_signature', 'Aguard. Assinatura'],
    ['active', 'Ativos'],
    ['cancelled', 'Cancelados'],
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div />
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors"
        >
          <Plus className="w-5 h-5" />
          Novo Contrato
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {loading || !stats ? Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />) : (
          <>
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <ScrollText className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">Total</p>
              </div>
              <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100"><Sensitive>{stats.total_contracts}</Sensitive></p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">Ativos</p>
              </div>
              <p className="text-2xl font-semibold text-green-600"><Sensitive>{stats.active_contracts}</Sensitive></p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-accent-gold" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">MRR</p>
              </div>
              <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100"><Sensitive>{formatCurrency(stats.mrr)}</Sensitive></p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-orange-400" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">Vencendo (30d)</p>
              </div>
              <p className={`text-2xl font-semibold ${stats.expiring_contracts > 0 ? 'text-orange-500' : 'text-gray-900 dark:text-gray-100'}`}>
                <Sensitive>{stats.expiring_contracts}</Sensitive>
              </p>
            </div>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder="Buscar contrato..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold text-sm"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {statusTabs.map(([val, label]) => (
            <button
              key={val}
              onClick={() => { setFilterStatus(val); setPage(1); }}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterStatus === val
                  ? 'bg-accent-gold text-white'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-4"><TableSkeleton rows={8} cols={6} /></div>
        ) : contracts.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            <ScrollText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Nenhum contrato encontrado</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">Contrato</th>
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">Cliente</th>
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">Tipo / Cobrança</th>
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">Valor</th>
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">Vigência</th>
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">Status</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {contracts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100"><Sensitive>{c.title}</Sensitive></p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono"><Sensitive>{c.number}</Sensitive></p>
                    {c.proposal_title && <p className="text-xs text-gray-500 dark:text-gray-400">Prop: <Sensitive>{c.proposal_title}</Sensitive></p>}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-900 dark:text-gray-100"><Sensitive>{c.customer_name || '—'}</Sensitive></p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-900 dark:text-gray-100">{contractTypeLabels[c.contract_type] || c.contract_type}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{billingTypeLabels[c.billing_type] || c.billing_type}</p>
                  </td>
                  <td className="px-6 py-4">
                    {c.monthly_value && <p className="text-sm font-medium text-gray-900 dark:text-gray-100"><Sensitive>{formatCurrency(c.monthly_value)}</Sensitive>/mês</p>}
                    {c.hourly_rate && <p className="text-xs text-gray-500 dark:text-gray-400"><Sensitive>{formatCurrency(c.hourly_rate)}</Sensitive>/h</p>}
                    {!c.monthly_value && !c.hourly_rate && <p className="text-sm text-gray-500 dark:text-gray-400">—</p>}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(c.start_date)} →</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(c.end_date)}</p>
                    {c.auto_renew && <span className="text-xs text-green-600">↻ Renovação auto.</span>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[c.status] || 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>
                      {statusLabels[c.status] || c.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 justify-end">
                      {c.status === 'pending_signature' && (
                        <button
                          onClick={() => handleStatusAction(c, 'activate')}
                          className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 transition-colors"
                        >
                          Ativar
                        </button>
                      )}
                      {c.status === 'active' && (
                        <button
                          onClick={() => handleStatusAction(c, 'cancel')}
                          className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100 transition-colors"
                        >
                          Cancelar
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteTarget(c)}
                        className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors"
                        aria-label="Excluir"
                      >
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

      {!loading && totalPages > 1 && (
        <div className="mt-4">
          <Pagination page={page} totalPages={totalPages} totalItems={total} pageSize={PAGE_SIZE} onChange={setPage} />
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <FocusTrap onClose={() => setShowModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto shadow-modal animate-modal-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Novo Contrato</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" aria-label="Fechar">
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Título *</label>
                <input
                  type="text" required value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Cliente</label>
                <select
                  value={formData.customer}
                  onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                  className="w-full input-field bg-white dark:bg-gray-800"
                >
                  <option value="">Selecione um cliente</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.company_name || c.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Tipo</label>
                  <select
                    value={formData.contract_type}
                    onChange={(e) => setFormData({ ...formData, contract_type: e.target.value })}
                    className="w-full input-field bg-white dark:bg-gray-800"
                  >
                    {Object.entries(contractTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Cobrança</label>
                  <select
                    value={formData.billing_type}
                    onChange={(e) => setFormData({ ...formData, billing_type: e.target.value })}
                    className="w-full input-field bg-white dark:bg-gray-800"
                  >
                    {Object.entries(billingTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Início</label>
                  <input
                    type="date" value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Término</label>
                  <input
                    type="date" value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full input-field"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Valor Mensal (R$)</label>
                  <input
                    type="number" step="0.01" value={formData.monthly_value}
                    onChange={(e) => setFormData({ ...formData, monthly_value: e.target.value })}
                    className="w-full input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Valor/Hora (R$)</label>
                  <input
                    type="number" step="0.01" value={formData.hourly_rate}
                    onChange={(e) => setFormData({ ...formData, hourly_rate: e.target.value })}
                    className="w-full input-field"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.auto_renew}
                  onChange={(e) => setFormData({ ...formData, auto_renew: e.target.checked })}
                  className="w-4 h-4 rounded text-accent-gold"
                />
                <span className="text-sm text-gray-500 dark:text-gray-400">Renovação automática</span>
              </label>

              <div className="flex gap-3 pt-4">
                <button
                  type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit" disabled={saving}
                  className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60"
                >
                  {saving ? 'Salvando...' : 'Criar Contrato'}
                </button>
              </div>
            </form>
          </div>
          </FocusTrap>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remover Contrato"
        description={`Tem certeza que deseja remover o contrato "${deleteTarget?.number} — ${deleteTarget?.title}"?`}
        confirmLabel={deleting ? 'Removendo...' : 'Remover'}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
