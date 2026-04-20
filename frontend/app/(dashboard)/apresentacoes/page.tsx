'use client';

import { useState } from 'react';
import { ArrowUpRight, Loader2, Presentation, Sparkles } from 'lucide-react';
import api, { ApiError } from '@/lib/api';

interface LaunchResponse {
  url: string;
}

export default function ApresentacoesPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLaunch = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<LaunchResponse>(
        '/integrations/presentations/launch/',
      );
      // Open in a new tab — the SSO handshake happens automatically there.
      const opened = window.open(data.url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        setError(
          'O navegador bloqueou a nova aba. Permita pop-ups para este site e tente novamente.',
        );
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 503) {
          setError(
            'A integração com o produto Apresentação ainda não foi configurada neste ambiente.',
          );
        } else {
          setError(err.data?.detail || 'Não foi possível abrir o produto Apresentação.');
        }
      } else {
        setError('Erro inesperado ao iniciar o produto Apresentação.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-accent-gold/10 flex items-center justify-center">
            <Presentation className="w-6 h-6 text-accent-gold" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
              Apresentações
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Apresentações comerciais interativas tipo Miro+Prezi
            </p>
          </div>
        </div>
      </header>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-card p-8 border border-gray-100 dark:border-gray-700">
        <div className="flex items-start gap-4 mb-6">
          <Sparkles className="w-5 h-5 text-accent-gold flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Construa apresentações imersivas para C-levels
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              O produto Apresentação substitui PDFs e PowerPoints em reuniões comerciais
              de alto valor. Editor visual com cards conectados, linha do tempo
              cinematográfica, modos de câmera estilo Prezi e link público para o cliente
              revisitar a apresentação.
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mt-3">
              Você é redirecionado para o produto Apresentação em uma nova aba — sem
              precisar fazer login novamente.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-6 border-t border-gray-100 dark:border-gray-700">
          <button
            type="button"
            onClick={handleLaunch}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-accent-gold text-white font-semibold text-sm hover:bg-accent-gold-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Iniciando...
              </>
            ) : (
              <>
                Abrir Apresentações
                <ArrowUpRight className="w-4 h-4" />
              </>
            )}
          </button>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>
      </div>

      <p className="mt-4 text-xs text-gray-400 dark:text-gray-500 text-center">
        Abre em nova aba · sessão única assinada com expiração de 2 minutos
      </p>
    </div>
  );
}
