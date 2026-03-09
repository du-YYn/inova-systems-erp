'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, Eye, Edit, Trash2,
  FileText, TrendingUp, CheckCircle, X
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton, CardSkeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';

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
  created_at: string;
}

interface Customer { id: number; company_name: string; name: string; }

const PAGE_SIZE = 10;

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800', sent: 'bg-blue-100 text-blue-800',
  viewed: 'bg-indigo-100 text-indigo-800', discussion: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800', rejected: 'bg-red-100 text-red-800',
  expired: 'bg-orange-100 text-orange-800',
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
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Proposal | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
  const getHeaders = () => ({ 'Content-Type': 'application/json' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (search) params.set('search', search);
      const [propRes, custRes] = await Promise.all([
        fetch(`${apiUrl}/sales/proposals/?${params}`, { headers: getHeaders(), credentials: 'include' }),
        fetch(`${apiUrl}/sales/customers/`, { headers: getHeaders(), credentials: 'include' }),
      ]);
      if (!propRes.ok || !custRes.ok) throw new Error('Unauthorized');
      const [propData, custData] = await Promise.all([propRes.json(), custRes.json()]);
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: formData.title,
        proposal_type: formData.proposal_type,
        billing_type: formData.billing_type,
        notes: formData.notes,
      };
      if (formData.customer) body.customer = Number(formData.customer);
      if (formData.total_value) body.total_value = formData.total_value;
      if (formData.hours_estimated) body.hours_estimated = formData.hours_estimated;
      if (formData.hourly_rate) body.hourly_rate = formData.hourly_rate;
      if (formData.valid_until) body.valid_until = formData.valid_until;

      const res = await fetch(`${apiUrl}/sales/proposals/`, {
        method: 'POST', headers: getHeaders(), credentials: 'include', body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast.success('Proposta criada com sucesso!');
      setShowModal(false);
      setFormData(EMPTY_FORM);
      fetchData();
    } catch {
      toast.error('Erro ao criar proposta. Verifique os dados e tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      const res = await fetch(`${apiUrl}/sales/proposals/${confirmDelete.id}/`, {
        method: 'DELETE', headers: getHeaders(), credentials: 'include',
      });
      if (!res.ok) throw new Error();
      toast.success(`Proposta "${confirmDelete.number || confirmDelete.title}" excluída.`);
      setConfirmDelete(null);
      fetchData();
    } catch {
      toast.error('Erro ao excluir proposta.');
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Vendas</h1>
          <p className="text-text-secondary mt-1">Gerencie suas propostas e contratos</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors">
          <Plus className="w-5 h-5" />
          Nova Proposta
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {loading ? Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />) : (
          <>
            <div className="bg-white p-4 rounded-lg border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-text-secondary">Total de Propostas</p>
                  <p className="text-lg font-semibold text-text-primary">{total}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-text-secondary">Aprovadas</p>
                  <p className="text-lg font-semibold text-text-primary">{approvedCount}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-text-secondary">Valor Aprovado</p>
                  <p className="text-lg font-semibold text-text-primary">{formatCurrency(approvedValue)}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input type="text" placeholder="Buscar propostas..."
              value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? <TableSkeleton rows={6} cols={8} /> : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">Número</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">Título</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">Cliente</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">Tipo</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">Valor</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">Status</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">Criada em</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-text-secondary">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {proposals.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-text-secondary">
                      Nenhuma proposta encontrada
                    </td>
                  </tr>
                ) : proposals.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-text-primary">{p.number}</td>
                    <td className="px-4 py-3 text-text-primary">{p.title}</td>
                    <td className="px-4 py-3 text-text-secondary">{p.customer_name || p.prospect_company || '—'}</td>
                    <td className="px-4 py-3 text-text-secondary">{proposalTypeLabels[p.proposal_type] || p.proposal_type}</td>
                    <td className="px-4 py-3 font-medium text-text-primary">
                      {p.total_value ? formatCurrency(p.total_value) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[p.status] || 'bg-gray-100 text-gray-800'}`}>
                        {statusLabels[p.status] || p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {new Date(p.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button className="p-1.5 text-gray-400 hover:text-accent-gold transition-colors"><Eye className="w-4 h-4" /></button>
                        <button className="p-1.5 text-gray-400 hover:text-accent-gold transition-colors"><Edit className="w-4 h-4" /></button>
                        <button onClick={() => setConfirmDelete(p)}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-text-primary">Nova Proposta</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Título *</label>
                <input type="text" required value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Cliente</label>
                <select value={formData.customer} onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold bg-white">
                  <option value="">Selecione um cliente</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.company_name || c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Tipo</label>
                  <select value={formData.proposal_type} onChange={(e) => setFormData({ ...formData, proposal_type: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold bg-white">
                    <option value="software_dev">Desenvolvimento</option>
                    <option value="maintenance">Manutenção</option>
                    <option value="consulting">Consultoria</option>
                    <option value="support">Suporte</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Cobrança</label>
                  <select value={formData.billing_type} onChange={(e) => setFormData({ ...formData, billing_type: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold bg-white">
                    <option value="fixed">Valor Fixo</option>
                    <option value="hourly">Por Hora</option>
                    <option value="monthly">Mensal</option>
                    <option value="milestone">Por Marco</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Valor Total (R$)</label>
                  <input type="number" step="0.01" value={formData.total_value}
                    onChange={(e) => setFormData({ ...formData, total_value: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Validade</label>
                  <input type="date" value={formData.valid_until}
                    onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Observações</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60">
                  {saving ? 'Salvando...' : 'Criar Proposta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Excluir proposta"
        description={`Tem certeza que deseja excluir a proposta "${confirmDelete?.number || confirmDelete?.title}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
