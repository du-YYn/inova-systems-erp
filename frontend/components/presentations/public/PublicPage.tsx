'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { Lock, Play, Share2 } from 'lucide-react';
import {
  DEFAULT_CONFIG, DEFAULT_TIMELINE, EMPTY_CANVAS,
  type CanvasJson, type ConfigJson, type TimelineJson,
} from '@/lib/presentations/types';
import {
  fetchPublicContent, fetchPublicMeta, heartbeatPublic, unlockPublic,
  type PublicContent, type PublicMeta,
} from '@/lib/presentations/api';
import { PlayerCore } from '../player/PlayerCore';

type State = 'loading' | 'error' | 'password' | 'intro' | 'playing' | 'done';

const MESSAGES: Record<string, string> = {
  'not-found':         'Link não encontrado.',
  'revoked':           'Este link foi revogado.',
  'expired':           'Este link expirou.',
  'invalid-password':  'Senha incorreta.',
};

export function PublicPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? null;

  const [state, setState] = useState<State>('loading');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [meta, setMeta] = useState<PublicMeta | null>(null);
  const [content, setContent] = useState<PublicContent | null>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setState('error'); setErrorCode('not-found'); return; }
    (async () => {
      try {
        const m = await fetchPublicMeta(token);
        setMeta(m);
        if (m.password_required) {
          setState('password');
        } else {
          const c = await fetchPublicContent(token);
          setContent(c);
          setState('intro');
        }
      } catch (err: unknown) {
        const code = (err as { body?: { error?: string } })?.body?.error ?? 'not-found';
        setErrorCode(code);
        setState('error');
      }
    })();
  }, [token]);

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setPasswordError(null);
    try {
      const c = await unlockPublic(token, password);
      setContent(c);
      setState('intro');
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      setPasswordError(status === 401 ? 'Senha incorreta' : 'Erro ao validar senha');
    } finally {
      setSubmitting(false);
    }
  }

  if (state === 'loading') return <Shell><Muted>Carregando...</Muted></Shell>;
  if (state === 'error')   return <ErrorScreen code={errorCode} />;

  if (state === 'password') {
    return (
      <Shell>
        <div className="w-full max-w-sm text-center">
          <div className="pr-label-caps mb-3">Inova Apresentação</div>
          {meta?.client_name && (
            <div className="text-xs text-[color:var(--pr-text-tertiary)] mb-2">{meta.client_name}</div>
          )}
          <h1 className="text-2xl font-light tracking-tight">{meta?.name}</h1>
          <div className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[color:var(--pr-gold)]/40 text-[color:var(--pr-gold)] text-xs uppercase tracking-widest">
            <Lock size={12} /> Conteúdo protegido
          </div>
          <form onSubmit={submitPassword} className="flex flex-col gap-4 mt-8">
            <div className="flex flex-col gap-1.5">
              <label className="pr-label-caps text-left">Senha</label>
              <input
                type="password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus required
                className="bg-[color:var(--pr-bg-elevated)] border border-[color:var(--pr-border)] rounded-md px-3 py-2.5 text-sm focus:border-[color:var(--pr-gold)]"
              />
              {passwordError && <span className="text-xs text-red-400 text-left">{passwordError}</span>}
            </div>
            <button
              type="submit" disabled={submitting}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-[color:var(--pr-gold)] text-[color:var(--pr-bg)] text-sm font-medium hover:bg-[color:var(--pr-gold-soft)] disabled:opacity-40"
            >
              {submitting ? 'Validando...' : 'Acessar'}
            </button>
          </form>
        </div>
      </Shell>
    );
  }

  if (state === 'intro' && content && meta) {
    return <IntroScreen meta={meta} onStart={() => setState('playing')} />;
  }

  if (state === 'playing' && content && token) {
    return (
      <HeartbeatWrapper token={token} sessionId={content.session_id}>
        <PlayerCore
          name={content.name}
          canvas={{ ...EMPTY_CANVAS,     ...(content.canvas_json   as unknown as CanvasJson) }}
          timeline={{ ...DEFAULT_TIMELINE, ...(content.timeline_json as unknown as TimelineJson) }}
          config={{ ...DEFAULT_CONFIG,   ...(content.config_json   as unknown as ConfigJson) }}
          onExit={() => setState('done')}
          allowFreeMode={false}
        />
      </HeartbeatWrapper>
    );
  }

  if (state === 'done' && meta) {
    return <DoneScreen meta={meta} onReplay={() => setState('playing')} />;
  }

  return null;
}

