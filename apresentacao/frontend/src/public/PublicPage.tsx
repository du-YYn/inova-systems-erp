import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { AxiosError } from "axios";
import { Lock, Play, Share2 } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import {
  DEFAULT_CONFIG,
  DEFAULT_TIMELINE,
  EMPTY_CANVAS,
  type CanvasJson,
  type ConfigJson,
  type TimelineJson,
} from "@/editor/types";
import { PlayerCore } from "@/player/PlayerCore";
import {
  fetchPublicContent,
  fetchPublicMeta,
  heartbeatPublic,
  unlockPublic,
  type PublicContent,
  type PublicMeta,
} from "@/api/public";

type Estado = "carregando" | "erro" | "senha" | "intro" | "apresentando" | "finalizado";

export function PublicPage() {
  const { token } = useParams<{ token: string }>();
  const [estado, setEstado] = useState<Estado>("carregando");
  const [erroTipo, setErroTipo] = useState<string | null>(null);
  const [meta, setMeta] = useState<PublicMeta | null>(null);
  const [content, setContent] = useState<PublicContent | null>(null);
  const [senha, setSenha] = useState("");
  const [senhaErro, setSenhaErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!token) { setEstado("erro"); setErroTipo("nao-encontrado"); return; }
    (async () => {
      try {
        const m = await fetchPublicMeta(token);
        setMeta(m);
        if (m.precisa_senha) {
          setEstado("senha");
        } else {
          const c = await fetchPublicContent(token);
          setContent(c);
          setEstado("intro");
        }
      } catch (err) {
        const ax = err as AxiosError<{ erro?: string }>;
        setErroTipo(ax.response?.data?.erro ?? "nao-encontrado");
        setEstado("erro");
      }
    })();
  }, [token]);

  async function submitSenha(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setEnviando(true);
    setSenhaErro(null);
    try {
      const c = await unlockPublic(token, senha);
      setContent(c);
      setEstado("intro");
    } catch (err) {
      const ax = err as AxiosError<{ erro?: string }>;
      if (ax.response?.status === 401) {
        setSenhaErro("Senha incorreta");
      } else {
        setSenhaErro("Erro ao validar senha");
      }
    } finally {
      setEnviando(false);
    }
  }

  if (estado === "carregando") {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-xs label-caps text-[color:var(--color-text-tertiary)]">Carregando...</div>
      </div>
    );
  }

  if (estado === "erro") {
    return <TelaErro tipo={erroTipo} />;
  }

  if (estado === "senha") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-10 text-center">
            <div className="label-caps mb-3">Inova Apresentação</div>
            {meta?.cliente_nome && (
              <div className="text-xs text-[color:var(--color-text-tertiary)] mb-2">
                {meta.cliente_nome}
              </div>
            )}
            <h1 className="text-2xl font-light tracking-tight">{meta?.nome}</h1>
            <div className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-[color:var(--color-gold)]/40 text-[color:var(--color-gold)] text-xs uppercase tracking-widest">
              <Lock size={12} /> Conteúdo protegido
            </div>
          </div>
          <form onSubmit={submitSenha} className="flex flex-col gap-4">
            <Input
              label="Senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoFocus
              required
              error={senhaErro ?? undefined}
            />
            <Button type="submit" disabled={enviando} className="mt-2 justify-center">
              {enviando ? "Validando..." : "Acessar"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (estado === "intro" && content && meta) {
    return <IntroScreen meta={meta} onStart={() => setEstado("apresentando")} />;
  }

  if (estado === "apresentando" && content && token) {
    return (
      <HeartbeatWrapper token={token} sessaoId={content.sessao_id}>
        <PlayerCore
          nome={content.nome}
          canvas={{ ...EMPTY_CANVAS, ...(content.canvas_json as unknown as CanvasJson) }}
          timeline={{ ...DEFAULT_TIMELINE, ...(content.timeline_json as unknown as TimelineJson) }}
          config={{ ...DEFAULT_CONFIG, ...(content.config_json as unknown as ConfigJson) }}
          onExit={() => setEstado("finalizado")}
          permitirModoLivre={false}
        />
      </HeartbeatWrapper>
    );
  }

  if (estado === "finalizado" && meta) {
    return <FinalScreen meta={meta} onReplay={() => setEstado("apresentando")} />;
  }

  return null;
}

