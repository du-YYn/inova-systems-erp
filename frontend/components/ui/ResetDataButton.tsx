'use client';

import { useState } from 'react';
import { Trash2, AlertTriangle, Loader2, CheckCircle } from 'lucide-react';
import api from '@/lib/api';

interface ResetResult {
  success: boolean;
  message: string;
  detalhes: Record<string, number>;
}

export default function ResetDataButton() {
  const [showModal, setShowModal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResetResult | null>(null);
  const [error, setError] = useState('');

  const handleReset = async () => {
    if (confirmText !== 'RESETAR') return;
    setLoading(true);
    setError('');
    try {
      const data = await api.post<ResetResult>('/core/reset-data/', { confirm: 'RESETAR' });
      setResult(data);
      setConfirmText('');
    } catch {
      setError('Erro ao resetar dados. Verifique os logs.');
    }
    setLoading(false);
  };

  const handleClose = () => {
    setShowModal(false);
    setConfirmText('');
    setResult(null);
    setError('');
    if (result?.success) {
      window.location.reload();
    }
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-2 px-4 py-2 bg-red-900/20 hover:bg-red-900/30 text-red-400 border border-red-800/30 rounded-xl text-sm font-medium transition-colors"
      >
        <Trash2 className="w-4 h-4" />
        Resetar Dados de Teste
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl animate-modal-in">
            {/* Header */}
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Resetar Dados de Teste</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Esta ação não pode ser desfeita</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {result?.success ? (
                /* Success state */
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-semibold">{result.message}</span>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 space-y-1.5 max-h-60 overflow-y-auto">
                    {Object.entries(result.detalhes)
                      .filter(([, count]) => count > 0)
                      .map(([key, count]) => (
                        <div key={key} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600 dark:text-gray-400 capitalize">{key.replace(/_/g, ' ')}</span>
                          <span className="font-mono font-bold text-gray-900 dark:text-gray-200">{count}</span>
                        </div>
                      ))}
                    {Object.values(result.detalhes).every(v => v === 0) && (
                      <p className="text-gray-400 text-sm text-center">Nenhum dado para remover.</p>
                    )}
                  </div>
                  <button
                    onClick={handleClose}
                    className="w-full py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    Fechar e Recarregar
                  </button>
                </div>
              ) : (
                /* Confirmation state */
                <div className="space-y-4">
                  <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-xl p-4">
                    <p className="text-sm text-red-800 dark:text-red-300 leading-relaxed">
                      Isso vai <strong>apagar permanentemente</strong> todos os dados de:
                    </p>
                    <ul className="mt-2 text-xs text-red-700 dark:text-red-400 space-y-0.5 list-disc list-inside">
                      <li>Clientes, Prospects, Propostas e Contratos</li>
                      <li>Faturas e Transações</li>
                      <li>Projetos, Tarefas e Horas</li>
                      <li>Tickets de Suporte</li>
                      <li>Notificações</li>
                    </ul>
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400">
                      Configurações do sistema, usuários e categorias serão mantidos.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      Digite <strong className="text-red-600">RESETAR</strong> para confirmar
                    </label>
                    <input
                      type="text"
                      value={confirmText}
                      onChange={e => setConfirmText(e.target.value)}
                      placeholder="RESETAR"
                      className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 font-mono text-center tracking-widest"
                      autoFocus
                    />
                  </div>

                  {error && (
                    <p className="text-red-500 text-sm text-center">{error}</p>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={handleClose}
                      disabled={loading}
                      className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleReset}
                      disabled={loading || confirmText !== 'RESETAR'}
                      className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Resetando...
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" />
                          Resetar Tudo
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
