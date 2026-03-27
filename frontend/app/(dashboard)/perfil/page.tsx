'use client';

import { useEffect, useState } from 'react';
import { UserCircle, Lock, Shield, Save, Eye, EyeOff, Briefcase } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import api, { ApiError } from '@/lib/api';
import { Sensitive } from '@/components/ui/Sensitive';
import { useDemoMode } from '@/components/ui/DemoContext';

interface UserProfile {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_2fa_enabled: boolean;
  created_at: string;
}

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  operator: 'Operador',
  viewer: 'Visualizador',
};

type Tab = 'profile' | 'password' | 'security' | 'employee';

interface EmployeeProfile {
  id?: number;
  position: string;
  contract_type: string;
  hourly_cost: string;
  availability_hours_week: number;
  technologies: string[];
  bio: string;
  linkedin_url: string;
  github_url: string;
  is_billable: boolean;
  start_date: string;
}

export default function PerfilPage() {
  const toast = useToast();
  const { isDemoMode } = useDemoMode();
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

  // Employee profile
  const [employeeProfile, setEmployeeProfile] = useState<EmployeeProfile>({
    position: '', contract_type: 'clt', hourly_cost: '0.00',
    availability_hours_week: 40, technologies: [], bio: '',
    linkedin_url: '', github_url: '', is_billable: true, start_date: '',
  });
  const [loadingEmployee, setLoadingEmployee] = useState(false);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [techInput, setTechInput] = useState('');

  // 2FA state
  const [twoFASetup, setTwoFASetup] = useState<{ qr_code?: string; secret?: string } | null>(null);
  const [twoFACode, setTwoFACode] = useState('');
  const [setting2FA, setSetting2FA] = useState(false);
  const [disabling2FA, setDisabling2FA] = useState(false);
  const [showDisable2FA, setShowDisable2FA] = useState(false);
  const [disable2FAPassword, setDisable2FAPassword] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await api.get<UserProfile>('/accounts/profile/');
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

  // Fetch employee profile when tab is activated
  useEffect(() => {
    if (activeTab !== 'employee') return;
    const fetchEmployee = async () => {
      setLoadingEmployee(true);
      try {
        const data = await api.get<EmployeeProfile & { id: number }>('/accounts/employee-profiles/me/');
        setEmployeeProfile({
          id: data.id,
          position: data.position || '',
          contract_type: data.contract_type || 'clt',
          hourly_cost: data.hourly_cost || '0.00',
          availability_hours_week: data.availability_hours_week ?? 40,
          technologies: Array.isArray(data.technologies) ? data.technologies : [],
          bio: data.bio || '',
          linkedin_url: data.linkedin_url || '',
          github_url: data.github_url || '',
          is_billable: data.is_billable ?? true,
          start_date: data.start_date || '',
        });
      } catch (err) {
        // 404 means profile doesn't exist yet — that's OK
        if (err instanceof ApiError && err.status === 404) return;
        toast.error('Erro ao carregar perfil profissional.');
      } finally {
        setLoadingEmployee(false);
      }
    };
    fetchEmployee();
  }, [activeTab]);

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEmployee(true);
    try {
      const payload = {
        position: employeeProfile.position,
        contract_type: employeeProfile.contract_type,
        hourly_cost: employeeProfile.hourly_cost,
        availability_hours_week: employeeProfile.availability_hours_week,
        technologies: employeeProfile.technologies,
        bio: employeeProfile.bio,
        linkedin_url: employeeProfile.linkedin_url,
        github_url: employeeProfile.github_url,
        is_billable: employeeProfile.is_billable,
        start_date: employeeProfile.start_date || null,
      };
      let data: { id: number };
      if (employeeProfile.id) {
        data = await api.patch<{ id: number }>(`/accounts/employee-profiles/${employeeProfile.id}/`, payload);
      } else {
        data = await api.post<{ id: number }>('/accounts/employee-profiles/', payload);
      }
      setEmployeeProfile(prev => ({ ...prev, id: data.id }));
      toast.success('Perfil profissional salvo com sucesso!');
    } catch {
      toast.error('Erro ao salvar perfil profissional.');
    } finally {
      setSavingEmployee(false);
    }
  };

  const handleAddTech = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = techInput.trim();
      if (val && !employeeProfile.technologies.includes(val)) {
        setEmployeeProfile(prev => ({ ...prev, technologies: [...prev.technologies, val] }));
      }
      setTechInput('');
    }
  };

  const handleRemoveTech = (tech: string) => {
    setEmployeeProfile(prev => ({ ...prev, technologies: prev.technologies.filter(t => t !== tech) }));
  };

  // 2FA handlers
  const handle2FASetup = async () => {
    setSetting2FA(true);
    try {
      const data = await api.post<{ qr_code?: string; secret?: string; enabled?: boolean }>('/accounts/2fa/setup/');
      setTwoFASetup(data);
      setProfile(prev => prev ? { ...prev, is_2fa_enabled: true } : prev);
    } catch {
      toast.error('Erro ao iniciar configuração do 2FA.');
    } finally {
      setSetting2FA(false);
    }
  };

  const handle2FAVerify = () => {
    // O 2FA já foi ativado no backend ao gerar o QR code.
    // Esta etapa confirma que o utilizador escaneou o código.
    setTwoFASetup(null);
    setTwoFACode('');
    toast.success('2FA ativado com sucesso! Escaneie o QR code com o seu autenticador.');
  };

  const handle2FADisable = async () => {
    if (!disable2FAPassword.trim()) { toast.error('Digite sua senha para confirmar.'); return; }
    setDisabling2FA(true);
    try {
      await api.post('/accounts/2fa/setup/', { disable: true, password: disable2FAPassword });
      setProfile(prev => prev ? { ...prev, is_2fa_enabled: false } : prev);
      setShowDisable2FA(false);
      setDisable2FAPassword('');
      toast.success('2FA desativado com sucesso!');
    } catch {
      toast.error('Erro ao desativar 2FA. Verifique sua senha ou contate o administrador.');
    } finally {
      setDisabling2FA(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const data = await api.patch<UserProfile>('/accounts/profile/', profileForm);
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
      await api.post('/accounts/change-password/', { old_password: passwordForm.old_password, new_password: passwordForm.new_password, new_password_confirm: passwordForm.confirm_password });
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
    { key: 'employee' as Tab, label: 'Perfil Profissional', icon: <Briefcase className="w-4 h-4" /> },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Meu Perfil</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Gerencie suas informações pessoais e segurança</p>
      </div>

      {/* Profile header card */}
      {!loading && profile && (
        <div className="card p-6 mb-6 flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-accent-gold to-accent-gold-dark rounded-full flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
            {profile.first_name?.charAt(0) || profile.username?.charAt(0) || 'U'}
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              <Sensitive>{[profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.username}</Sensitive>
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm"><Sensitive>{profile.email}</Sensitive></p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                profile.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                profile.role === 'manager' ? 'bg-blue-100 text-blue-800' :
                profile.role === 'operator' ? 'bg-green-100 text-green-800' :
                'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
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
            <p className="text-xs text-gray-500 dark:text-gray-400">Membro desde</p>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {new Date(profile.created_at).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg p-1 w-fit">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-accent-gold text-white'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 hover:bg-gray-50 dark:hover:bg-gray-700/50'
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
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />)}
            </div>
          ) : (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Nome</label>
                  <input type="text" value={profileForm.first_name}
                    onChange={e => setProfileForm({ ...profileForm, first_name: e.target.value })}
                    className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Sobrenome</label>
                  <input type="text" value={profileForm.last_name}
                    onChange={e => setProfileForm({ ...profileForm, last_name: e.target.value })}
                    className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">E-mail</label>
                <input type="email" value={profileForm.email}
                  onChange={e => setProfileForm({ ...profileForm, email: e.target.value })}
                  className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Usuário</label>
                <input type="text" value={profile?.username || ''} disabled
                  className="w-full px-4 py-2 border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-gray-500 dark:text-gray-400 cursor-not-allowed" />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">O nome de usuário não pode ser alterado.</p>
              </div>
              <div className="pt-2">
                <button type="submit" disabled={savingProfile}
                  className="flex items-center gap-2 px-6 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60">
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
              <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Senha Atual *</label>
              <div className="relative">
                <input type={showOld ? 'text' : 'password'} required value={passwordForm.old_password}
                  onChange={e => setPasswordForm({ ...passwordForm, old_password: e.target.value })}
                  className="w-full px-4 py-2 pr-10 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
                <button type="button" onClick={() => setShowOld(!showOld)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600">
                  {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Nova Senha *</label>
              <div className="relative">
                <input type={showNew ? 'text' : 'password'} required minLength={8} value={passwordForm.new_password}
                  onChange={e => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                  className="w-full px-4 py-2 pr-10 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
                <button type="button" onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Mínimo 8 caracteres.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Confirmar Nova Senha *</label>
              <div className="relative">
                <input type={showConfirm ? 'text' : 'password'} required value={passwordForm.confirm_password}
                  onChange={e => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                  className={`w-full px-4 py-2 pr-10 border rounded-lg focus:outline-none focus:ring-2 ${
                    passwordForm.confirm_password && passwordForm.new_password !== passwordForm.confirm_password
                      ? 'border-red-300 focus:ring-red-300/30 focus:border-red-400'
                      : 'border-gray-200 dark:border-gray-700 focus:ring-accent-gold/30 focus:border-accent-gold'
                  }`} />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600">
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordForm.confirm_password && passwordForm.new_password !== passwordForm.confirm_password && (
                <p className="text-xs text-red-500 mt-1">As senhas não coincidem.</p>
              )}
            </div>
            <div className="pt-2">
              <button type="submit" disabled={savingPassword}
                className="flex items-center gap-2 px-6 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60">
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
                  profile?.is_2fa_enabled ? 'bg-green-50' : 'bg-gray-50 dark:bg-gray-700/50'
                }`}>
                  <Shield className={`w-5 h-5 ${profile?.is_2fa_enabled ? 'text-green-600' : 'text-gray-400 dark:text-gray-500'}`} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Autenticação em dois fatores (2FA)</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {profile?.is_2fa_enabled
                      ? 'O 2FA está ativado. Sua conta está protegida.'
                      : 'O 2FA não está ativado. Recomendamos ativar para maior segurança.'}
                  </p>
                </div>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                profile?.is_2fa_enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}>
                {profile?.is_2fa_enabled ? 'Ativo' : 'Inativo'}
              </span>
            </div>

            {/* 2FA not enabled — setup flow */}
            {!profile?.is_2fa_enabled && (
              <div className="mt-4">
                {!twoFASetup ? (
                  <button
                    onClick={handle2FASetup}
                    disabled={setting2FA}
                    className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white text-sm rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60"
                  >
                    <Shield className="w-4 h-4" />
                    {setting2FA ? 'Aguarde...' : 'Configurar 2FA'}
                  </button>
                ) : (
                  <div className="space-y-4">
                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                      <p className="text-xs text-blue-700 font-medium mb-2">
                        Escaneie o QR code com seu app autenticador (Google Authenticator, Authy, etc.):
                      </p>
                      {twoFASetup.qr_code && (
                        <img
                          src={twoFASetup.qr_code}
                          alt="QR Code 2FA"
                          className="w-40 h-40 border border-blue-200 rounded-lg bg-white dark:bg-gray-800 p-1"
                        />
                      )}
                      {twoFASetup.secret && (
                        <div className="mt-2">
                          <p className="text-xs text-blue-600 mb-1">Ou insira a chave manualmente:</p>
                          <code className="block text-xs font-mono bg-white dark:bg-gray-800 border border-blue-200 rounded px-2 py-1 text-blue-900 break-all">
                            {twoFASetup.secret}
                          </code>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Escaneie o QR code com o seu aplicativo autenticador (Google Authenticator, Authy, etc.) e clique em Confirmar.</label>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handle2FAVerify}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
                      >
                        <Shield className="w-4 h-4" />
                        Confirmar Ativação
                      </button>
                      <button
                        onClick={() => { setTwoFASetup(null); setTwoFACode(''); }}
                        className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2FA enabled — disable flow */}
            {profile?.is_2fa_enabled && (
              <div className="mt-4">
                {!showDisable2FA ? (
                  <button
                    onClick={() => setShowDisable2FA(true)}
                    className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 text-sm rounded-lg hover:bg-red-50 transition-colors"
                  >
                    Desativar 2FA
                  </button>
                ) : (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-lg space-y-3">
                    <p className="text-xs text-red-700 font-medium">
                      Confirme sua senha para desativar o 2FA:
                    </p>
                    <input
                      type="password"
                      placeholder="Sua senha atual"
                      value={disable2FAPassword}
                      onChange={e => setDisable2FAPassword(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-red-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300/30 focus:border-red-400"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handle2FADisable}
                        disabled={disabling2FA}
                        className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
                      >
                        {disabling2FA ? 'Desativando...' : 'Confirmar desativação'}
                      </button>
                      <button
                        onClick={() => { setShowDisable2FA(false); setDisable2FAPassword(''); }}
                        className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Informações da Conta</h3>
            <div className="space-y-2 mt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Nível de acesso</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{profile ? (roleLabels[profile.role] || profile.role) : '—'}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">Membro desde</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {profile ? new Date(profile.created_at).toLocaleDateString('pt-BR') : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Employee Profile Tab ─────────────────────────────────────────── */}
      {activeTab === 'employee' && (
        <div className="card p-6 max-w-2xl">
          {loadingEmployee ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <form onSubmit={handleSaveEmployee} className="space-y-5">
              {/* Cargo + Contrato */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Cargo</label>
                  <input
                    type="text"
                    placeholder="Ex: Desenvolvedor Full Stack"
                    value={employeeProfile.position}
                    onChange={e => setEmployeeProfile(prev => ({ ...prev, position: e.target.value }))}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Tipo de Contrato</label>
                  <select
                    value={employeeProfile.contract_type}
                    onChange={e => setEmployeeProfile(prev => ({ ...prev, contract_type: e.target.value }))}
                    className="input-field"
                  >
                    <option value="clt">CLT</option>
                    <option value="pj">PJ</option>
                    <option value="freelancer">Freelancer</option>
                    <option value="partner">Sócio</option>
                  </select>
                </div>
              </div>

              {/* Custo/hora + Horas/semana */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Custo por hora (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={employeeProfile.hourly_cost}
                    onChange={e => setEmployeeProfile(prev => ({ ...prev, hourly_cost: e.target.value }))}
                    className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Horas disponíveis/semana</label>
                  <input
                    type="number"
                    min="0"
                    max="168"
                    value={employeeProfile.availability_hours_week}
                    onChange={e => setEmployeeProfile(prev => ({ ...prev, availability_hours_week: Number(e.target.value) }))}
                    className="input-field"
                  />
                </div>
              </div>

              {/* Faturável + Data de início */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Data de início</label>
                  <input
                    type="date"
                    value={employeeProfile.start_date}
                    onChange={e => setEmployeeProfile(prev => ({ ...prev, start_date: e.target.value }))}
                    className="input-field"
                  />
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <button
                    type="button"
                    onClick={() => setEmployeeProfile(prev => ({ ...prev, is_billable: !prev.is_billable }))}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                      employeeProfile.is_billable ? 'bg-accent-gold' : 'bg-gray-200'
                    }`}
                    role="switch"
                    aria-checked={employeeProfile.is_billable}
                  >
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white dark:bg-gray-800 shadow transition-transform duration-200 ${
                      employeeProfile.is_billable ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Faturável</span>
                </div>
              </div>

              {/* Tecnologias (tag input) */}
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Tecnologias</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {employeeProfile.technologies.map(tech => (
                    <span key={tech} className="flex items-center gap-1 px-2 py-0.5 bg-accent-gold/10 text-accent-gold-dark border border-accent-gold/20 rounded-full text-xs font-medium">
                      {tech}
                      <button
                        type="button"
                        onClick={() => handleRemoveTech(tech)}
                        className="text-accent-gold hover:text-red-600 transition-colors leading-none"
                        aria-label={`Remover ${tech}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Digite uma tecnologia e pressione Enter"
                  value={techInput}
                  onChange={e => setTechInput(e.target.value)}
                  onKeyDown={handleAddTech}
                  className="input-field"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Pressione Enter para adicionar cada tecnologia.</p>
              </div>

              {/* Bio */}
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Bio</label>
                <textarea
                  rows={3}
                  placeholder="Breve descrição profissional..."
                  value={employeeProfile.bio}
                  onChange={e => setEmployeeProfile(prev => ({ ...prev, bio: e.target.value }))}
                  className={`w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold resize-none ${isDemoMode ? 'sensitive-blur' : ''}`}
                />
              </div>

              {/* LinkedIn + GitHub */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">LinkedIn URL</label>
                  <input
                    type="url"
                    placeholder="https://linkedin.com/in/usuario"
                    value={employeeProfile.linkedin_url}
                    onChange={e => setEmployeeProfile(prev => ({ ...prev, linkedin_url: e.target.value }))}
                    className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">GitHub URL</label>
                  <input
                    type="url"
                    placeholder="https://github.com/usuario"
                    value={employeeProfile.github_url}
                    onChange={e => setEmployeeProfile(prev => ({ ...prev, github_url: e.target.value }))}
                    className={`input-field ${isDemoMode ? 'sensitive-blur' : ''}`}
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={savingEmployee}
                  className="flex items-center gap-2 px-6 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60"
                >
                  <Save className="w-4 h-4" />
                  {savingEmployee ? 'Salvando...' : 'Salvar Perfil Profissional'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