function HeartbeatWrapper({ token, sessaoId, children }: { token: string; sessaoId: number; children: React.ReactNode }) {
  const inicioRef = useRef(Date.now());
  useEffect(() => {
    const interval = setInterval(() => {
      const duracao = Math.round((Date.now() - inicioRef.current) / 1000);
      heartbeatPublic(token, sessaoId, duracao);
    }, 15000);
    const onUnload = () => {
      const duracao = Math.round((Date.now() - inicioRef.current) / 1000);
      navigator.sendBeacon(
        `${import.meta.env.VITE_API_URL ?? "http://localhost:8000/api"}/public/${token}/heartbeat/`,
        new Blob([JSON.stringify({ sessao_id: sessaoId, duracao_segundos: duracao })], { type: "application/json" }),
      );
    };
    window.addEventListener("beforeunload", onUnload);
    return () => { clearInterval(interval); window.removeEventListener("beforeunload", onUnload); onUnload(); };
  }, [token, sessaoId]);
  return <>{children}</>;
}

function IntroScreen({ meta, onStart }: { meta: PublicMeta; onStart: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-2xl text-center">
        <div className="label-caps mb-4">Inova Systems Solutions</div>
        {meta.cliente_nome && (
          <div className="text-xs text-[color:var(--color-text-tertiary)] mb-3 uppercase tracking-widest">
            para {meta.cliente_nome}
          </div>
        )}
        <h1 className="text-4xl font-light tracking-tight leading-tight">
          {meta.nome}
        </h1>
        {meta.thumbnail_url && (
          <div className="mt-10 rounded-lg overflow-hidden border border-[color:var(--color-border)] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
            <img src={meta.thumbnail_url} alt="" className="w-full object-cover" />
          </div>
        )}
        <p className="mt-8 text-sm text-[color:var(--color-text-secondary)] leading-relaxed">
          Esta é uma apresentação interativa. Use as setas do teclado, scroll do mouse ou barra de espaço para avançar.
        </p>
        <button
          onClick={onStart}
          className="mt-8 inline-flex items-center gap-2 px-8 py-3 rounded-md bg-[color:var(--color-gold)] text-[color:var(--color-bg)] font-medium text-sm uppercase tracking-widest hover:bg-[color:var(--color-gold-soft)] transition-colors"
        >
          <Play size={14} /> Começar apresentação
        </button>
      </div>
    </div>
  );
}

function FinalScreen({ meta, onReplay }: { meta: PublicMeta; onReplay: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="label-caps mb-3">Fim da apresentação</div>
        <h1 className="text-2xl font-light tracking-tight">{meta.nome}</h1>
        <p className="mt-6 text-sm text-[color:var(--color-text-secondary)] leading-relaxed">
          Obrigado por assistir. Você pode assistir novamente ou compartilhar este link com outras pessoas da sua equipe.
        </p>
        <div className="mt-8 flex items-center gap-3 justify-center">
          <button
            onClick={onReplay}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md border border-[color:var(--color-gold)] text-[color:var(--color-gold)] text-sm hover:bg-[color:var(--color-gold)]/10 transition-colors"
          >
            <Play size={14} /> Assistir novamente
          </button>
          <button
            onClick={() => { navigator.clipboard.writeText(window.location.href).catch(() => {}); }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] text-sm hover:text-[color:var(--color-text-primary)] transition-colors"
          >
            <Share2 size={14} /> Copiar link
          </button>
        </div>
      </div>
    </div>
  );
}

function TelaErro({ tipo }: { tipo: string | null }) {
  const msg: Record<string, { titulo: string; texto: string }> = {
    "nao-encontrado": { titulo: "Link não encontrado", texto: "Este link pode ter sido digitado errado ou foi removido." },
    "revogado":       { titulo: "Link revogado",       texto: "Este link foi desativado pela pessoa que o compartilhou." },
    "expirado":       { titulo: "Link expirado",       texto: "Este link ultrapassou a data de validade." },
  };
  const m = msg[tipo ?? ""] ?? msg["nao-encontrado"];
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <div className="label-caps mb-3 text-red-400">Erro</div>
        <h1 className="text-2xl font-light tracking-tight">{m.titulo}</h1>
        <p className="mt-4 text-sm text-[color:var(--color-text-secondary)]">{m.texto}</p>
      </div>
    </div>
  );
}
