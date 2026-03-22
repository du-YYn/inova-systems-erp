'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  X,
  ShieldCheck,
  Shield,
  Eye,
  UserCog,
  Search,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { CardSkeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import FocusTrap from '@/components/ui/FocusTrap';
import { FormField } from '@/components/ui/FormField';
import api, { ApiError } from '@/lib/api';
import { Sensitive } from '@/components/ui/Sensitive';

// ─── Types ────────────────────────────────────────────────────────────────────

interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: 'admin' | 'manager' | 'operator' | 'viewer';
  is_active: boolean;
  is_2fa_enabled: boolean;
  phone: string;
  created_at: string;
}

const ROLES = [
  { value: 'admin', label: 'Administrador', icon: ShieldCheck, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/40' },
  { value: 'manager', label: 'Gerente', icon: Shield, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/40' },
  { value: 'operator', label: 'Operador', icon: UserCog, color: 'text-green-600 bg-green-100 dark:bg-green-900/40' },
  { value: 'viewer', label: 'Visualizador', icon: Eye, color: 'text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700' },
];

const getRoleInfo = (role: string) => ROLES.find(r => r.value === role) ?? ROLES[2];

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

const EMPTY_FORM = {
  username: '', email: '', first_name: '', last_name: '',
  phone: '', role: 'operator', password: '', password_confirm: '', is_active: true,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function UsuariosPage() {
  const toast = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const isDirty = useMemo(() => {
    if (editingUser) {
      return form.username !== editingUser.username ||
        form.email !== editingUser.email ||
        form.first_name !== editingUser.first_name ||
        form.last_name !== editingUser.last_name ||
        form.phone !== (editingUser.phone || '') ||
        form.role !== editingUser.role ||
        form.is_active !== editingUser.is_active;
    }
    return form.username !== '' || form.email !== '';
  }, [form, editingUser]);

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
      case 'username':
        if (!value.trim()) error = 'Username é obrigatório';
        break;
      case 'email':
        if (!value.trim()) error = 'Email é obrigatório';
        else if (!isValidEmail(value)) error = 'Formato de email inválido';
        break;
      case 'role':
        if (!value) error = 'Perfil é obrigatório';
        break;
      case 'password':
        if (!editingUser) {
          if (!value) error = 'Senha é obrigatória';
          else if (value.length < 8) error = 'Senha deve ter no mínimo 8 caracteres';
        }
        break;
      case 'password_confirm':
        if (!editingUser && value !== form.password) error = 'As senhas não conferem';
        break;
    }
    setErrors(prev => ({ ...prev, [field]: error }));
    return error;
  };

  const validateAll = () => {
    const e1 = validateField('username', form.username);
    const e2 = validateField('email', form.email);
    const e3 = validateField('role', form.role);
    const e4 = !editingUser ? validateField('password', form.password) : '';
    const e5 = !editingUser ? validateField('password_confirm', form.password_confirm) : '';
    return !e1 && !e2 && !e3 && !e4 && !e5;
  };

  // ── Data fetch ────────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ results: User[] }>('/accounts/users/');
      setUsers(data.results || data);
    } catch {
      toast.error('Erro ao carregar usuários.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const openNew = () => {
    setEditingUser(null);
    setForm({ ...EMPTY_FORM });
    setErrors({});
    setShowModal(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setForm({
      username: user.username,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone || '',
      role: user.role,
      password: '',
      password_confirm: '',
      is_active: user.is_active,
    });
    setErrors({});
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateAll()) return;
    setSaving(true);
    try {
      if (editingUser) {
        const payload: Record<string, unknown> = {
          username: form.username,
          email: form.email,
          first_name: form.first_name,
          last_name: form.last_name,
          phone: form.phone,
          role: form.role,
          is_active: form.is_active,
        };
        await api.patch(`/accounts/users/${editingUser.id}/`, payload);
      } else {
        await api.post('/accounts/users/', {
          username: form.username, email: form.email,
          first_name: form.first_name, last_name: form.last_name,
          phone: form.phone, role: form.role,
          password: form.password, password_confirm: form.password_confirm,
        });
      }
      toast.success(editingUser ? 'Usuário atualizado!' : 'Usuário criado!');
      setShowModal(false);
      fetchUsers();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Erro ao salvar usuário.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/accounts/users/${confirmDelete.id}/`);
      toast.success('Usuário removido.');
      setConfirmDelete(null);
      fetchUsers();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Erro ao remover usuário.';
      toast.error(message);
    }
  };

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.username.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  // ── Stats ────────────────────────────────────────────────────────────────

  const stats = {
    total: users.length,
    active: users.filter(u => u.is_active).length,
    admins: users.filter(u => u.role === 'admin').length,
    with2fa: users.filter(u => u.is_2fa_enabled).length,
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Gestão de Usuários</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Gerencie acessos e permissões do sistema</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors">
          <Plus className="w-5 h-5" /> Novo Usuário
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {loading ? Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />) : [
          { label: 'Total de Usuários', value: stats.total, icon: Users, color: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600' },
          { label: 'Usuários Ativos', value: stats.active, icon: CheckCircle, color: 'bg-green-50 dark:bg-green-900/30 text-green-600' },
          { label: 'Administradores', value: stats.admins, icon: ShieldCheck, color: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600' },
          { label: 'Com 2FA Ativo', value: stats.with2fa, icon: Shield, color: 'bg-orange-50 dark:bg-orange-900/30 text-orange-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card card-hover p-5">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{label}</p>
            <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mt-0.5"><Sensitive>{value}</Sensitive></p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 dark:text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome, email ou username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold text-sm"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold bg-white dark:bg-gray-800 text-sm"
        >
          <option value="all">Todos os perfis</option>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-4"><TableSkeleton rows={6} cols={5} /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500 dark:text-gray-400">
            <Users className="w-12 h-12 mb-3 opacity-30" />
            <p className="font-medium">{search || roleFilter !== 'all' ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Usuário</th>
                <th className="hidden md:table-cell text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Perfil</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden md:table-cell">Email</th>
                <th className="hidden md:table-cell text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cadastro</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {filtered.map((user) => {
                const roleInfo = getRoleInfo(user.role);
                const RoleIcon = roleInfo.icon;
                const initials = user.full_name
                  ? user.full_name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
                  : user.username.slice(0, 2).toUpperCase();
                return (
                  <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-accent-gold/10 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-semibold text-accent-gold">{initials}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100"><Sensitive>{user.full_name || user.username}</Sensitive></p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">@<Sensitive>{user.username}</Sensitive></p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden md:table-cell py-3 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${roleInfo.color}`}>
                        <RoleIcon className="w-3.5 h-3.5" />
                        {roleInfo.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      <span className="text-sm text-gray-500 dark:text-gray-400"><Sensitive>{user.email || '—'}</Sensitive></span>
                    </td>
                    <td className="hidden md:table-cell py-3 px-4">
                      <span className="text-sm text-gray-500 dark:text-gray-400">{formatDate(user.created_at)}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {user.is_active ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-800">
                            <CheckCircle className="w-3 h-3" /> Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600">
                            <XCircle className="w-3 h-3" /> Inativo
                          </span>
                        )}
                        {user.is_2fa_enabled && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-900/40 text-orange-800">2FA</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(user)}
                          aria-label="Editar"
                          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-500 dark:text-gray-400 hover:text-gray-900">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setConfirmDelete(user)}
                          aria-label="Excluir"
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-500 dark:text-gray-400 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <FocusTrap onClose={handleCloseModal}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-modal animate-modal-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
              </h2>
              <button onClick={handleCloseModal} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" aria-label="Fechar">
                <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Nome">
                  {(props) => (
                    <input type="text" {...props} value={form.first_name}
                      onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                      className="input-field" />
                  )}
                </FormField>
                <FormField label="Sobrenome">
                  {(props) => (
                    <input type="text" {...props} value={form.last_name}
                      onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                      className="input-field" />
                  )}
                </FormField>
              </div>
              <FormField label="Username" required error={errors.username}>
                {(props) => (
                  <input type="text" {...props} value={form.username}
                    onChange={(e) => { setForm({ ...form, username: e.target.value }); setErrors(prev => ({ ...prev, username: '' })); }}
                    onBlur={() => validateField('username', form.username)}
                    className="input-field" />
                )}
              </FormField>
              <FormField label="Email" required error={errors.email}>
                {(props) => (
                  <input type="email" {...props} value={form.email}
                    onChange={(e) => { setForm({ ...form, email: e.target.value }); setErrors(prev => ({ ...prev, email: '' })); }}
                    onBlur={() => validateField('email', form.email)}
                    className="input-field" />
                )}
              </FormField>
              <FormField label="Telefone">
                {(props) => (
                  <input type="tel" {...props} value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+55 (11) 99999-9999"
                    className="input-field" />
                )}
              </FormField>
              <FormField label="Perfil" required error={errors.role}>
                {(props) => (
                  <select {...props} value={form.role}
                    onChange={(e) => { setForm({ ...form, role: e.target.value }); setErrors(prev => ({ ...prev, role: '' })); }}
                    onBlur={() => validateField('role', form.role)}
                    className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold bg-white dark:bg-gray-800 text-sm">
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                )}
              </FormField>
              {editingUser && (
                <div className="flex items-center gap-3 py-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-accent-gold focus:ring-accent-gold" />
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Usuário ativo</span>
                  </label>
                </div>
              )}
              {!editingUser && (
                <>
                  <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Senha de acesso</p>
                  </div>
                  <FormField label="Senha" required error={errors.password}>
                    {(props) => (
                      <input type="password" {...props} value={form.password}
                        onChange={(e) => { setForm({ ...form, password: e.target.value }); setErrors(prev => ({ ...prev, password: '' })); }}
                        onBlur={() => validateField('password', form.password)}
                        className="input-field" />
                    )}
                  </FormField>
                  <FormField label="Confirmar Senha" required error={errors.password_confirm}>
                    {(props) => (
                      <input type="password" {...props} value={form.password_confirm}
                        onChange={(e) => { setForm({ ...form, password_confirm: e.target.value }); setErrors(prev => ({ ...prev, password_confirm: '' })); }}
                        onBlur={() => validateField('password_confirm', form.password_confirm)}
                        className="input-field" />
                    )}
                  </FormField>
                </>
              )}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60">
                  {saving ? 'Salvando...' : editingUser ? 'Atualizar' : 'Criar Usuário'}
                </button>
              </div>
            </form>
          </div>
          </FocusTrap>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Remover Usuário"
        description={`Deseja remover o usuário "${confirmDelete?.full_name || confirmDelete?.username}"? Esta ação não pode ser desfeita.`}
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
          setForm({ ...EMPTY_FORM });
          setEditingUser(null);
        }}
        onCancel={() => setShowDiscardConfirm(false)}
      />
    </div>
  );
}
