'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, X, Search, Package, Repeat, Clock } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import FocusTrap from '@/components/ui/FocusTrap';
import { FormField } from '@/components/ui/FormField';
import api, { ApiError } from '@/lib/api';

interface Service {
  id: number;
  code: string;
  name: string;
  description: string;
  default_recurrence: 'one_time' | 'monthly';
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface ApiListResponse<T> {
  results: T[];
}

const EMPTY_FORM = {
  code: '',
  name: '',
  description: '',
  default_recurrence: 'one_time' as 'one_time' | 'monthly',
  is_active: true,
  display_order: 0,
};

const slugify = (text: string) =>
  text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);

export default function CatalogoPage() {
  const toast = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Service | null>(null);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [codeTouched, setCodeTouched] = useState(false);

  useEffect(() => {
    try {
      const userData = localStorage.getItem('user');
      if (userData) {
        const parsed = JSON.parse(userData);
        setIsAdmin(parsed?.role === 'admin');
      }
    } catch {
      setIsAdmin(false);
    }
  }, []);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (showInactive) params.include_inactive = '1';
      if (search) params.search = search;
      const data = await api.get<Service[] | ApiListResponse<Service>>(
        '/sales/services/',
        params,
      );
      const list = Array.isArray(data) ? data : (data.results ?? []);
      setServices(list);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao carregar serviços');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, showInactive]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, display_order: services.length + 1 });
    setCodeTouched(false);
    setShowModal(true);
  };

  const openEdit = (service: Service) => {
    setEditing(service);
    setForm({
      code: service.code,
      name: service.name,
      description: service.description,
      default_recurrence: service.default_recurrence,
      is_active: service.is_active,
      display_order: service.display_order,
    });
    setCodeTouched(true);
    setShowModal(true);
  };

  const handleNameChange = (value: string) => {
    setForm(prev => ({
      ...prev,
      name: value,
      code: codeTouched || editing ? prev.code : slugify(value),
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    if (!form.code.trim()) {
      toast.error('Código é obrigatório');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/sales/services/${editing.id}/`, form);
        toast.success('Serviço atualizado');
      } else {
        await api.post('/sales/services/', form);
        toast.success('Serviço criado');
      }
      setShowModal(false);
      fetchServices();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/sales/services/${confirmDelete.id}/`);
      toast.success('Serviço removido');
      setConfirmDelete(null);
      fetchServices();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao remover');
    }
  };

  const filtered = services.filter(s =>
    !search ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Package className="w-6 h-6 text-accent-gold" />
            Catálogo de Serviços
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Serviços disponíveis para seleção em propostas e contratos.
            {!isAdmin && ' (Somente administradores podem adicionar ou editar.)'}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-accent-gold hover:bg-accent-gold/90 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Novo Serviço
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-card p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou código…"
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-accent-gold/40 focus:border-accent-gold outline-none"
          />
        </div>
        {isAdmin && (
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
              className="rounded border-gray-300 text-accent-gold focus:ring-accent-gold/40"
            />
            Mostrar inativos
          </label>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-card overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} />
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhum serviço encontrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Nome</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Código</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Recorrência</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Status</th>
                  {isAdmin && <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filtered.map(service => (
                  <tr key={service.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 ${!service.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800 dark:text-gray-100">{service.name}</div>
                      {service.description && (
                        <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{service.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{service.code}</td>
                    <td className="px-4 py-3">
                      {service.default_recurrence === 'monthly' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                          <Repeat className="w-3 h-3" /> Mensal
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                          <Clock className="w-3 h-3" /> Única
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {service.is_active ? (
                        <span className="text-xs font-medium text-green-700 dark:text-green-400">Ativo</span>
                      ) : (
                        <span className="text-xs font-medium text-gray-400">Inativo</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(service)}
                            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                            title="Editar"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(service)}
                            className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/40 text-red-500"
                            title="Remover"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <FocusTrap onClose={() => setShowModal(false)}>
            <div
              className="bg-white dark:bg-gray-800 rounded-xl shadow-modal w-full max-w-md animate-modal-in"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {editing ? 'Editar Serviço' : 'Novo Serviço'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <FormField label="Nome" required>
                  {({ id, 'aria-invalid': ai }) => (
                    <input
                      id={id}
                      aria-invalid={ai}
                      type="text"
                      value={form.name}
                      onChange={e => handleNameChange(e.target.value)}
                      placeholder="Ex: Sistema Web"
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-accent-gold/40 focus:border-accent-gold outline-none"
                    />
                  )}
                </FormField>
                <FormField
                  label="Código"
                  required
                  helperText="Identificador único. Preserve o valor ao editar para não quebrar referências."
                >
                  {({ id }) => (
                    <input
                      id={id}
                      type="text"
                      value={form.code}
                      onChange={e => { setForm(prev => ({ ...prev, code: slugify(e.target.value) })); setCodeTouched(true); }}
                      placeholder="ex: software_dev"
                      disabled={!!editing}
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg font-mono disabled:opacity-60 focus:ring-2 focus:ring-accent-gold/40 focus:border-accent-gold outline-none"
                    />
                  )}
                </FormField>
                <FormField label="Descrição">
                  {({ id }) => (
                    <textarea
                      id={id}
                      value={form.description}
                      onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Breve descrição do serviço…"
                      rows={2}
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-accent-gold/40 focus:border-accent-gold outline-none resize-none"
                    />
                  )}
                </FormField>
                <FormField label="Recorrência padrão">
                  {({ id }) => (
                    <select
                      id={id}
                      value={form.default_recurrence}
                      onChange={e => setForm(prev => ({ ...prev, default_recurrence: e.target.value as 'one_time' | 'monthly' }))}
                      className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-accent-gold/40 focus:border-accent-gold outline-none"
                    >
                      <option value="one_time">Pagamento Único</option>
                      <option value="monthly">Mensal</option>
                    </select>
                  )}
                </FormField>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Ordem">
                    {({ id }) => (
                      <input
                        id={id}
                        type="number"
                        value={form.display_order}
                        onChange={e => setForm(prev => ({ ...prev, display_order: Number(e.target.value) }))}
                        className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-accent-gold/40 focus:border-accent-gold outline-none"
                      />
                    )}
                  </FormField>
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={e => setForm(prev => ({ ...prev, is_active: e.target.checked }))}
                        className="rounded border-gray-300 text-accent-gold focus:ring-accent-gold/40"
                      />
                      Ativo
                    </label>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-gray-700">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium bg-accent-gold hover:bg-accent-gold/90 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </div>
          </FocusTrap>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Remover serviço?"
        description={
          confirmDelete
            ? `"${confirmDelete.name}" será removido. Se já estiver em uso em propostas ou contratos, será apenas desativado.`
            : ''
        }
        confirmLabel="Remover"
        danger
      />
    </div>
  );
}
