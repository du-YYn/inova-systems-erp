'use client';

import { useEffect, useState, useCallback } from 'react';
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
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

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
  { value: 'admin', label: 'Administrador', icon: ShieldCheck, color: 'text-purple-600 bg-purple-100' },
  { value: 'manager', label: 'Gerente', icon: Shield, color: 'text-blue-600 bg-blue-100' },
  { value: 'operator', label: 'Operador', icon: UserCog, color: 'text-green-600 bg-green-100' },
  { value: 'viewer', label: 'Visualizador', icon: Eye, color: 'text-gray-600 bg-gray-100' },
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

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
  const getHeaders = () => ({ 'Content-Type': 'application/json' });

  // ── Data fetch ────────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/accounts/users/`, { headers: getHeaders(), credentials: 'include' });
      if (!res.ok) throw new Error();
      const data = await res.json();
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
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser && form.password !== form.password_confirm) {
      toast.error('As senhas não conferem.');
      return;
    }
    setSaving(true);
    try {
      let res: Response;
      if (editingUser) {
        // PATCH — only send changed fields, never send empty password
        const payload: Record<string, unknown> = {
          username: form.username,
          email: form.email,
          first_name: form.first_name,
          last_name: form.last_name,
          phone: form.phone,
          role: form.role,
          is_active: form.is_active,
        };
        res = await fetch(`${apiUrl}/accounts/users/${editingUser.id}/`, {
          method: 'PATCH', headers: getHeaders(), credentials: 'include',
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${apiUrl}/accounts/users/`, {
          method: 'POST', headers: getHeaders(), credentials: 'include',
          body: JSON.stringify({
            username: form.username, email: form.email,
            first_name: form.first_name, last_name: form.last_name,
            phone: form.phone, role: form.role,
            password: form.password, password_confirm: form.password_confirm,
          }),
        });
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = Object.values(err).flat().join(' ') || 'Erro ao salvar usuário.';
        toast.error(msg as string);
        return;
      }
      toast.success(editingUser ? 'Usuário atualizado!' : 'Usuário criado!');
      setShowModal(false);
      fetchUsers();
    } catch {
      toast.error('Erro ao salvar usuário.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      const res = await fetch(`${apiUrl}/accounts/users/${confirmDelete.id}/`, {
        method: 'DELETE', credentials: 'include',
      });
      if (res.status === 400) {
        const err = await res.json();
        toast.error(err.error || 'Não é possível remover este usuário.');
        return;
      }
      toast.success('Usuário removido.');
      setConfirmDelete(null);
      fetchUsers();
    } catch {
      toast.error('Erro ao remover usuário.');
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
          <h1 className="text-2xl font-semibold text-gray-900">Gestão de Usuários</h1>
          <p className="text-gray-500 mt-1">Gerencie acessos e permissões do sistema</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-[#A6864A] text-white rounded-lg hover:bg-[#8a6e3c] transition-colors">
          <Plus className="w-5 h-5" /> Novo Usuário
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total de Usuários', value: stats.total, icon: Users, color: 'bg-blue-50 text-blue-600' },
          { label: 'Usuários Ativos', value: stats.active, icon: CheckCircle, color: 'bg-green-50 text-green-600' },
          { label: 'Administradores', value: stats.admins, icon: ShieldCheck, color: 'bg-purple-50 text-purple-600' },
          { label: 'Com 2FA Ativo', value: stats.with2fa, icon: Shield, color: 'bg-orange-50 text-orange-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white p-5 rounded-lg border border-gray-100">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-gray-500 text-sm">{label}</p>
            <p className="text-2xl font-semibold text-gray-900 mt-0.5">{loading ? '—' : value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Buscar por nome, email ou username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A6864A]/30 focus:border-[#A6864A] text-sm"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A6864A]/30 focus:border-[#A6864A] bg-white text-sm"
        >
          <option value="all">Todos os perfis</option>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <Users className="w-12 h-12 mb-3 opacity-30" />
            <p className="font-medium">{search || roleFilter !== 'all' ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Usuário</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Perfil</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Email</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">Cadastro</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((user) => {
                const roleInfo = getRoleInfo(user.role);
                const RoleIcon = roleInfo.icon;
                const initials = user.full_name
                  ? user.full_name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
                  : user.username.slice(0, 2).toUpperCase();
                return (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-[#A6864A]/10 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-semibold text-[#A6864A]">{initials}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{user.full_name || user.username}</p>
                          <p className="text-xs text-gray-500">@{user.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${roleInfo.color}`}>
                        <RoleIcon className="w-3.5 h-3.5" />
                        {roleInfo.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      <span className="text-sm text-gray-500">{user.email || '—'}</span>
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell">
                      <span className="text-sm text-gray-500">{formatDate(user.created_at)}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {user.is_active ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3" /> Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            <XCircle className="w-3 h-3" /> Inativo
                          </span>
                        )}
                        {user.is_2fa_enabled && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">2FA</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(user)}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-900">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setConfirmDelete(user)}
                          className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-gray-500 hover:text-red-600">
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
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-modal animate-modal-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Nome</label>
                  <input type="text" value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Sobrenome</label>
                  <input type="text" value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    className="input-field" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Username *</label>
                <input type="text" required value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Email *</label>
                <input type="email" required value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Telefone</label>
                <input type="tel" value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+55 (11) 99999-9999"
                  className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Perfil *</label>
                <select value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A6864A]/30 focus:border-[#A6864A] bg-white text-sm">
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              {editingUser && (
                <div className="flex items-center gap-3 py-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-[#A6864A] focus:ring-[#A6864A]" />
                    <span className="text-sm font-medium text-gray-500">Usuário ativo</span>
                  </label>
                </div>
              )}
              {!editingUser && (
                <>
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Senha de acesso</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Senha *</label>
                    <input type="password" required minLength={8} value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Confirmar Senha *</label>
                    <input type="password" required minLength={8} value={form.password_confirm}
                      onChange={(e) => setForm({ ...form, password_confirm: e.target.value })}
                      className="input-field" />
                  </div>
                </>
              )}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2 bg-[#A6864A] text-white rounded-lg hover:bg-[#8a6e3c] transition-colors disabled:opacity-60">
                  {saving ? 'Salvando...' : editingUser ? 'Atualizar' : 'Criar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Remover Usuário"
        description={`Deseja remover o usuário "${confirmDelete?.full_name || confirmDelete?.username}"? Esta ação não pode ser desfeita.`}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
