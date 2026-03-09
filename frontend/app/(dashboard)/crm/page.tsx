'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, Edit, Trash2, Users, FileText, DollarSign,
  TrendingUp, X, LayoutList, Kanban, ChevronDown,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton, CardSkeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

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

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'purple' | 'gold' | 'neutral';

const statusBadge: Record<string, BadgeVariant> = {
  new: 'info', contacted: 'warning', qualified: 'purple',
  meeting: 'info', proposal: 'warning', negotiation: 'neutral',
  won: 'success', lost: 'error', inactive: 'neutral',
};

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800', contacted: 'bg-yellow-100 text-yellow-800',
  qualified: 'bg-purple-100 text-purple-800', meeting: 'bg-indigo-100 text-indigo-800',
  proposal: 'bg-orange-100 text-orange-800', negotiation: 'bg-teal-100 text-teal-800',
  won: 'bg-green-100 text-green-800', lost: 'bg-red-100 text-red-800',
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

  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const pipelineValue = allProspects.reduce((acc, p) => acc + (p.estimated_value || 0), 0);

  const openNewModal = () => { setEditingProspect(null); setFormData(EMPTY_FORM); setShowModal(true); };

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
      const url = editingProspect ? `${apiUrl}/sales/prospects/${editingProspect.id}/` : `${apiUrl}/sales/prospects/`;
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

  const labelInput = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5';

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CRM</h1>
          <p className="text-sm text-gray-500 mt-1">Gestão de prospecção e pipeline de vendas</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-card">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all duration-150 ${viewMode === 'list' ? 'bg-[#A6864A] text-white shadow-sm' : 'text-gray-400 hover:text-gray-700'}`}
              title="Lista"
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('pipeline')}
              className={`p-2 rounded-lg transition-all duration-150 ${viewMode === 'pipeline' ? 'bg-[#A6864A] text-white shadow-sm' : 'text-gray-400 hover:text-gray-700'}`}
              title="Pipeline"
            >
              <Kanban className="w-4 h-4" />
            </button>
          </div>
          <Button onClick={openNewModal}>
            <Plus className="w-4 h-4" /> Novo Prospect
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {loading && viewMode === 'list' ? (
          Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
        ) : (
          <>
            {[
              { icon: Users, bg: 'bg-blue-50', color: 'text-blue-600', label: 'Total Prospects', value: total },
              { icon: TrendingUp, bg: 'bg-emerald-50', color: 'text-emerald-600', label: 'Valor do Pipeline', value: formatCurrency(pipelineValue) },
              { icon: FileText, bg: 'bg-violet-50', color: 'text-violet-600', label: 'Em Proposta',
                value: (viewMode === 'pipeline' ? allProspects : prospects).filter(p => p.status === 'proposal').length },
              { icon: DollarSign, bg: 'bg-[#A6864A]/10', color: 'text-[#A6864A]', label: 'Fechados',
                value: (viewMode === 'pipeline' ? allProspects : prospects).filter(p => p.status === 'won').length },
            ].map(({ icon: Icon, bg, color, label, value }) => (
              <div key={label} className="card card-hover p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide truncate">{label}</p>
                    <p className="text-lg font-bold text-gray-900 tabular-nums">{value}</p>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ─── List View ─── */}
      {viewMode === 'list' && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar prospects..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="input-field pl-9"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <TableSkeleton rows={6} cols={6} />
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Empresa</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Contato</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Origem</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor Est.</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {prospects.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-16 text-center text-gray-400 text-sm">
                        Nenhum prospect encontrado
                      </td>
                    </tr>
                  ) : (
                    prospects.map((prospect) => (
                      <tr key={prospect.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-4 py-3 font-semibold text-gray-900 text-sm">{prospect.company_name}</td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-gray-800">{prospect.contact_name}</p>
                          <p className="text-xs text-gray-400">{prospect.contact_email}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 capitalize">{prospect.source}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 tabular-nums">{formatCurrency(prospect.estimated_value)}</td>
                        <td className="px-4 py-3">
                          <div className="relative inline-block">
                            <select
                              value={prospect.status}
                              onChange={e => handleStatusChange(prospect, e.target.value)}
                              disabled={updatingStatus === prospect.id}
                              className={`pl-2 pr-6 py-1 rounded-full text-xs font-medium border-0 cursor-pointer appearance-none focus:outline-none focus:ring-2 focus:ring-[#A6864A]/30 ${statusColors[prospect.status] || 'bg-gray-100 text-gray-800'}`}
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
                              className="p-1.5 text-gray-300 hover:text-[#A6864A] transition-colors rounded-lg hover:bg-[#A6864A]/5">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => setConfirmDelete(prospect)}
                              className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50">
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

          <Pagination page={page} totalPages={totalPages} totalItems={total} pageSize={PAGE_SIZE} onChange={setPage} />
        </div>
      )}

      {/* ─── Pipeline View ─── */}
      {viewMode === 'pipeline' && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {PIPELINE_COLUMNS.map((status) => {
              const col = allProspects.filter(p => p.status === status);
              const colValue = col.reduce((acc, p) => acc + (p.estimated_value || 0), 0);
              return (
                <div key={status} className="w-60 flex flex-col gap-2">
                  <div className="flex items-center justify-between px-3 py-2.5 bg-white rounded-xl border border-gray-100 shadow-card">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusBadge[status] || 'neutral'} dot>{statusLabels[status]}</Badge>
                    </div>
                    <span className="text-xs text-gray-400 font-semibold">{col.length}</span>
                  </div>
                  {col.length > 0 && (
                    <p className="text-xs text-gray-400 px-1 font-medium tabular-nums">{formatCurrency(colValue)}</p>
                  )}
                  <div className="flex flex-col gap-2">
                    {col.map(prospect => (
                      <div key={prospect.id} className="card card-hover p-3 cursor-default">
                        <p className="text-sm font-semibold text-gray-900 mb-0.5">{prospect.company_name}</p>
                        <p className="text-xs text-gray-400 mb-2">{prospect.contact_name}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#A6864A] tabular-nums">{formatCurrency(prospect.estimated_value)}</span>
                          <div className="flex items-center gap-0.5">
                            <button onClick={() => openEditModal(prospect)}
                              className="p-1 text-gray-300 hover:text-[#A6864A] transition-colors rounded">
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setConfirmDelete(prospect)}
                              className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {col.length === 0 && (
                    <div className="border-2 border-dashed border-gray-100 rounded-xl p-5 text-center">
                      <p className="text-xs text-gray-300">Sem prospects</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto shadow-modal animate-modal-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-gray-900">
                {editingProspect ? 'Editar Prospect' : 'Novo Prospect'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 hover:bg-gray-100 rounded-xl transition-colors">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className={labelInput}>Empresa *</label>
                <input type="text" required value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  className="input-field" placeholder="Nome da empresa" />
              </div>
              <div>
                <label className={labelInput}>Contato *</label>
                <input type="text" required value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  className="input-field" placeholder="Nome do contato" />
              </div>
              <div>
                <label className={labelInput}>Email *</label>
                <input type="email" required value={formData.contact_email}
                  onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                  className="input-field" placeholder="email@empresa.com" />
              </div>
              <div>
                <label className={labelInput}>Telefone</label>
                <input type="text" value={formData.contact_phone}
                  onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                  className="input-field" placeholder="(11) 99999-9999" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelInput}>Origem</label>
                  <select value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                    className="input-field bg-white">
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
                    <label className={labelInput}>Status</label>
                    <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="input-field bg-white">
                      {Object.entries(statusLabels).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label className={labelInput}>Valor Estimado (R$)</label>
                <input type="number" step="0.01" value={formData.estimated_value}
                  onChange={(e) => setFormData({ ...formData, estimated_value: parseFloat(e.target.value) || 0 })}
                  className="input-field" />
              </div>
              <div>
                <label className={labelInput}>Notas</label>
                <textarea value={formData.notes} rows={3}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="input-field resize-none" placeholder="Observações sobre o prospect..." />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" loading={saving} className="flex-1">
                  {editingProspect ? 'Atualizar' : 'Criar Prospect'}
                </Button>
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
