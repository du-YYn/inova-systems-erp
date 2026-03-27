'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, Mail, AlertCircle, Loader2 } from 'lucide-react';
import api, { ApiError } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [isFocused, setIsFocused] = useState({ username: false, password: false });

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
          setLoading(false);
          return;
        }
      }

      try {
        const data = await api.post<{ requires_2fa?: boolean; temp_token?: string; user?: { id: number; username: string; email: string; first_name: string; last_name: string; role: string } }>('/accounts/login/', formData);

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
        window.location.replace('/dashboard');
      } catch (err) {
        const message = err instanceof ApiError ? (err.data as { error?: string })?.error || err.message : 'Credenciais inválidas';
        setError(message);
        setLoading(false);
        return;
      }
    } catch {
      setError('Erro de conexão. Tente novamente.');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-black">
        
        {/* Tech circuit pattern - very transparent */}
        <div className="absolute inset-0 opacity-15" 
          style={{ 
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cg fill='none' stroke='%23A6864A' stroke-width='0.5'%3E%3Cpath d='M10 10h80v80H10z'/%3E%3Cpath d='M10 30h20M10 50h30M10 70h40'/%3E%3Cpath d='M30 10v20M50 10v30M70 10v40M90 10v50'/%3E%3Cpath d='M20 90h60M40 80h40M60 70h20'/%3E%3Ccircle cx='30' cy='30' r='3' fill='%23A6864A'/%3E%3Ccircle cx='50' cy='50' r='2' fill='%23A6864A'/%3E%3Ccircle cx='70' cy='70' r='3' fill='%23A6864A'/%3E%3Ccircle cx='90' cy='30' r='2' fill='%23A6864A'/%3E%3Ccircle cx='20' cy='80' r='2' fill='%23A6864A'/%3E%3C/g%3E%3C/svg%3E")`,
            backgroundSize: '100px 100px',
          }} 
        />
        
        {/* Binary code rain effect - very transparent */}
        <div className="absolute inset-0 overflow-hidden opacity-10">
          <div className="absolute top-0 left-10 text-xs font-mono text-accent-gold whitespace-nowrap" style={{ animationDuration: '3s' }}>
            10101010101010101010<br/>01101001011010100101<br/>10110100110101011010
          </div>
          <div className="absolute top-20 right-20 text-xs font-mono text-accent-gold whitespace-nowrap" style={{ animationDuration: '4s', animationDelay: '1s' }}>
            01011010110101101010<br/>10100110101101010011<br/>01101011010110101101
          </div>
          <div className="absolute bottom-40 left-20 text-xs font-mono text-accent-gold whitespace-nowrap" style={{ animationDuration: '3.5s', animationDelay: '0.5s' }}>
            11010110010101101001<br/>01101011010110100101<br/>10101010110101101010
          </div>
        </div>
        
        <div className="relative z-10 flex flex-col justify-center items-center w-full p-12 text-white">
          <div className="mb-8 group text-left">
            <div>
              <span className="text-5xl font-bold text-accent-gold tracking-tighter group-hover:text-[#B8965A] transition-colors">Inova.</span>
            </div>
            <div className="-mt-1">
              <span className="text-sm font-light text-gray-400 dark:text-gray-500 tracking-[0.15em] uppercase">Systems Solutions</span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-xl text-slate-300 max-w-md">
              Sistema completo de gestão empresarial da Inova
            </p>
          </div>
          <div className="mt-12 flex flex-wrap justify-center items-center gap-6 text-center">
            <div className="flex items-center gap-2 text-slate-400">
              <div className="w-2 h-2 bg-accent-gold rounded-full"></div>
              <span className="text-sm">Gestão Comercial e Vendas</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <div className="w-2 h-2 bg-accent-gold rounded-full"></div>
              <span className="text-sm">Controle Financeiro</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <div className="w-2 h-2 bg-accent-gold rounded-full"></div>
              <span className="text-sm">Gestão de Projetos</span>
            </div>
          </div>
        </div>
        <div className="absolute inset-0 bg-grid-white/5" 
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.1) 1px, transparent 0)', backgroundSize: '40px 40px' }} 
        />
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
                      onFocus={() => setIsFocused({ ...isFocused, username: true })}
                      onBlur={() => setIsFocused({ ...isFocused, username: false })}
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
                      onFocus={() => setIsFocused({ ...isFocused, password: true })}
                      onBlur={() => setIsFocused({ ...isFocused, password: false })}
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
