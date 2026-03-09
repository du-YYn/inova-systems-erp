'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, ScrollText, TrendingUp, CheckCircle, AlertTriangle, Trash2, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton, CardSkeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';

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
  draft: 'bg-gray-100 text-gray-700',
  pending_signature: 'bg-yellow-100 text-yellow-800',
  active: 'bg-green-100 text-green-800',
  suspended: 'bg-orange-100 text-orange-800',
  cancelled: 'bg-red-100 text-red-800',
  expired: 'bg-gray-100 text-gray-500',
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

export default function ContratosPage() {
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

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
  const h = () => ({ 'Content-Type': 'application/json' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (search) params.set('search', search);
      if (filterStatus) params.set('status', filterStatus);

      const [contractsRes, customersRes, statsRes] = await Promise.all([
        fetch(`${apiUrl}/sales/contracts/?${params}`, { headers: h(), credentials: 'include' }),
        fetch(`${apiUrl}/sales/customers/?page_size=200`, { headers: h(), credentials: 'include' }),
        fetch(`${apiUrl}/sales/contracts/dashboard/`, { headers: h(), credentials: 'include' }),
      ]);
      const [contractsData, customersData, statsData] = await Promise.all([
        contractsRes.json(), customersRes.json(), statsRes.json(),
      ]);
      setContracts(contractsData.results || contractsData);
      setTotal(contractsData.count ?? (contractsData.results || contractsData).length);
      setCustomers(customersData.results || customersData);
      setStats(statsData);
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

      const res = await fetch(`${apiUrl}/sales/contracts/`, {
        method: 'POST', headers: h(), credentials: 'include', body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast.success('Contrato criado com sucesso!');
      setShowModal(false);
      setFormData({ ...EMPTY_FORM });
      fetchData();
    } catch {
      toast.error('Erro ao criar contrato.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusAction = async (contract: Contract, action: 'activate' | 'cancel') => {
    try {
      const res = await fetch(`${apiUrl}/sales/contracts/${contract.id}/${action}/`, {
        method: 'POST', headers: h(), credentials: 'include',
      });
      if (!res.ok) throw new Error();
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
      const res = await fetch(`${apiUrl}/sales/contracts/${deleteTarget.id}/`, {
        method: 'DELETE', headers: h(), credentials: 'include',
      });
      if (!res.ok) throw new Error();
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
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Contratos</h1>
          <p className="text-text-secondary mt-1">Gestão de contratos com clientes</p>
        </div>
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
            <div className="bg-white p-5 rounded-lg border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <ScrollText className="w-4 h-4 text-gray-400" />
                <p className="text-text-secondary text-sm">Total</p>
              </div>
              <p className="text-2xl font-semibold text-text-primary">{stats.total_contracts}</p>
            </div>
            <div className="bg-white p-5 rounded-lg border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <p className="text-text-secondary text-sm">Ativos</p>
              </div>
              <p className="text-2xl font-semibold text-green-600">{stats.active_contracts}</p>
            </div>
            <div className="bg-white p-5 rounded-lg border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-accent-gold" />
                <p className="text-text-secondary text-sm">MRR</p>
              </div>
              <p className="text-2xl font-semibold text-text-primary">{formatCurrency(stats.mrr)}</p>
            </div>
            <div className="bg-white p-5 rounded-lg border border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-orange-400" />
                <p className="text-text-secondary text-sm">Vencendo (30d)</p>
              </div>
              <p className={`text-2xl font-semibold ${stats.expiring_contracts > 0 ? 'text-orange-500' : 'text-text-primary'}`}>
                {stats.expiring_contracts}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar contrato..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold text-sm"
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
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-4"><TableSkeleton rows={8} cols={6} /></div>
        ) : contracts.length === 0 ? (
          <div className="text-center py-16 text-text-secondary">
            <ScrollText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Nenhum contrato encontrado</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">Contrato</th>
                <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">Cliente</th>
                <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">Tipo / Cobrança</th>
                <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">Valor</th>
                <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">Vigência</th>
                <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">Status</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {contracts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-text-primary">{c.title}</p>
                    <p className="text-xs text-text-secondary font-mono">{c.number}</p>
                    {c.proposal_title && <p className="text-xs text-text-secondary">Prop: {c.proposal_title}</p>}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-text-primary">{c.customer_name || '—'}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-text-primary">{contractTypeLabels[c.contract_type] || c.contract_type}</p>
                    <p className="text-xs text-text-secondary">{billingTypeLabels[c.billing_type] || c.billing_type}</p>
                  </td>
                  <td className="px-6 py-4">
                    {c.monthly_value && <p className="text-sm font-medium text-text-primary">{formatCurrency(c.monthly_value)}/mês</p>}
                    {c.hourly_rate && <p className="text-xs text-text-secondary">{formatCurrency(c.hourly_rate)}/h</p>}
                    {!c.monthly_value && !c.hourly_rate && <p className="text-sm text-text-secondary">—</p>}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-xs text-text-secondary">{formatDate(c.start_date)} →</p>
                    <p className="text-xs text-text-secondary">{formatDate(c.end_date)}</p>
                    {c.auto_renew && <span className="text-xs text-green-600">↻ Renovação auto.</span>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[c.status] || 'bg-gray-100 text-gray-700'}`}>
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
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
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
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-text-primary">Novo Contrato</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Título *</label>
                <input
                  type="text" required value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Cliente</label>
                <select
                  value={formData.customer}
                  onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold bg-white"
                >
                  <option value="">Selecione um cliente</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.company_name || c.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Tipo</label>
                  <select
                    value={formData.contract_type}
                    onChange={(e) => setFormData({ ...formData, contract_type: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold bg-white"
                  >
                    {Object.entries(contractTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Cobrança</label>
                  <select
                    value={formData.billing_type}
                    onChange={(e) => setFormData({ ...formData, billing_type: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold bg-white"
                  >
                    {Object.entries(billingTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Início</label>
                  <input
                    type="date" value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Término</label>
                  <input
                    type="date" value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Valor Mensal (R$)</label>
                  <input
                    type="number" step="0.01" value={formData.monthly_value}
                    onChange={(e) => setFormData({ ...formData, monthly_value: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Valor/Hora (R$)</label>
                  <input
                    type="number" step="0.01" value={formData.hourly_rate}
                    onChange={(e) => setFormData({ ...formData, hourly_rate: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
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
                <span className="text-sm text-text-secondary">Renovação automática</span>
              </label>

              <div className="flex gap-3 pt-4">
                <button
                  type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
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
