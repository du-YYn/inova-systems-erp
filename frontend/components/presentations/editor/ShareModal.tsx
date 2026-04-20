'use client';

import { useEffect, useState } from 'react';
import { Ban, Check, Copy, Eye, Lock, Plus, Trash2 } from 'lucide-react';
import { createLink, deleteLink, listLinks, revokeLink } from '@/lib/presentations/api';
import { formatDateTime } from '@/lib/presentations/format';
import type { PublicLink } from '@/lib/presentations/types';
import { Modal } from './Modal';
import { PButton } from './buttons';

interface Props {
  open: boolean;
  onClose: () => void;
  presentationId: string;
}

export function ShareModal({ open, onClose, presentationId }: Props) {
  const [links, setLinks] = useState<PublicLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [password, setPassword] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await listLinks(presentationId);
      setLinks(data.results);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) { load(); setShowForm(false); setCopied(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presentationId]);

  async function onCreate() {
    if (!label.trim()) { setError('Informe um rótulo'); return; }
    setCreating(true);
    setError(null);
    try {
      await createLink({
        presentation: presentationId,
        label: label.trim(),
        password: password || null,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      setLabel(''); setPassword(''); setExpiresAt('');
      setShowForm(false);
      await load();
    } catch {
      setError('Erro ao criar link');
    } finally {
      setCreating(false);
    }
  }

  async function onRevoke(id: string) {
    if (!confirm('Revogar este link? O cliente não conseguirá mais acessar.')) return;
    await revokeLink(id);
    await load();
  }

  async function onDelete(id: string) {
    if (!confirm('Excluir permanentemente? Isso também remove o histórico de acessos.')) return;
    await deleteLink(id);
    await load();
  }

  function urlFor(token: string) {
    return `${window.location.origin}/p/${token}`;
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(urlFor(token));
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* ignore */ }
  }

  return (
    <Modal open={open} title="Compartilhar" onClose={onClose} footer={<PButton variant="ghost" onClick={onClose}>Fechar</PButton>}>
      <div className="flex flex-col gap-4 min-w-[540px]">
        <div className="flex items-center justify-between">
          <div className="text-xs text-[color:var(--pr-text-tertiary)]">
            {links.length} {links.length === 1 ? 'link' : 'links'}
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs uppercase tracking-widest border border-[color:var(--pr-border)] text-[color:var(--pr-text-secondary)] hover:border-[color:var(--pr-gold)] hover:text-[color:var(--pr-gold)] transition-colors"
          >
            <Plus size={12} /> Novo link
          </button>
        </div>

        {showForm && (
          <div className="bg-[color:var(--pr-bg-elevated)] border border-[color:var(--pr-border)] rounded-lg p-4 flex flex-col gap-3">
            <Field label="Rótulo (interno)" value={label} onChange={setLabel} placeholder="Ex: Ezequiel Baú — proposta ERP" error={error} />
            <Field label="Senha (opcional)" value={password} onChange={setPassword} type="password" placeholder="Deixe vazio para acesso sem senha" />
            <div className="flex flex-col gap-1.5">
              <label className="pr-label-caps">Expiração (opcional)</label>
              <input
                type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
                className="bg-[color:var(--pr-bg)] border border-[color:var(--pr-border)] rounded-md px-3 py-2 text-sm focus:border-[color:var(--pr-gold)] transition-colors"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <PButton variant="ghost" onClick={() => setShowForm(false)}>Cancelar</PButton>
              <PButton onClick={onCreate} disabled={creating}>
                {creating ? 'Criando...' : 'Criar link'}
              </PButton>
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center text-sm text-[color:var(--pr-text-tertiary)] py-6">Carregando...</div>
        )}

        {!loading && links.length === 0 && !showForm && (
          <div className="text-center text-sm text-[color:var(--pr-text-tertiary)] py-8 border border-dashed border-[color:var(--pr-border)] rounded-md">
            Nenhum link criado ainda. Gere um para compartilhar com o cliente.
          </div>
        )}

        {!loading && links.length > 0 && (
          <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
            {links.map((l) => (
              <div
                key={l.id}
                className={`bg-[color:var(--pr-bg-elevated)] border border-[color:var(--pr-border)] rounded-lg p-3 flex flex-col gap-2 ${!l.is_active ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{l.label || '(sem rótulo)'}</span>
                      {!l.is_active && (
                        <span className="text-[10px] uppercase tracking-widest text-red-400 border border-red-400/30 rounded px-1.5 py-0.5">Revogado</span>
                      )}
                      {l.expires_at && new Date(l.expires_at) < new Date() && (
                        <span className="text-[10px] uppercase tracking-widest text-red-400 border border-red-400/30 rounded px-1.5 py-0.5">Expirado</span>
                      )}
                    </div>
                    <div className="text-xs text-[color:var(--pr-text-tertiary)] mt-0.5 truncate">
                      {urlFor(l.token)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => copy(l.token)}
                      disabled={!l.is_active}
                      className="p-2 rounded-md text-[color:var(--pr-text-tertiary)] hover:text-[color:var(--pr-gold)] hover:bg-[color:var(--pr-bg)] disabled:opacity-30 transition-colors"
                      title="Copiar URL"
                    >
                      {copied === l.token ? <Check size={14} className="text-[color:var(--pr-gold)]" /> : <Copy size={14} />}
                    </button>
                    {l.is_active && (
                      <button
                        onClick={() => onRevoke(l.id)}
                        className="p-2 rounded-md text-[color:var(--pr-text-tertiary)] hover:text-red-400 hover:bg-[color:var(--pr-bg)] transition-colors"
                        title="Revogar"
                      >
                        <Ban size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(l.id)}
                      className="p-2 rounded-md text-[color:var(--pr-text-tertiary)] hover:text-red-400 hover:bg-[color:var(--pr-bg)] transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-[11px] text-[color:var(--pr-text-tertiary)]">
                  <span className="inline-flex items-center gap-1" title="Visualizações">
                    <Eye size={11} /> {l.total_views} {l.total_views === 1 ? 'view' : 'views'}
                  </span>
                  {l.last_access_at && <span>Último: {formatDateTime(l.last_access_at)}</span>}
                  {l.password_protected && (
                    <span className="inline-flex items-center gap-1 text-[color:var(--pr-gold)]">
                      <Lock size={11} /> protegido
                    </span>
                  )}
                  {l.expires_at && <span>Expira em {formatDateTime(l.expires_at)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Field({ label, value, onChange, placeholder, type, error }:
  { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; error?: string | null }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="pr-label-caps">{label}</label>
      <input
        type={type ?? 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-[color:var(--pr-bg)] border border-[color:var(--pr-border)] rounded-md px-3 py-2 text-sm focus:border-[color:var(--pr-gold)] transition-colors"
      />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
