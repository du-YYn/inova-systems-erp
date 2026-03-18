'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, Eye, EyeOff, CheckCircle2, ArrowLeft } from 'lucide-react';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') || '';

  const [form, setForm] = useState({ new_password: '', confirm: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

  useEffect(() => {
    if (!token) {
      setError('Token inválido ou expirado. Solicite um novo link.');
    }
  }, [token]);

  const validate = () => {
    if (!form.new_password || form.new_password.length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres'); return false;
    }
    if (form.new_password !== form.confirm) {
      setError('As senhas não conferem'); return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/accounts/password-reset/confirm/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: form.new_password }),
      });
      if (res.ok) {
        setDone(true);
        setTimeout(() => router.push('/login'), 3000);
      } else {
        const data = await res.json();
        setError(data.error || 'Erro ao redefinir. O token pode ter expirado.');
      }
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F1117] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#A6864A] tracking-tighter">Inova.</h1>
          <p className="text-[10px] font-medium text-slate-500 tracking-[0.2em] uppercase mt-1">Systems Solutions</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {!done ? (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900">Redefinir senha</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Crie uma nova senha para sua conta.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Nova senha
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={form.new_password}
                      onChange={e => setForm(f => ({ ...f, new_password: e.target.value }))}
                      placeholder="Mínimo 8 caracteres"
                      className="w-full pl-10 pr-10 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#A6864A] focus:ring-2 focus:ring-[#A6864A]/20 transition-all"
                      disabled={loading || !token}
                    />
                    <button type="button" onClick={() => setShowPwd(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Confirmar nova senha
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={form.confirm}
                      onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                      placeholder="Repita a nova senha"
                      className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-[#A6864A] focus:ring-2 focus:ring-[#A6864A]/20 transition-all"
                      disabled={loading || !token}
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !token}
                  className="w-full py-3 rounded-xl bg-[#A6864A] text-white font-semibold text-sm hover:bg-[#8B6F3D] transition-colors disabled:opacity-60"
                >
                  {loading ? 'Salvando...' : 'Redefinir senha'}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="flex justify-center mb-4">
                <CheckCircle2 className="w-16 h-16 text-green-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Senha redefinida!</h2>
              <p className="text-sm text-gray-500">
                Sua senha foi alterada com sucesso. Redirecionando para o login...
              </p>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-gray-100 text-center">
            <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#A6864A] transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar para o login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0F1117] flex items-center justify-center"><div className="text-white">Carregando...</div></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
