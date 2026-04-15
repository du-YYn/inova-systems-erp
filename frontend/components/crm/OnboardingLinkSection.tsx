'use client';

import { useState, useCallback } from 'react';
import { FileText, Copy, Check, Loader2, ExternalLink } from 'lucide-react';
import api from '@/lib/api';

interface OnboardingInfo {
  id: number;
  public_token: string;
  status: string;
  submitted_at: string | null;
  company_legal_name: string;
  rep_full_name: string;
}

interface Props {
  prospectId: number;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendente', color: 'bg-yellow-900/30 text-yellow-400 border-yellow-800/50' },
  submitted: { label: 'Preenchido', color: 'bg-emerald-900/30 text-emerald-400 border-emerald-800/50' },
  reviewed: { label: 'Revisado', color: 'bg-blue-900/30 text-blue-400 border-blue-800/50' },
};

export default function OnboardingLinkSection({ prospectId }: Props) {
  const [onboarding, setOnboarding] = useState<OnboardingInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const createOnboarding = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.post<OnboardingInfo>(`/sales/prospects/${prospectId}/create-onboarding/`);
      setOnboarding(data);
    } catch {
      setError('Erro ao gerar cadastro.');
    }
    setLoading(false);
  }, [prospectId]);

  const copyLink = useCallback(async () => {
    if (!onboarding) return;
    const link = `https://${process.env.NEXT_PUBLIC_ONBOARDING_HOST || 'cadastro.inovasystemssolutions.com'}/${onboarding.public_token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = link;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [onboarding]);

  // Not yet created — show action button
  if (!onboarding) {
    return (
      <div className="border border-dashed border-slate-600 dark:border-slate-700 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent-gold" />
            <span className="text-sm font-medium text-slate-300">Cadastro do Cliente</span>
          </div>
          <button
            onClick={createOnboarding}
            disabled={loading}
            className="px-3 py-1.5 bg-accent-gold/10 hover:bg-accent-gold/20 text-accent-gold text-xs font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {loading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Gerando...
              </>
            ) : (
              'Gerar Cadastro'
            )}
          </button>
        </div>
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      </div>
    );
  }

  // Created — show link + status
  const statusInfo = STATUS_MAP[onboarding.status] || STATUS_MAP.pending;

  return (
    <div className="border border-slate-700 dark:border-slate-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-accent-gold" />
          <span className="text-sm font-medium text-slate-300">Cadastro do Cliente</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
      </div>

      {/* Link + Copy */}
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-slate-900 dark:bg-slate-900 rounded-lg px-3 py-2 text-xs text-slate-400 font-mono truncate">
          {process.env.NEXT_PUBLIC_ONBOARDING_HOST || 'cadastro.inovasystemssolutions.com'}/{onboarding.public_token}
        </div>
        <button
          onClick={copyLink}
          className="p-2 bg-accent-gold/10 hover:bg-accent-gold/20 text-accent-gold rounded-lg transition-colors shrink-0"
          title="Copiar link"
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
        <a
          href={`https://${process.env.NEXT_PUBLIC_ONBOARDING_HOST || 'cadastro.inovasystemssolutions.com'}/${onboarding.public_token}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors shrink-0"
          title="Abrir formulário"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Submitted info */}
      {onboarding.status !== 'pending' && onboarding.company_legal_name && (
        <div className="text-xs text-slate-500 space-y-0.5">
          <p>Empresa: <span className="text-slate-300">{onboarding.company_legal_name}</span></p>
          {onboarding.rep_full_name && (
            <p>Representante: <span className="text-slate-300">{onboarding.rep_full_name}</span></p>
          )}
          {onboarding.submitted_at && (
            <p>Preenchido em: <span className="text-slate-300">
              {new Date(onboarding.submitted_at).toLocaleDateString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </span></p>
          )}
        </div>
      )}
    </div>
  );
}
