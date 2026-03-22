'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, Search, Building2, User, Trash2, Edit, X, Phone, Mail, MapPin } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton, CardSkeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
import api, { ApiError } from '@/lib/api';
import { useDebouncedValue, usePagination } from '@/lib/hooks';
import { Sensitive } from '@/components/ui/Sensitive';
import { useDemoMode } from '@/components/ui/DemoContext';
import FocusTrap from '@/components/ui/FocusTrap';
import { FormField } from '@/components/ui/FormField';

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
  startup: 'Startup',
  mid_size: 'Média Empresa',
  enterprise: 'Enterprise',
  government: 'Governo',
  other: 'Outro',
};

export default function ClientesPage() {
  const toast = useToast();
  const { isDemoMode } = useDemoMode();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput);
  const [filterType, setFilterType] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const isDirty = useMemo(() => {
    if (editTarget) {
      return formData.company_name !== (editTarget.company_name || '') ||
        formData.name !== (editTarget.name || '') ||
        formData.email !== (editTarget.email || '') ||
        formData.trading_name !== (editTarget.trading_name || '') ||
        formData.document !== (editTarget.document || '') ||
        formData.phone !== (editTarget.phone || '') ||
        formData.city !== (editTarget.city || '') ||
        formData.state !== (editTarget.state || '') ||
        formData.segment !== (editTarget.segment || '') ||
        formData.customer_type !== editTarget.customer_type;
    }
    return formData.company_name !== '' || formData.name !== '' || formData.email !== '';
  }, [formData, editTarget]);

  const handleCloseModal = useCallback(() => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      setShowModal(false);
    }
  }, [isDirty]);

  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const validateField = (field: string, value: string) => {
    let error = '';
    switch (field) {
      case 'company_name':
        if (formData.customer_type === 'PJ' && !value.trim()) error = 'Nome é obrigatório';
        break;
      case 'name':
        if (formData.customer_type === 'PF' && !value.trim()) error = 'Nome é obrigatório';
        break;
      case 'email':
        if (!value.trim()) error = 'Email é obrigatório';
        else if (!isValidEmail(value)) error = 'Formato de email inválido';
        break;
    }
    setErrors(prev => ({ ...prev, [field]: error }));
    return error;
  };

  const validateAll = () => {
    const nameField = formData.customer_type === 'PJ' ? 'company_name' : 'name';
    const nameValue = formData.customer_type === 'PJ' ? formData.company_name : formData.name;
    const e1 = validateField(nameField, nameValue);
    const e2 = validateField('email', formData.email);
    return !e1 && !e2;
  };

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), page_size: String(PAGE_SIZE) };
      if (search) params.search = search;
      if (filterType) params.customer_type = filterType;
      const data = await api.get<{ results: Customer[]; count: number }>('/sales/customers/', params);
      setCustomers(data.results || data);
      setTotal(data.count ?? (data.results || data).length);
    } catch {
      toast.error('Erro ao carregar clientes.');
    } finally {
      setLoading(false);
    }
  }, [page, search, filterType]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  useEffect(() => { setPage(1); }, [search]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const totalPJ = customers.filter(c => c.customer_type === 'PJ').length;
  const totalPF = customers.filter(c => c.customer_type === 'PF').length;
  const totalActive = customers.filter(c => c.is_active).length;

  const openCreate = () => {
    setEditTarget(null);
    setFormData({ ...EMPTY_FORM });
    setErrors({});
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
    setErrors({});
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAll()) return;
    setSaving(true);
    try {
      const body = Object.fromEntries(
        Object.entries(formData).filter(([, v]) => v !== '')
      );
      if (editTarget) {
        await api.patch(`/sales/customers/${editTarget.id}/`, body);
      } else {
        await api.post('/sales/customers/', body);
      }
      toast.success(editTarget ? 'Cliente atualizado!' : 'Cliente criado com sucesso!');
      setShowModal(false);
      fetchCustomers();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Erro ao salvar cliente.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/sales/customers/${deleteTarget.id}/`);
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
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Clientes</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Cadastro e gestão de clientes</p>
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
            <div className="card card-hover p-5">
              <p className="text-gray-500 dark:text-gray-400 text-sm">Total</p>
              <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mt-1"><Sensitive>{total}</Sensitive></p>
            </div>
            <div className="card card-hover p-5">
              <p className="text-gray-500 dark:text-gray-400 text-sm">Ativos</p>
              <p className="text-2xl font-semibold text-green-600 mt-1"><Sensitive>{totalActive}</Sensitive></p>
            </div>
            <div className="card card-hover p-5">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="w-4 h-4 text-blue-500" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">Pessoas Jurídicas</p>
              </div>
              <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100"><Sensitive>{totalPJ}</Sensitive></p>
            </div>
            <div className="card card-hover p-5">
              <div className="flex items-center gap-2 mb-1">
                <User className="w-4 h-4 text-purple-500" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">Pessoas Físicas</p>
              </div>
              <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100"><Sensitive>{totalPF}</Sensitive></p>
            </div>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder="Buscar por nome, empresa, documento..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold text-sm"
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
          <div className="p-4"><TableSkeleton rows={8} cols={5} /></div>
        ) : customers.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-500" />
            <p>Nenhum cliente encontrado</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700">
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">Cliente</th>
                <th className="hidden md:table-cell text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">Tipo</th>
                <th className="hidden md:table-cell text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">Contato</th>
                <th className="hidden md:table-cell text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">Localização</th>
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-6 py-3">Status</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        c.customer_type === 'PJ' ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-purple-100 dark:bg-purple-900/40'
                      }`}>
                        {c.customer_type === 'PJ'
                          ? <Building2 className="w-4 h-4 text-blue-600" />
                          : <User className="w-4 h-4 text-purple-600" />
                        }
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100"><Sensitive>{displayName(c)}</Sensitive></p>
                        {c.trading_name && <p className="text-xs text-gray-500 dark:text-gray-400"><Sensitive>{c.trading_name}</Sensitive></p>}
                        {c.document && <p className="text-xs text-gray-500 dark:text-gray-400"><Sensitive>{c.document}</Sensitive></p>}
                      </div>
                    </div>
                  </td>
                  <td className="hidden md:table-cell px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      c.customer_type === 'PJ' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800' : 'bg-purple-100 dark:bg-purple-900/40 text-purple-800'
                    }`}>
                      {c.customer_type === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}
                    </span>
                    {c.segment && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{segmentLabels[c.segment] || c.segment}</p>
                    )}
                  </td>
                  <td className="hidden md:table-cell px-6 py-4">
                    {c.email && (
                      <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-1">
                        <Mail className="w-3 h-3" /><Sensitive>{c.email}</Sensitive>
                      </div>
                    )}
                    {c.phone && (
                      <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <Phone className="w-3 h-3" /><Sensitive>{c.phone}</Sensitive>
                      </div>
                    )}
                  </td>
                  <td className="hidden md:table-cell px-6 py-4">
                    {(c.city || c.state) && (
                      <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <MapPin className="w-3 h-3" />
                        <Sensitive>{[c.city, c.state].filter(Boolean).join(' — ')}</Sensitive>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      c.is_active ? 'bg-green-100 dark:bg-green-900/40 text-green-800' : 'bg-gray-100 dark:bg-gray-700 text-gray-600'
                    }`}>
                      {c.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEdit(c)}
                        className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-accent-gold transition-colors"
                        title="Editar"
                        aria-label="Editar"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(c)}
                        className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors"
                        title="Remover"
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

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <FocusTrap onClose={handleCloseModal}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto shadow-modal animate-modal-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {editTarget ? 'Editar Cliente' : 'Novo Cliente'}
              </h2>
              <button onClick={handleCloseModal} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" aria-label="Fechar">
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Tipo *</label>
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
                  <FormField label="Razão Social" required error={errors.company_name}>
                    {(props) => (
                      <input
                        type="text" {...props}
                        value={formData.company_name}
                        onChange={(e) => { setFormData({ ...formData, company_name: e.target.value }); setErrors(prev => ({ ...prev, company_name: '' })); }}
                        onBlur={() => validateField('company_name', formData.company_name)}
                        className={`w-full input-field ${isDemoMode ? 'sensitive-blur' : ''}`}
                      />
                    )}
                  </FormField>
                  <FormField label="Nome Fantasia">
                    {(props) => (
                      <input
                        type="text" {...props}
                        value={formData.trading_name}
                        onChange={(e) => setFormData({ ...formData, trading_name: e.target.value })}
                        className={`w-full input-field ${isDemoMode ? 'sensitive-blur' : ''}`}
                      />
                    )}
                  </FormField>
                </>
              ) : (
                <FormField label="Nome Completo" required error={errors.name}>
                  {(props) => (
                    <input
                      type="text" {...props}
                      value={formData.name}
                      onChange={(e) => { setFormData({ ...formData, name: e.target.value }); setErrors(prev => ({ ...prev, name: '' })); }}
                      onBlur={() => validateField('name', formData.name)}
                      className={`w-full input-field ${isDemoMode ? 'sensitive-blur' : ''}`}
                    />
                  )}
                </FormField>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    {formData.customer_type === 'PJ' ? 'CNPJ' : 'CPF'}
                  </label>
                  <input
                    type="text"
                    value={formData.document}
                    onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                    className={`w-full input-field ${isDemoMode ? 'sensitive-blur' : ''}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Segmento</label>
                  <select
                    value={formData.segment}
                    onChange={(e) => setFormData({ ...formData, segment: e.target.value })}
                    className="w-full input-field bg-white dark:bg-gray-800"
                  >
                    <option value="">Selecione</option>
                    {Object.entries(segmentLabels).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Email" required error={errors.email}>
                  {(props) => (
                    <input
                      type="email" {...props}
                      value={formData.email}
                      onChange={(e) => { setFormData({ ...formData, email: e.target.value }); setErrors(prev => ({ ...prev, email: '' })); }}
                      onBlur={() => validateField('email', formData.email)}
                      className={`w-full input-field ${isDemoMode ? 'sensitive-blur' : ''}`}
                    />
                  )}
                </FormField>
                <FormField label="Telefone">
                  {(props) => (
                    <input
                      type="text" {...props}
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className={`w-full input-field ${isDemoMode ? 'sensitive-blur' : ''}`}
                    />
                  )}
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Cidade</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className={`w-full input-field ${isDemoMode ? 'sensitive-blur' : ''}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Estado</label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="SP"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                    className={`w-full input-field ${isDemoMode ? 'sensitive-blur' : ''}`}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
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
          </FocusTrap>
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

      <ConfirmDialog
        open={showDiscardConfirm}
        title="Descartar alterações?"
        description="Você tem alterações não salvas. Deseja descartá-las?"
        confirmLabel="Descartar"
        danger
        onConfirm={() => {
          setShowDiscardConfirm(false);
          setShowModal(false);
          setFormData({ ...EMPTY_FORM });
          setEditTarget(null);
        }}
        onCancel={() => setShowDiscardConfirm(false)}
      />
    </div>
  );
}
