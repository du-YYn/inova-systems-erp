'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, Mail, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');

  useEffect(() => {
    console.log('Login page loaded');
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('1. Starting login...');
    setError('');
    setLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
      console.log('2. API URL:', apiUrl);
      
      console.log('3. Making fetch request...');
      const res = await fetch(`${apiUrl}/accounts/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      console.log('4. Response status:', res.status);
      const data = await res.json();
      console.log('5. Response data:', data);
      
      if (!res.ok) {
        setError(data.error || 'Credenciais inválidas');
        setLoading(false);
        return;
      }

      if (data.requires_2fa) {
        setRequires2FA(true);
        setTempToken(data.temp_token);
        setLoading(false);
        return;
      }
      
      localStorage.setItem('token', data.access);
      localStorage.setItem('refresh', data.refresh);
      localStorage.setItem('user', JSON.stringify(data.user));
      alert('Login successful! Redirecting to dashboard...');
      window.location.replace('/dashboard');
    } catch (err) {
      console.error('7. Error:', err);
      setError('Erro de conexão. Tente novamente.');
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary bg-grid-light">
      <div className="absolute inset-0 bg-grid-light pointer-events-none" />
      
      <div className="relative w-full max-w-md p-8 bg-white rounded-lg shadow-lg border border-gray-100">
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-accent-gold rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-2xl">IS</span>
          </div>
          <h1 className="text-2xl font-semibold text-text-primary">Inova Systems</h1>
          <p className="text-text-secondary text-sm mt-1">ERP - Sistema de Gestão</p>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(e); }} className="space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {!requires2FA ? (
            <>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Usuário / Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold transition-colors"
                    placeholder="seu@email.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1.5">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full pl-10 pr-12 py-2.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold transition-colors"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Código 2FA
              </label>
              <input
                type="text"
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold transition-colors font-mono text-center text-2xl tracking-widest"
                placeholder="000000"
                maxLength={6}
                required
              />
              <p className="text-xs text-text-secondary mt-2">
                Digite o código do seu aplicativo autenticador
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-accent-gold hover:bg-accent-gold-dark text-white font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Entrando...' : requires2FA ? 'Verificar Código' : 'Entrar'}
          </button>

          {!requires2FA && (
            <div className="text-center">
              <a href="#" className="text-sm text-accent-gold hover:underline">
                Esqueceu sua senha?
              </a>
            </div>
          )}
        </form>

        {requires2FA && (
          <button
            onClick={() => {
              setRequires2FA(false);
              setTwoFactorCode('');
              setTempToken('');
            }}
            className="w-full mt-4 text-sm text-text-secondary hover:text-accent-gold"
          >
            ← Voltar para login
          </button>
        )}
      </div>
    </div>
  );
}
