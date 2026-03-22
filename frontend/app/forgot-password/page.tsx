'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import api from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError('Email é obrigatório'); return; }
    setLoading(true);
    setError('');
    try {
      await api.post('/accounts/password-reset/', { email });
      // Sempre mostra sucesso (por segurança o backend não revela se o email existe)
      setSent(true);
    } catch {
      // Ainda mostra sucesso — o backend pode retornar 404 mas não revelamos
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F1117] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-accent-gold tracking-tighter">Inova.</h1>
          <p className="text-[10px] font-medium text-slate-500 tracking-[0.2em] uppercase mt-1">Systems Solutions</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8">
          {!sent ? (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Esqueceu sua senha?</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Digite seu email e enviaremos um link para redefinir sua senha.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5 uppercase tracking-wide">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-accent-gold focus:ring-2 focus:ring-accent-gold/20 transition-all"
                      autoComplete="email"
                      disabled={loading}
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
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-accent-gold text-white font-semibold text-sm hover:bg-accent-gold-dark transition-colors disabled:opacity-60"
                >
                  {loading ? 'Enviando...' : 'Enviar link de recuperação'}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="flex justify-center mb-4">
                <CheckCircle2 className="w-16 h-16 text-green-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Email enviado!</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Se este email estiver cadastrado, você receberá as instruções para redefinir sua senha em instantes.
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Não recebeu? Verifique a pasta de spam.</p>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700 text-center">
            <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-accent-gold transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar para o login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
