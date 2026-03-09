'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  Users,
  FileText,
  DollarSign,
  TrendingUp,
  X
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton, CardSkeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';

interface Prospect {
  id: number;
  company_name: string;
  contact_name: string;
  contact_email: string;
  source: string;
  status: string;
  estimated_value: number;
}

const PAGE_SIZE = 10;

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  contacted: 'bg-yellow-100 text-yellow-800',
  qualified: 'bg-purple-100 text-purple-800',
  meeting: 'bg-indigo-100 text-indigo-800',
  proposal: 'bg-orange-100 text-orange-800',
  negotiation: 'bg-teal-100 text-teal-800',
  won: 'bg-green-100 text-green-800',
  lost: 'bg-red-100 text-red-800',
  inactive: 'bg-gray-100 text-gray-800',
};

const statusLabels: Record<string, string> = {
  new: 'Novo', contacted: 'Contatado', qualified: 'Qualificado',
  meeting: 'Reunião', proposal: 'Proposta', negotiation: 'Negociação',
  won: 'Fechado', lost: 'Perdido', inactive: 'Inativo',
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const EMPTY_FORM = {
  company_name: '', contact_name: '', contact_email: '',
  source: 'website', status: 'new', estimated_value: 0,
};

export default function CRMPage() {
  const toast = useToast();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Prospect | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
  const getHeaders = () => ({ 'Content-Type': 'application/json' });

  const fetchProspects = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (search) params.set('search', search);
      const res = await fetch(`${apiUrl}/sales/prospects/?${params}`, { headers: getHeaders(), credentials: 'include' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setProspects(data.results || data);
      setTotal(data.count ?? (data.results || data).length);
    } catch {
      toast.error('Erro ao carregar prospects');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { fetchProspects(); }, [fetchProspects]);

  // debounce search
  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const pipelineValue = prospects.reduce((acc, p) => acc + (p.estimated_value || 0), 0);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${apiUrl}/sales/prospects/`, {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error();
      toast.success('Prospect criado com sucesso!');
      setShowModal(false);
      setFormData(EMPTY_FORM);
      fetchProspects();
    } catch {
      toast.error('Erro ao criar prospect. Verifique os dados e tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      const res = await fetch(`${apiUrl}/sales/prospects/${confirmDelete.id}/`, {
        method: 'DELETE',
        headers: getHeaders(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error();
      toast.success(`"${confirmDelete.company_name}" removido.`);
      setConfirmDelete(null);
      fetchProspects();
    } catch {
      toast.error('Erro ao excluir prospect.');
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">CRM</h1>
          <p className="text-text-secondary mt-1">Gestão de Prospecção e Clientes</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors"
        >
          <Plus className="w-5 h-5" />
          Novo Prospect
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
        ) : (
          <>
            <div className="bg-white p-4 rounded-lg border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-text-secondary">Total Prospects</p>
                  <p className="text-lg font-semibold text-text-primary">{total}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-text-secondary">Pipeline (página)</p>
                  <p className="text-lg font-semibold text-text-primary">{formatCurrency(pipelineValue)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-text-secondary">Propostas Abertas</p>
                  <p className="text-lg font-semibold text-text-primary">
                    {prospects.filter(p => p.status === 'proposal').length}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-accent-gold/10 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-accent-gold" />
                </div>
                <div>
                  <p className="text-sm text-text-secondary">Fechados</p>
                  <p className="text-lg font-semibold text-text-primary">
                    {prospects.filter(p => p.status === 'won').length}
                  </p>
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
            <input
              type="text"
              placeholder="Buscar prospects..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">Empresa</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">Contato</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">Origem</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">Valor Est.</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">Status</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-text-secondary">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {prospects.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-text-secondary">
                      Nenhum prospect encontrado
                    </td>
                  </tr>
                ) : (
                  prospects.map((prospect) => (
                    <tr key={prospect.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-text-primary">{prospect.company_name}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        <p className="text-text-primary">{prospect.contact_name}</p>
                        <p className="text-xs text-text-secondary">{prospect.contact_email}</p>
                      </td>
                      <td className="px-4 py-3 text-text-secondary capitalize">{prospect.source}</td>
                      <td className="px-4 py-3 text-text-primary font-medium">{formatCurrency(prospect.estimated_value)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[prospect.status] || 'bg-gray-100 text-gray-800'}`}>
                          {statusLabels[prospect.status] || prospect.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button className="p-1.5 text-gray-400 hover:text-accent-gold transition-colors">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button className="p-1.5 text-gray-400 hover:text-accent-gold transition-colors">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(prospect)}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          totalItems={total}
          pageSize={PAGE_SIZE}
          onChange={setPage}
        />
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-text-primary">Novo Prospect</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Empresa *</label>
                <input type="text" required value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Contato *</label>
                <input type="text" required value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Email *</label>
                <input type="email" required value={formData.contact_email}
                  onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Origem</label>
                <select value={formData.source}
                  onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold bg-white">
                  <option value="website">Website</option>
                  <option value="referral">Indicação</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="cold_call">Cold Call</option>
                  <option value="event">Evento</option>
                  <option value="other">Outro</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Valor Estimado</label>
                <input type="number" step="0.01" value={formData.estimated_value}
                  onChange={(e) => setFormData({ ...formData, estimated_value: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60">
                  {saving ? 'Salvando...' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Excluir prospect"
        description={`Tem certeza que deseja excluir "${confirmDelete?.company_name}"? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
