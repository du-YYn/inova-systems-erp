'use client';

import { useEffect, useState } from 'react';
import { UserCircle, Lock, Shield, Save, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface UserProfile {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_2fa_enabled: boolean;
  date_joined: string;
}

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  operator: 'Operador',
  viewer: 'Visualizador',
};

type Tab = 'profile' | 'password' | 'security';

export default function PerfilPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [profileForm, setProfileForm] = useState({ first_name: '', last_name: '', email: '' });
  const [savingProfile, setSavingProfile] = useState(false);

  // Password form
  const [passwordForm, setPasswordForm] = useState({ old_password: '', new_password: '', confirm_password: '' });
  const [savingPassword, setSavingPassword] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
  const headers = { 'Content-Type': 'application/json' };

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch(`${apiUrl}/accounts/profile/`, { headers, credentials: 'include' });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setProfile(data);
        setProfileForm({ first_name: data.first_name || '', last_name: data.last_name || '', email: data.email || '' });
      } catch {
        toast.error('Erro ao carregar perfil.');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await fetch(`${apiUrl}/accounts/profile/`, {
        method: 'PATCH', headers, credentials: 'include', body: JSON.stringify(profileForm),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setProfile(data);
      toast.success('Perfil atualizado com sucesso!');
    } catch {
      toast.error('Erro ao salvar perfil.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error('A nova senha e a confirmação não coincidem.');
      return;
    }
    if (passwordForm.new_password.length < 8) {
      toast.error('A nova senha deve ter ao menos 8 caracteres.');
      return;
    }
    setSavingPassword(true);
    try {
      const res = await fetch(`${apiUrl}/accounts/change-password/`, {
        method: 'POST', headers, credentials: 'include',
        body: JSON.stringify({ old_password: passwordForm.old_password, new_password: passwordForm.new_password }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.detail || 'Erro');
      }
      toast.success('Senha alterada com sucesso!');
      setPasswordForm({ old_password: '', new_password: '', confirm_password: '' });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao alterar senha.');
    } finally {
      setSavingPassword(false);
    }
  };

  const tabs = [
    { key: 'profile' as Tab, label: 'Dados Pessoais', icon: <UserCircle className="w-4 h-4" /> },
    { key: 'password' as Tab, label: 'Alterar Senha', icon: <Lock className="w-4 h-4" /> },
    { key: 'security' as Tab, label: 'Segurança', icon: <Shield className="w-4 h-4" /> },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Meu Perfil</h1>
        <p className="text-gray-500 mt-1">Gerencie suas informações pessoais e segurança</p>
      </div>

      {/* Profile header card */}
      {!loading && profile && (
        <div className="card p-6 mb-6 flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-[#A6864A] to-[#8B6F3D] rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
            {profile.first_name?.charAt(0) || profile.username?.charAt(0) || 'U'}
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {[profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.username}
            </h2>
            <p className="text-gray-500 text-sm">{profile.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                profile.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                profile.role === 'manager' ? 'bg-blue-100 text-blue-800' :
                profile.role === 'operator' ? 'bg-green-100 text-green-800' :
                'bg-gray-100 text-gray-700'
              }`}>
                {roleLabels[profile.role] || profile.role}
              </span>
              {profile.is_2fa_enabled && (
                <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs font-medium flex items-center gap-1">
                  <Shield className="w-3 h-3" /> 2FA ativo
                </span>
              )}
            </div>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-gray-500">Membro desde</p>
            <p className="text-sm font-medium text-gray-900">
              {new Date(profile.date_joined).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white border border-gray-100 rounded-lg p-1 w-fit">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-[#A6864A] text-white'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Profile Tab ──────────────────────────────────────────────────── */}
      {activeTab === 'profile' && (
        <div className="card p-6 max-w-lg">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Nome</label>
                  <input type="text" value={profileForm.first_name}
                    onChange={e => setProfileForm({ ...profileForm, first_name: e.target.value })}
                    className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Sobrenome</label>
                  <input type="text" value={profileForm.last_name}
                    onChange={e => setProfileForm({ ...profileForm, last_name: e.target.value })}
                    className="input-field" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">E-mail</label>
                <input type="email" value={profileForm.email}
                  onChange={e => setProfileForm({ ...profileForm, email: e.target.value })}
                  className="input-field" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Usuário</label>
                <input type="text" value={profile?.username || ''} disabled
                  className="w-full px-4 py-2 border border-gray-100 bg-gray-50 rounded-lg text-gray-500 cursor-not-allowed" />
                <p className="text-xs text-gray-500 mt-1">O nome de usuário não pode ser alterado.</p>
              </div>
              <div className="pt-2">
                <button type="submit" disabled={savingProfile}
                  className="flex items-center gap-2 px-6 py-2 bg-[#A6864A] text-white rounded-lg hover:bg-[#8a6e3c] transition-colors disabled:opacity-60">
                  <Save className="w-4 h-4" />
                  {savingProfile ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ─── Password Tab ─────────────────────────────────────────────────── */}
      {activeTab === 'password' && (
        <div className="card p-6 max-w-lg">
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Senha Atual *</label>
              <div className="relative">
                <input type={showOld ? 'text' : 'password'} required value={passwordForm.old_password}
                  onChange={e => setPasswordForm({ ...passwordForm, old_password: e.target.value })}
                  className="w-full px-4 py-2 pr-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A6864A]/30 focus:border-[#A6864A]" />
                <button type="button" onClick={() => setShowOld(!showOld)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Nova Senha *</label>
              <div className="relative">
                <input type={showNew ? 'text' : 'password'} required minLength={8} value={passwordForm.new_password}
                  onChange={e => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                  className="w-full px-4 py-2 pr-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#A6864A]/30 focus:border-[#A6864A]" />
                <button type="button" onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Mínimo 8 caracteres.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Confirmar Nova Senha *</label>
              <div className="relative">
                <input type={showConfirm ? 'text' : 'password'} required value={passwordForm.confirm_password}
                  onChange={e => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                  className={`w-full px-4 py-2 pr-10 border rounded-lg focus:outline-none focus:ring-2 ${
                    passwordForm.confirm_password && passwordForm.new_password !== passwordForm.confirm_password
                      ? 'border-red-300 focus:ring-red-300/30 focus:border-red-400'
                      : 'border-gray-200 focus:ring-[#A6864A]/30 focus:border-[#A6864A]'
                  }`} />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordForm.confirm_password && passwordForm.new_password !== passwordForm.confirm_password && (
                <p className="text-xs text-red-500 mt-1">As senhas não coincidem.</p>
              )}
            </div>
            <div className="pt-2">
              <button type="submit" disabled={savingPassword}
                className="flex items-center gap-2 px-6 py-2 bg-[#A6864A] text-white rounded-lg hover:bg-[#8a6e3c] transition-colors disabled:opacity-60">
                <Lock className="w-4 h-4" />
                {savingPassword ? 'Alterando...' : 'Alterar Senha'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── Security Tab ─────────────────────────────────────────────────── */}
      {activeTab === 'security' && (
        <div className="space-y-4 max-w-lg">
          <div className="card p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  profile?.is_2fa_enabled ? 'bg-green-50' : 'bg-gray-50'
                }`}>
                  <Shield className={`w-5 h-5 ${profile?.is_2fa_enabled ? 'text-green-600' : 'text-gray-400'}`} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Autenticação em dois fatores (2FA)</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {profile?.is_2fa_enabled
                      ? 'O 2FA está ativado. Sua conta está protegida.'
                      : 'O 2FA não está ativado. Recomendamos ativar para maior segurança.'}
                  </p>
                </div>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                profile?.is_2fa_enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
              }`}>
                {profile?.is_2fa_enabled ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            {!profile?.is_2fa_enabled && (
              <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-100">
                <p className="text-xs text-amber-700">
                  Para ativar o 2FA, acesse as configurações avançadas ou contate o administrador do sistema.
                </p>
              </div>
            )}
          </div>

          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Informações da Conta</h3>
            <div className="space-y-2 mt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Nível de acesso</span>
                <span className="font-medium text-gray-900">{profile ? (roleLabels[profile.role] || profile.role) : '—'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">Membro desde</span>
                <span className="font-medium text-gray-900">
                  {profile ? new Date(profile.date_joined).toLocaleDateString('pt-BR') : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
