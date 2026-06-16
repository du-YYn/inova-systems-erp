'use client';

/**
 * Canal público de abertura de chamados (v32 F6, doc 05 §9).
 *
 * Página FORA do dashboard — o cliente acessa /chamado/{token} sem login
 * (token UUID por cliente, enviado pela equipe de Suporte). Form simples:
 * título + descrição + contato + anexo opcional (imagem/vídeo/áudio/doc).
 */
import { useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Headphones, Loader2, CheckCircle2, AlertCircle, Paperclip, X,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

const ACCEPTED_EXTENSIONS = '.pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.webp,.txt,.zip,.mp3,.ogg,.m4a,.wav';
const MAX_FILE_MB = 10;

export default function ChamadoPublicoPage() {
  const params = useParams();
  const token = params.token as string;

  const [form, setForm] = useState({
    title: '', description: '', contact_name: '', contact_email: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ticketNumber, setTicketNumber] = useState('');
  const [error, setError] = useState('');

  const handleFile = (selected: File | null) => {
    setError('');
    if (selected && selected.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`Arquivo muito grande (máximo ${MAX_FILE_MB}MB).`);
      return;
    }
    setFile(selected);
  };

  const submit = async () => {
    setError('');
    if (!form.title.trim() || !form.description.trim()) {
      setError('Preencha o título e a descrição do chamado.');
      return;
    }
    setSubmitting(true);
    try {
      const body = new FormData();
      body.append('title', form.title);
      body.append('description', form.description);
      if (form.contact_name) body.append('contact_name', form.contact_name);
      if (form.contact_email) body.append('contact_email', form.contact_email);
      if (file) body.append('attachment', file);

      const res = await fetch(`${API_URL}/support/public/tickets/${token}/`, {
        method: 'POST',
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setError('Muitos chamados em sequência. Aguarde um pouco e tente novamente.');
      } else if (res.status === 404) {
        setError('Link inválido ou expirado. Confirme o endereço com a nossa equipe.');
      } else if (!res.ok) {
        const msg = typeof data === 'object' && data !== null
          ? Object.values(data as Record<string, unknown>).flat().join(' ')
          : '';
        setError(msg || 'Não foi possível enviar o chamado. Tente novamente.');
      } else {
        setTicketNumber((data as { number?: string }).number || '');
      }
    } catch {
      setError('Erro de conexão. Tente novamente em instantes.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#ECECEC] dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-accent-gold tracking-tighter">Inova.</h1>
          <p className="text-[10px] font-medium text-gray-500 tracking-[0.18em] uppercase">
            Systems Solutions
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-card p-6 sm:p-8">
          {ticketNumber ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">
                Chamado recebido!
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Nossa equipe vai analisar e retornar em breve.
              </p>
              <p className="text-sm font-mono bg-gray-50 dark:bg-gray-700/50 rounded-lg py-2 px-4 inline-block text-gray-700 dark:text-gray-200">
                Protocolo: {ticketNumber}
              </p>
              <button
                onClick={() => {
                  setTicketNumber('');
                  setForm({ title: '', description: '', contact_name: '', contact_email: '' });
                  setFile(null);
                }}
                className="block mx-auto mt-6 text-sm text-accent-gold hover:underline">
                Abrir outro chamado
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-accent-gold/10 rounded-xl flex items-center justify-center">
                  <Headphones className="w-5 h-5 text-accent-gold" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-800 dark:text-gray-100">Abrir chamado de suporte</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Descreva o problema ou a dúvida — pode anexar print, vídeo ou áudio.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Título *</label>
                  <input
                    className="w-full mt-1 px-3 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl text-sm outline-none focus:border-accent-gold text-gray-800 dark:text-gray-100"
                    placeholder="Ex: Erro ao gerar relatório"
                    value={form.title}
                    maxLength={300}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Descrição *</label>
                  <textarea
                    rows={5}
                    className="w-full mt-1 px-3 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl text-sm outline-none focus:border-accent-gold resize-none text-gray-800 dark:text-gray-100"
                    placeholder="Conte o que aconteceu, desde quando, e o que você esperava que acontecesse."
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Seu nome</label>
                    <input
                      className="w-full mt-1 px-3 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl text-sm outline-none focus:border-accent-gold text-gray-800 dark:text-gray-100"
                      value={form.contact_name}
                      maxLength={200}
                      onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Seu email</label>
                    <input
                      type="email"
                      className="w-full mt-1 px-3 py-2.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-xl text-sm outline-none focus:border-accent-gold text-gray-800 dark:text-gray-100"
                      value={form.contact_email}
                      onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} />
                  </div>
                </div>

                {/* Anexo */}
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                    Anexo (opcional — imagem, vídeo, áudio ou documento, até {MAX_FILE_MB}MB)
                  </label>
                  {file ? (
                    <div className="mt-1 flex items-center justify-between px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-gray-50 dark:bg-gray-700/50">
                      <span className="flex items-center gap-2 text-gray-700 dark:text-gray-200 truncate">
                        <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="truncate">{file.name}</span>
                      </span>
                      <button onClick={() => handleFile(null)} aria-label="Remover anexo">
                        <X className="w-4 h-4 text-gray-400 hover:text-red-500" />
                      </button>
                    </div>
                  ) : (
                    <label className="mt-1 flex items-center gap-2 px-3 py-2.5 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-400 dark:text-gray-500 cursor-pointer hover:border-accent-gold hover:text-accent-gold transition-colors">
                      <Paperclip className="w-4 h-4" />
                      Clique para anexar um arquivo
                      <input
                        type="file"
                        className="hidden"
                        accept={ACCEPTED_EXTENSIONS}
                        onChange={e => handleFile(e.target.files?.[0] || null)} />
                    </label>
                  )}
                </div>

                {error && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl text-sm text-red-600 dark:text-red-400">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  onClick={submit}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent-gold text-white rounded-xl text-sm font-semibold hover:bg-accent-gold-dark disabled:opacity-60 transition-colors">
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {submitting ? 'Enviando...' : 'Enviar chamado'}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-[11px] text-gray-400 dark:text-gray-500 mt-4">
          Inova Systems Solutions · Canal oficial de suporte
        </p>
      </div>
    </div>
  );
}
