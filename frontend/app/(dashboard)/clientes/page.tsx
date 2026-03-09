'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Building2, User, Trash2, Edit, X, Phone, Mail, MapPin } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton, CardSkeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';

interface Customer {
  id: number;
  customer_type: 'PF' | 'PJ';
  company_name: string;
  trading_name: string;
  name: string;
  document: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  is_active: boolean;
  segment: string;
  created_at: string;
}

const PAGE_SIZE = 10;

const EMPTY_FORM = {
  customer_type: 'PJ',
  company_name: '',
  trading_name: '',
  name: '',
  document: '',
  email: '',
  phone: '',
  city: '',
  state: '',
  segment: '',
  notes: '',
};

const segmentLabels: Record<string, string> = {
  tech: 'Tecnologia', industry: 'Indústria', commerce: 'Comércio',
  services: 'Serviços', health: 'Saúde', education: 'Educação',
  finance: 'Financeiro', government: 'Governo', other: 'Outro',
};

export default function ClientesPage() {
  const toast = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
  const h = () => ({ 'Content-Type': 'application/json' });

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (search) params.set('search', search);
      if (filterType) params.set('customer_type', filterType);
      const res = await fetch(`${apiUrl}/sales/customers/?${params}`, {
        headers: h(), credentials: 'include',
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCustomers(data.results || data);
      setTotal(data.count ?? (data.results || data).length);
    } catch {
      toast.error('Erro ao carregar clientes.');
    } finally {
      setLoading(false);
    }
  }, [page, search, filterType]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const totalPJ = customers.filter(c => c.customer_type === 'PJ').length;
  const totalPF = customers.filter(c => c.customer_type === 'PF').length;
  const totalActive = customers.filter(c => c.is_active).length;

  const openCreate = () => {
    setEditTarget(null);
    setFormData({ ...EMPTY_FORM });
    setShowModal(true);
  };

  const openEdit = (c: Customer) => {
    setEditTarget(c);
    setFormData({
      customer_type: c.customer_type,
      company_name: c.company_name || '',
      trading_name: c.trading_name || '',
      name: c.name || '',
      document: c.document || '',
      email: c.email || '',
      phone: c.phone || '',
      city: c.city || '',
      state: c.state || '',
      segment: c.segment || '',
      notes: '',
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editTarget
        ? `${apiUrl}/sales/customers/${editTarget.id}/`
        : `${apiUrl}/sales/customers/`;
      const res = await fetch(url, {
        method: editTarget ? 'PATCH' : 'POST',
        headers: h(),
        credentials: 'include',
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error();
      toast.success(editTarget ? 'Cliente atualizado!' : 'Cliente criado com sucesso!');
      setShowModal(false);
      fetchCustomers();
    } catch {
      toast.error('Erro ao salvar cliente.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${apiUrl}/sales/customers/${deleteTarget.id}/`, {
        method: 'DELETE', headers: h(), credentials: 'include',
      });
      if (!res.ok) throw new Error();
      toast.success(`Cliente "${deleteTarget.company_name || deleteTarget.name}" removido.`);
      setDeleteTarget(null);
      fetchCustomers();
    } catch {
      toast.error('Erro ao remover cliente.');
    } finally {
      setDeleting(false);
    }
  };

  const displayName = (c: Customer) => c.company_name || c.name || '—';

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Clientes</h1>
          <p className="text-text-secondary mt-1">Cadastro e gestão de clientes</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors"
        >
          <Plus className="w-5 h-5" />
          Novo Cliente
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {loading ? Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />) : (
          <>
            <div className="bg-white p-5 rounded-lg border border-gray-100">
              <p className="text-text-secondary text-sm">Total</p>
              <p className="text-2xl font-semibold text-text-primary mt-1">{total}</p>
            </div>
            <div className="bg-white p-5 rounded-lg border border-gray-100">
              <p className="text-text-secondary text-sm">Ativos</p>
              <p className="text-2xl font-semibold text-green-600 mt-1">{totalActive}</p>
            </div>
            <div className="bg-white p-5 rounded-lg border border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="w-4 h-4 text-blue-500" />
                <p className="text-text-secondary text-sm">Pessoas Jurídicas</p>
              </div>
              <p className="text-2xl font-semibold text-text-primary">{totalPJ}</p>
            </div>
            <div className="bg-white p-5 rounded-lg border border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <User className="w-4 h-4 text-purple-500" />
                <p className="text-text-secondary text-sm">Pessoas Físicas</p>
              </div>
              <p className="text-2xl font-semibold text-text-primary">{totalPF}</p>
            </div>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome, empresa, documento..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold text-sm"
          />
        </div>
        <div className="flex gap-2">
          {[['', 'Todos'], ['PJ', 'Pessoa Jurídica'], ['PF', 'Pessoa Física']].map(([val, label]) => (
            <button
              key={val}
              onClick={() => { setFilterType(val); setPage(1); }}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterType === val
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
          <div className="p-4"><TableSkeleton rows={8} cols={5} /></div>
        ) : customers.length === 0 ? (
          <div className="text-center py-16 text-text-secondary">
            <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Nenhum cliente encontrado</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">Cliente</th>
                <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">Tipo</th>
                <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">Contato</th>
                <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">Localização</th>
                <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-6 py-3">Status</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        c.customer_type === 'PJ' ? 'bg-blue-100' : 'bg-purple-100'
                      }`}>
                        {c.customer_type === 'PJ'
                          ? <Building2 className="w-4 h-4 text-blue-600" />
                          : <User className="w-4 h-4 text-purple-600" />
                        }
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text-primary">{displayName(c)}</p>
                        {c.trading_name && <p className="text-xs text-text-secondary">{c.trading_name}</p>}
                        {c.document && <p className="text-xs text-text-secondary">{c.document}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      c.customer_type === 'PJ' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                    }`}>
                      {c.customer_type === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}
                    </span>
                    {c.segment && (
                      <p className="text-xs text-text-secondary mt-1">{segmentLabels[c.segment] || c.segment}</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {c.email && (
                      <div className="flex items-center gap-1 text-xs text-text-secondary mb-1">
                        <Mail className="w-3 h-3" />{c.email}
                      </div>
                    )}
                    {c.phone && (
                      <div className="flex items-center gap-1 text-xs text-text-secondary">
                        <Phone className="w-3 h-3" />{c.phone}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {(c.city || c.state) && (
                      <div className="flex items-center gap-1 text-xs text-text-secondary">
                        <MapPin className="w-3 h-3" />
                        {[c.city, c.state].filter(Boolean).join(' — ')}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      c.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {c.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEdit(c)}
                        className="p-1.5 text-gray-400 hover:text-accent-gold transition-colors"
                        title="Editar"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(c)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                        title="Remover"
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

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-text-primary">
                {editTarget ? 'Editar Cliente' : 'Novo Cliente'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Tipo *</label>
                <div className="flex gap-3">
                  {[['PJ', 'Pessoa Jurídica'], ['PF', 'Pessoa Física']].map(([val, label]) => (
                    <label key={val} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="customer_type"
                        value={val}
                        checked={formData.customer_type === val}
                        onChange={(e) => setFormData({ ...formData, customer_type: e.target.value })}
                        className="text-accent-gold"
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {formData.customer_type === 'PJ' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">Razão Social *</label>
                    <input
                      type="text" required
                      value={formData.company_name}
                      onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">Nome Fantasia</label>
                    <input
                      type="text"
                      value={formData.trading_name}
                      onChange={(e) => setFormData({ ...formData, trading_name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Nome Completo *</label>
                  <input
                    type="text" required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    {formData.customer_type === 'PJ' ? 'CNPJ' : 'CPF'}
                  </label>
                  <input
                    type="text"
                    value={formData.document}
                    onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Segmento</label>
                  <select
                    value={formData.segment}
                    onChange={(e) => setFormData({ ...formData, segment: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold bg-white"
                  >
                    <option value="">Selecione</option>
                    {Object.entries(segmentLabels).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Telefone</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Cidade</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Estado</label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="SP"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60"
                >
                  {saving ? 'Salvando...' : editTarget ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remover Cliente"
        description={`Tem certeza que deseja remover "${deleteTarget?.company_name || deleteTarget?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel={deleting ? 'Removendo...' : 'Remover'}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
