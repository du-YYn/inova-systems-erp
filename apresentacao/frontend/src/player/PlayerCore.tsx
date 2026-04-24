import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Move, StickyNote, X } from "lucide-react";
import type { CanvasJson, ConfigJson, TimelineJson } from "@/editor/types";
import { PlayerCardNode } from "./PlayerCardNode";
import { PlayerCardEdge } from "./PlayerCardEdge";
import { computarEstagios } from "./stages";

const nodeTypes = { card: PlayerCardNode, playerCard: PlayerCardNode };
const edgeTypes = { card: PlayerCardEdge };

export interface PlayerCoreProps {
  nome: string;
  canvas: CanvasJson;
  timeline: TimelineJson;
  config: ConfigJson;
  onExit: () => void;
  permitirModoLivre?: boolean;
}

export function PlayerCore(props: PlayerCoreProps) {
  return (
    <ReactFlowProvider>
      <PlayerInner {...props} />
    </ReactFlowProvider>
  );
}

function PlayerInner({ canvas, timeline, config, onExit, permitirModoLivre = true }: PlayerCoreProps) {
  const [passoIndex, setPassoIndex] = useState(0);
  const [modoLivre, setModoLivre] = useState(false);
  const [mostrarNarracao, setMostrarNarracao] = useState(false);
  const rfRef = useRef<ReactFlowInstance<any, any> | null>(null);
  const scrollLockRef = useRef(false);

  const passos = timeline.passos;
  const passoAtual = passos[passoIndex];
  const totalPassos = passos.length;

  const { playerNodes, playerEdges, ativosAte } = useMemo(
    () => computarEstagios(canvas.nos, canvas.arestas, passos, passoIndex),
    [canvas.nos, canvas.arestas, passos, passoIndex],
  );

  const aplicarCamera = useCallback(() => {
    const rf = rfRef.current;
    if (!rf || !passoAtual || modoLivre) return;

    const camera = passoAtual.camera;
    const duration = camera.transicao_ms;
    const visiveisIds = canvas.nos.filter((n) => ativosAte.has(n.id)).map((n) => ({ id: n.id }));

    setTimeout(async () => {
      if (camera.modo === "livre") return;

      if (camera.modo === "foco-card" && camera.target) {
        const alvo = canvas.nos.find((n) => n.id === camera.target);
        if (alvo) {
          const w = alvo.measured?.width ?? 260;
          const h = alvo.measured?.height ?? 140;
          rf.setCenter(alvo.position.x + w / 2, alvo.position.y + h / 2, {
            zoom: camera.zoom, duration,
          });
        }
        return;
      }

      if (camera.modo === "zoom-area") {
        const entrando = canvas.nos.filter((n) => passoAtual.elementos_entrando.includes(n.id));
        if (entrando.length > 0) {
          rf.fitView({ nodes: entrando.map((n) => ({ id: n.id })), padding: 0.3, duration });
        }
        return;
      }

      if (camera.modo === "travelling" && visiveisIds.length > 0) {
        const zoomOutDur = Math.round(duration * 0.45);
        const zoomInDur = duration - zoomOutDur;
        rf.fitView({ nodes: visiveisIds, padding: 1.2, duration: zoomOutDur });
        await new Promise((r) => setTimeout(r, zoomOutDur + 50));
        rf.fitView({ nodes: visiveisIds, padding: 0.2, duration: zoomInDur });
        return;
      }

      if (visiveisIds.length > 0) {
        rf.fitView({ nodes: visiveisIds, padding: 0.2, duration });
      }
    }, 30);
  }, [passoAtual, canvas.nos, ativosAte, modoLivre]);

  useEffect(() => { aplicarCamera(); }, [passoIndex, aplicarCamera]);

  const proximo = useCallback(() => {
    setPassoIndex((i) => Math.min(i + 1, Math.max(totalPassos - 1, 0)));
  }, [totalPassos]);

  const anterior = useCallback(() => {
    setPassoIndex((i) => Math.max(i - 1, 0));
  }, []);

  const toggleModoLivre = useCallback(() => {
    if (!permitirModoLivre) return;
    setModoLivre((v) => {
      if (v) setTimeout(() => aplicarCamera(), 50);
      return !v;
    });
  }, [aplicarCamera, permitirModoLivre]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " " || e.key === "PageDown") {
        e.preventDefault(); proximo();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault(); anterior();
      } else if (e.key === "Home") {
        e.preventDefault(); setPassoIndex(0);
      } else if (e.key === "End") {
        e.preventDefault(); setPassoIndex(Math.max(totalPassos - 1, 0));
      } else if (e.key === "Escape") {
        e.preventDefault(); onExit();
      } else if (e.key.toLowerCase() === "m" && permitirModoLivre && timeline.config_global.permite_modo_livre) {
        e.preventDefault(); toggleModoLivre();
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault(); setMostrarNarracao((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [proximo, anterior, onExit, toggleModoLivre, totalPassos, permitirModoLivre, timeline.config_global.permite_modo_livre]);

  useEffect(() => {
    function onWheel(e: WheelEvent) {
      if (modoLivre) return;
      if (scrollLockRef.current) return;
      if (Math.abs(e.deltaY) < 20) return;
      scrollLockRef.current = true;
      if (e.deltaY > 0) proximo(); else anterior();
      setTimeout(() => { scrollLockRef.current = false; }, 600);
    }
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
  }, [modoLivre, proximo, anterior]);

  if (totalPassos === 0) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-[color:var(--color-bg)]">
        <div className="text-xl font-light max-w-md text-center text-[color:var(--color-text-secondary)]">
          Esta apresentação ainda não tem passos configurados.
        </div>
        <button
          onClick={onExit}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[color:var(--color-gold)] text-[color:var(--color-gold)] text-sm hover:bg-[color:var(--color-gold)]/10"
        >
          Sair
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden relative" style={{ background: config.cor_fundo }}>
      {config.logo_cliente_url && (
        <img
          src={config.logo_cliente_url}
          alt=""
          className={`absolute z-30 h-10 object-contain pointer-events-none ${
            config.logo_cliente_posicao === "topo-esquerda" ? "top-6 left-6" :
            config.logo_cliente_posicao === "topo-direita" ? "top-6 right-6" :
            "bottom-6 left-1/2 -translate-x-1/2"
          }`}
        />
      )}

      <ReactFlow
        nodes={playerNodes}
        edges={playerEdges.map((e) => ({ ...e, type: "card" }))}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={(inst) => { rfRef.current = inst; setTimeout(() => aplicarCamera(), 100); }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={modoLivre}
        panOnScroll={false}
        zoomOnScroll={modoLivre}
        zoomOnPinch={modoLivre}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
        className="!bg-transparent"
      >
        <Background color="#1f1f2e" gap={24} size={1} />
        {modoLivre && (
          <MiniMap
            pannable zoomable
            maskColor="rgba(8,8,14,0.8)"
            className="!bg-[color:var(--color-bg-elevated)] !border !border-[color:var(--color-border)]"
          />
        )}
      </ReactFlow>

      <button
        onClick={onExit}
        className="absolute top-6 left-6 z-40 p-2 rounded-md text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)] bg-[color:var(--color-bg-elevated)]/80 backdrop-blur-sm border border-[color:var(--color-border)]"
        title="Sair (ESC)"
      >
        <X size={16} />
      </button>

      {modoLivre && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-md bg-[color:var(--color-gold)]/10 border border-[color:var(--color-gold)]/40 text-[color:var(--color-gold)] text-xs uppercase tracking-widest flex items-center gap-2">
          <Move size={12} /> Modo livre — pressione M para retomar
        </div>
      )}

      {timeline.config_global.mostrar_indicador_progresso && (
        <ProgressBar current={passoIndex + 1} total={totalPassos} cor={config.cor_acento} />
      )}

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2">
        <button
          onClick={anterior}
          disabled={passoIndex === 0}
          className="p-2.5 rounded-full bg-[color:var(--color-bg-elevated)]/80 backdrop-blur-sm border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
          title="Anterior (←)"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="px-4 py-2 rounded-full bg-[color:var(--color-bg-elevated)]/80 backdrop-blur-sm border border-[color:var(--color-border)] text-xs uppercase tracking-widest">
          <span className="text-[color:var(--color-gold)] font-medium">
            {String(passoIndex + 1).padStart(2, "0")}
          </span>
          <span className="text-[color:var(--color-text-tertiary)]"> / {String(totalPassos).padStart(2, "0")}</span>
          {passoAtual && (
            <span className="ml-3 text-[color:var(--color-text-secondary)] normal-case tracking-normal">
              {passoAtual.titulo}
            </span>
          )}
        </div>
        <button
          onClick={proximo}
          disabled={passoIndex >= totalPassos - 1}
          className="p-2.5 rounded-full bg-[color:var(--color-bg-elevated)]/80 backdrop-blur-sm border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
          title="Próximo (→)"
        >
          <ChevronRight size={16} />
        </button>
        {passoAtual?.narracao_apresentador && (
          <button
            onClick={() => setMostrarNarracao((v) => !v)}
            className={`p-2.5 rounded-full backdrop-blur-sm border transition-colors ${
              mostrarNarracao
                ? "bg-[color:var(--color-gold)]/10 border-[color:var(--color-gold)] text-[color:var(--color-gold)]"
                : "bg-[color:var(--color-bg-elevated)]/80 border-[color:var(--color-border)] text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]"
            }`}
            title="Notas (N)"
          >
            <StickyNote size={16} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {mostrarNarracao && passoAtual?.narracao_apresentador && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 max-w-2xl w-full px-6"
          >
            <div className="bg-[color:var(--color-bg-elevated)]/95 backdrop-blur-sm border border-[color:var(--color-gold)]/30 rounded-lg p-5 text-sm leading-relaxed text-[color:var(--color-text-secondary)]">
              <div className="label-caps mb-2 text-[color:var(--color-gold)]">Narração</div>
              {passoAtual.narracao_apresentador}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProgressBar({ current, total, cor }: { current: number; total: number; cor: string }) {
  const pct = (current / total) * 100;
  return (
    <div className="absolute top-0 left-0 right-0 h-0.5 z-30 bg-[color:var(--color-border)]/40">
      <motion.div
        className="h-full"
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        style={{ background: cor }}
      />
    </div>
  );
}