function HeartbeatWrapper({ token, sessionId, children }: { token: string; sessionId: number; children: ReactNode }) {
  const startRef = useRef(Date.now());
  useEffect(() => {
    const interval = setInterval(() => {
      const duration = Math.round((Date.now() - startRef.current) / 1000);
      heartbeatPublic(token, sessionId, duration);
    }, 15000);
    const onUnload = () => {
      const duration = Math.round((Date.now() - startRef.current) / 1000);
      const base = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';
      navigator.sendBeacon(
        `${base}/public-presentations/${token}/heartbeat/`,
        new Blob([JSON.stringify({ session_id: sessionId, duration_seconds: duration })], { type: 'application/json' }),
      );
    };
    window.addEventListener('beforeunload', onUnload);
    return () => { clearInterval(interval); window.removeEventListener('beforeunload', onUnload); onUnload(); };
  }, [token, sessionId]);
  return <>{children}</>;
}

function IntroScreen({ meta, onStart }: { meta: PublicMeta; onStart: () => void }) {
  return (
    <Shell>
      <div className="w-full max-w-2xl text-center">
        <div className="pr-label-caps mb-4">Inova Systems Solutions</div>
        {meta.client_name && (
          <div className="text-xs text-[color:var(--pr-text-tertiary)] mb-3 uppercase tracking-widest">
            para {meta.client_name}
          </div>
        )}
        <h1 className="text-4xl font-light tracking-tight leading-tight">{meta.name}</h1>
        {meta.thumbnail_url && (
          <div className="mt-10 rounded-lg overflow-hidden border border-[color:var(--pr-border)] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
            <img src={meta.thumbnail_url} alt="" className="w-full object-cover" />
          </div>
        )}
        <p className="mt-8 text-sm text-[color:var(--pr-text-secondary)] leading-relaxed">
          Esta é uma apresentação interativa. Use as setas do teclado, scroll do mouse ou barra de espaço para avançar.
        </p>
        <button
          onClick={onStart}
          className="mt-8 inline-flex items-center gap-2 px-8 py-3 rounded-md bg-[color:var(--pr-gold)] text-[color:var(--pr-bg)] font-medium text-sm uppercase tracking-widest hover:bg-[color:var(--pr-gold-soft)] transition-colors"
        >
          <Play size={14} /> Começar apresentação
        </button>
      </div>
    </Shell>
  );
}

function DoneScreen({ meta, onReplay }: { meta: PublicMeta; onReplay: () => void }) {
  return (
    <Shell>
      <div className="w-full max-w-md text-center">
        <div className="pr-label-caps mb-3">Fim da apresentação</div>
        <h1 className="text-2xl font-light tracking-tight">{meta.name}</h1>
        <p className="mt-6 text-sm text-[color:var(--pr-text-secondary)] leading-relaxed">
          Obrigado por assistir. Você pode assistir novamente ou compartilhar este link com outras pessoas da sua equipe.
        </p>
        <div className="mt-8 flex items-center gap-3 justify-center">
          <button
            onClick={onReplay}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md border border-[color:var(--pr-gold)] text-[color:var(--pr-gold)] text-sm hover:bg-[color:var(--pr-gold)]/10 transition-colors"
          >
            <Play size={14} /> Assistir novamente
          </button>
          <button
            onClick={() => { navigator.clipboard.writeText(window.location.href).catch(() => {}); }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md border border-[color:var(--pr-border)] text-[color:var(--pr-text-secondary)] text-sm hover:text-[color:var(--pr-text-primary)] transition-colors"
          >
            <Share2 size={14} /> Copiar link
          </button>
        </div>
      </div>
    </Shell>
  );
}

function ErrorScreen({ code }: { code: string | null }) {
  const message = MESSAGES[code ?? ''] ?? 'Link inválido.';
  return (
    <Shell>
      <div className="w-full max-w-sm text-center">
        <div className="pr-label-caps mb-3 text-red-400">Erro</div>
        <h1 className="text-2xl font-light tracking-tight">{message}</h1>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="presentations-dark min-h-screen flex items-center justify-center p-6">
      {children}
    </div>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <div className="pr-label-caps text-[color:var(--pr-text-tertiary)]">{children}</div>;
}
