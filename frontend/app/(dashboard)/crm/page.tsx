'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Users,
  FileText,
  DollarSign,
  TrendingUp,
  X,
  LayoutList,
  Kanban,
  ChevronDown,
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
  contact_phone: string;
  source: string;
  status: string;
  estimated_value: number;
  notes: string;
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

const PIPELINE_COLUMNS = [
  'new', 'contacted', 'qualified', 'meeting', 'proposal', 'negotiation', 'won', 'lost',
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const EMPTY_FORM = {
  company_name: '', contact_name: '', contact_email: '', contact_phone: '',
  source: 'website', status: 'new', estimated_value: 0, notes: '',
};

type ViewMode = 'list' | 'pipeline';

export default function CRMPage() {
  const toast = useToast();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [allProspects, setAllProspects] = useState<Prospect[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showModal, setShowModal] = useState(false);
  const [editingProspect, setEditingProspect] = useState<Prospect | null>(null);
  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<number | null>(null);
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
      setProspects(Array.isArray(data.results || data) ? (data.results || data) : []);
      setTotal(data.count ?? (data.results || data).length);
    } catch {
      toast.error('Erro ao carregar prospects');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  const fetchAllProspects = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/sales/prospects/?page_size=500`, { headers: getHeaders(), credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setAllProspects(Array.isArray(data.results || data) ? (data.results || data) : []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchProspects(); }, [fetchProspects]);
  useEffect(() => { if (viewMode === 'pipeline') fetchAllProspects(); }, [viewMode]);

  // debounce search
  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const pipelineValue = allProspects.reduce((acc, p) => acc + (p.estimated_value || 0), 0);

  const openNewModal = () => {
    setEditingProspect(null);
    setFormData(EMPTY_FORM);
    setShowModal(true);
  };

  const openEditModal = (p: Prospect) => {
    setEditingProspect(p);
    setFormData({
      company_name: p.company_name, contact_name: p.contact_name,
      contact_email: p.contact_email, contact_phone: p.contact_phone || '',
      source: p.source || 'website', status: p.status,
      estimated_value: p.estimated_value || 0, notes: p.notes || '',
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingProspect
        ? `${apiUrl}/sales/prospects/${editingProspect.id}/`
        : `${apiUrl}/sales/prospects/`;
      const method = editingProspect ? 'PATCH' : 'POST';
      const res = await fetch(url, { method, headers: getHeaders(), credentials: 'include', body: JSON.stringify(formData) });
      if (!res.ok) throw new Error();
      toast.success(editingProspect ? 'Prospect atualizado!' : 'Prospect criado!');
      setShowModal(false);
      fetchProspects();
      if (viewMode === 'pipeline') fetchAllProspects();
    } catch {
      toast.error('Erro ao salvar prospect.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (prospect: Prospect, newStatus: string) => {
    setUpdatingStatus(prospect.id);
    try {
      const res = await fetch(`${apiUrl}/sales/prospects/${prospect.id}/`, {
        method: 'PATCH', headers: getHeaders(), credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Status atualizado para "${statusLabels[newStatus]}"`);
      fetchProspects();
      if (viewMode === 'pipeline') fetchAllProspects();
    } catch {
      toast.error('Erro ao atualizar status.');
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      const res = await fetch(`${apiUrl}/sales/prospects/${confirmDelete.id}/`, {
        method: 'DELETE', headers: getHeaders(), credentials: 'include',
      });
      if (!res.ok) throw new Error();
      toast.success(`"${confirmDelete.company_name}" removido.`);
      setConfirmDelete(null);
      fetchProspects();
      if (viewMode === 'pipeline') fetchAllProspects();
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
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
            <button onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-[#A6864A] text-white' : 'text-gray-500 hover:text-gray-700'}`}
              title="Lista">
              <LayoutList className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('pipeline')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'pipeline' ? 'bg-[#A6864A] text-white' : 'text-gray-500 hover:text-gray-700'}`}
              title="Pipeline">
              <Kanban className="w-4 h-4" />
            </button>
          </div>
          <button onClick={openNewModal}
            className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors">
            <Plus className="w-5 h-5" /> Novo Prospect
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {loading && viewMode === 'list' ? (
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
                  <p className="text-sm text-text-secondary">Valor do Pipeline</p>
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
                  <p className="text-sm text-text-secondary">Em Proposta</p>
                  <p className="text-lg font-semibold text-text-primary">
                    {(viewMode === 'pipeline' ? allProspects : prospects).filter(p => p.status === 'proposal').length}
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
                    {(viewMode === 'pipeline' ? allProspects : prospects).filter(p => p.status === 'won').length}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ─── List View ─────────────────────────────────────────────────────── */}
      {viewMode === 'list' && (
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
                          <div className="relative inline-block">
                            <select
                              value={prospect.status}
                              onChange={e => handleStatusChange(prospect, e.target.value)}
                              disabled={updatingStatus === prospect.id}
                              className={`pl-2 pr-6 py-1 rounded-full text-xs font-medium border-0 cursor-pointer appearance-none focus:outline-none focus:ring-2 focus:ring-accent-gold/30 ${statusColors[prospect.status] || 'bg-gray-100 text-gray-800'}`}
                            >
                              {Object.entries(statusLabels).map(([val, label]) => (
                                <option key={val} value={val}>{label}</option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEditModal(prospect)}
                              className="p-1.5 text-gray-400 hover:text-accent-gold transition-colors">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => setConfirmDelete(prospect)}
                              className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
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
      )}

      {/* ─── Pipeline View ──────────────────────────────────────────────────── */}
      {viewMode === 'pipeline' && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {PIPELINE_COLUMNS.map((status) => {
              const col = allProspects.filter(p => p.status === status);
              const colValue = col.reduce((acc, p) => acc + (p.estimated_value || 0), 0);
              return (
                <div key={status} className="w-64 flex flex-col gap-3">
                  {/* Column header */}
                  <div className="flex items-center justify-between px-3 py-2 bg-white rounded-lg border border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        status === 'won' ? 'bg-green-500' : status === 'lost' ? 'bg-red-500' :
                        status === 'new' ? 'bg-blue-500' : status === 'proposal' ? 'bg-orange-500' :
                        status === 'negotiation' ? 'bg-teal-500' : 'bg-purple-500'
                      }`} />
                      <span className="text-sm font-medium text-text-primary">{statusLabels[status]}</span>
                    </div>
                    <span className="text-xs text-text-secondary bg-gray-100 px-1.5 py-0.5 rounded-full">{col.length}</span>
                  </div>
                  {col.length > 0 && (
                    <p className="text-xs text-text-secondary px-1">{formatCurrency(colValue)}</p>
                  )}

                  {/* Cards */}
                  <div className="flex flex-col gap-2">
                    {col.map(prospect => (
                      <div key={prospect.id} className="bg-white rounded-lg border border-gray-100 p-3 hover:border-[#A6864A]/30 transition-colors">
                        <p className="text-sm font-medium text-text-primary mb-1">{prospect.company_name}</p>
                        <p className="text-xs text-text-secondary mb-2">{prospect.contact_name}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-[#A6864A]">{formatCurrency(prospect.estimated_value)}</span>
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEditModal(prospect)}
                              className="p-1 text-gray-400 hover:text-accent-gold transition-colors">
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setConfirmDelete(prospect)}
                              className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {col.length === 0 && (
                    <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
                      <p className="text-xs text-text-secondary">Sem prospects</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-text-primary">
                {editingProspect ? 'Editar Prospect' : 'Novo Prospect'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
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
                <label className="block text-sm font-medium text-text-secondary mb-1">Telefone</label>
                <input type="text" value={formData.contact_phone}
                  onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
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
              {editingProspect && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Status</label>
                  <select value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold bg-white">
                    {Object.entries(statusLabels).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Valor Estimado</label>
                <input type="number" step="0.01" value={formData.estimated_value}
                  onChange={(e) => setFormData({ ...formData, estimated_value: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Notas</label>
                <textarea value={formData.notes} rows={3}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold resize-none" />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60">
                  {saving ? 'Salvando...' : editingProspect ? 'Atualizar' : 'Criar'}
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
