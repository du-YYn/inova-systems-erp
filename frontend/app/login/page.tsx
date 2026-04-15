'use client';

import { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, AlertCircle, Loader2 } from 'lucide-react';
import api, { ApiError } from '@/lib/api';
import AnimatedCharacters from '@/components/ui/AnimatedCharacters';

export default function LoginPage() {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [isFocused, setIsFocused] = useState({ username: false, password: false });
  const [isTyping, setIsTyping] = useState(false);
  const [errorCount, setErrorCount] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (requires2FA) {
        try {
          const data = await api.post<{ user?: { id: number; username: string; email: string; first_name: string; last_name: string; role: string } }>('/accounts/2fa/verify/', { temp_token: tempToken, code: twoFactorCode });
          if (data.user && typeof data.user.username === 'string') {
            const { id, username, email, first_name, last_name, role } = data.user;
            localStorage.setItem('user', JSON.stringify({ id, username, email, first_name, last_name, role }));
          }
          window.location.replace('/dashboard');
          return;
        } catch (err) {
          const message = err instanceof ApiError ? (err.data as { error?: string })?.error || err.message : 'Código inválido';
          setError(message);
          setErrorCount(c => c + 1);
          setLoading(false);
          return;
        }
      }

      try {
        interface LoginResponse { requires_2fa?: boolean; temp_token?: string; user?: { id: number; username: string; email: string; first_name: string; last_name: string; role: string }; error?: string }
        // CSP connect-src 'self' bloqueia chamadas cross-domain no subdomínio parceiro
        // Usar proxy local /api/auth/login para contornar
        const useProxy = typeof window !== 'undefined' && window.location.hostname !== 'erp.inovasystemssolutions.com' && window.location.hostname !== 'localhost';
        let data: LoginResponse;
        if (useProxy) {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
            credentials: 'include',
          });
          data = await res.json();
          if (!res.ok) throw new ApiError(data.error || 'Credenciais inválidas', res.status, data);
        } else {
          data = await api.post<LoginResponse>('/accounts/login/', formData);
        }

        if (data.requires_2fa) {
          setRequires2FA(true);
          setTempToken(data.temp_token || '');
          setLoading(false);
          return;
        }

        // Tokens chegam via cookie httpOnly; salva apenas dados do usuário para exibição
        if (data.user && typeof data.user.username === 'string') {
          const { id, username, email, first_name, last_name, role } = data.user;
          localStorage.setItem('user', JSON.stringify({ id, username, email, first_name, last_name, role }));
        }
        // Redirecionar com base no role e subdomínio
        const isPartnerDomain = window.location.hostname === 'parceiro.inovasystemssolutions.com';
        const isPartnerRole = data.user?.role === 'partner';
        if (isPartnerDomain || isPartnerRole) {
          window.location.replace('/partner/dashboard');
        } else {
          window.location.replace('/dashboard');
        }
      } catch (err) {
        const message = err instanceof ApiError ? (err.data as { error?: string })?.error || err.message : 'Credenciais inválidas';
        setError(message);
        setErrorCount(c => c + 1);
        setLoading(false);
        return;
      }
    } catch {
      setError('Erro de conexão. Tente novamente.');
      setErrorCount(c => c + 1);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-black">
        {/* Grid pattern de fundo */}
        <div className="absolute inset-0"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)', backgroundSize: '40px 40px' }}
        />

        {/* Glow decorativo */}
        <div className="absolute top-1/4 right-1/4 w-64 h-64 bg-accent-gold/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-accent-gold/5 rounded-full blur-3xl" />

        <div className="relative z-10 flex flex-col justify-between w-full p-12 text-white">
          {/* Logo topo */}
          <div className="group text-left">
            <div>
              <span className="text-5xl font-bold text-accent-gold tracking-tighter group-hover:text-accent-gold-light transition-colors">Inova.</span>
            </div>
            <div className="-mt-1">
              <span className="text-sm font-light text-gray-400 tracking-[0.15em] uppercase">Systems Solutions</span>
            </div>
          </div>

          {/* Personagens animados — centro */}
          <div className="flex items-end justify-center">
            <AnimatedCharacters
              isTyping={isTyping}
              isPasswordVisible={showPassword}
              hasPassword={formData.password.length > 0}
              errorTrigger={errorCount}
            />
          </div>

          {/* Links rodapé */}
          <div className="flex flex-wrap justify-center items-center gap-6 text-center">
            <div className="flex items-center gap-2 text-slate-400">
              <div className="w-2 h-2 bg-accent-gold rounded-full" />
              <span className="text-sm">Gestão Comercial e Vendas</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <div className="w-2 h-2 bg-accent-gold rounded-full" />
              <span className="text-sm">Controle Financeiro</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <div className="w-2 h-2 bg-accent-gold rounded-full" />
              <span className="text-sm">Gestão de Projetos</span>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-gray-200">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 group text-left">
            <div>
              <span className="text-4xl font-bold text-accent-gold tracking-tighter group-hover:text-[#B8965A] transition-colors">Inova.</span>
            </div>
            <div className="-mt-1">
              <span className="text-[10px] font-light text-gray-400 dark:text-gray-500 tracking-[0.15em] uppercase">Systems Solutions</span>
            </div>
          </div>

          <div className="hidden lg:mb-8 group text-left">
            <div>
              <span className="text-4xl font-bold text-accent-gold tracking-tighter group-hover:text-[#B8965A] transition-colors">Inova.</span>
            </div>
            <div className="-mt-1">
              <span className="text-[10px] font-light text-gray-400 dark:text-gray-500 tracking-[0.15em] uppercase">Systems Solutions</span>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-bold text-slate-900">Bem-vindo de volta</h2>
            <p className="text-slate-500 mt-2">Entre com suas credenciais para acessar o sistema</p>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleSubmit(e); }} className="space-y-6">
            {error && (
              <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm animate-shake">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}

            {!requires2FA ? (
              <>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Usuário ou Email
                  </label>
                  <div className={`relative transition-all duration-200 ${isFocused.username ? 'scale-[1.02]' : ''}`}>
                    <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${isFocused.username ? 'text-accent-gold' : 'text-slate-400'}`}>
                      <Mail className="w-5 h-5" />
                    </div>
                    <input
                      type="text"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      onFocus={() => { setIsFocused({ ...isFocused, username: true }); setIsTyping(true); }}
                      onBlur={() => { setIsFocused({ ...isFocused, username: false }); setIsTyping(false); }}
                      className={`w-full pl-12 pr-4 py-3.5 bg-slate-50 border-2 rounded-xl transition-all duration-200 focus:outline-none ${
                        isFocused.username 
                          ? 'border-accent-gold bg-white dark:bg-gray-800 shadow-lg shadow-accent-gold/10' 
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                      placeholder="seu@email.com"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Senha
                  </label>
                  <div className={`relative transition-all duration-200 ${isFocused.password ? 'scale-[1.02]' : ''}`}>
                    <div className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${isFocused.password ? 'text-accent-gold' : 'text-slate-400'}`}>
                      <Lock className="w-5 h-5" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      onFocus={() => { setIsFocused({ ...isFocused, password: true }); setIsTyping(true); }}
                      onBlur={() => { setIsFocused({ ...isFocused, password: false }); setIsTyping(false); }}
                      className={`w-full pl-12 pr-14 py-3.5 bg-slate-50 border-2 rounded-xl transition-all duration-200 focus:outline-none ${
                        isFocused.password 
                          ? 'border-accent-gold bg-white dark:bg-gray-800 shadow-lg shadow-accent-gold/10' 
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">
                  Código 2FA
                </label>
                <input
                  type="text"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full px-4 py-3.5 bg-slate-50 border-2 border-accent-gold rounded-xl focus:outline-none focus:shadow-lg focus:shadow-accent-gold/10 font-mono text-center text-2xl tracking-widest"
                  placeholder="000000"
                  maxLength={6}
                  required
                />
                <p className="text-xs text-slate-500">
                  Digite o código do seu aplicativo autenticador
                </p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-accent-gold focus:ring-accent-gold" />
                <span className="text-sm text-slate-600">Lembrar-me</span>
              </label>
              <a href="/forgot-password" className="text-accent-gold hover:text-accent-gold font-medium">
                Esqueceu a senha?
              </a>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-accent-gold hover:bg-accent-gold-dark text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-accent-gold/30 hover:shadow-accent-gold/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Entrando...
                </>
              ) : (
                requires2FA ? 'Verificar Código' : 'Entrar'
              )}
            </button>
          </form>

          {requires2FA && (
            <button
              onClick={() => {
                setRequires2FA(false);
                setTwoFactorCode('');
                setTempToken('');
              }}
              className="w-full mt-4 text-sm text-slate-500 hover:text-accent-gold font-medium transition-colors"
            >
              ← Voltar para login
            </button>
          )}

          <p className="mt-8 text-center text-sm text-slate-500">
            © 2026 Inova Systems. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  );
}
