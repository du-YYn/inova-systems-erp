'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, MiniMap, ReactFlow, ReactFlowProvider, type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Move, StickyNote, X } from 'lucide-react';
import type { CanvasJson, ConfigJson, TimelineJson } from '@/lib/presentations/types';
import { PlayerCardNode } from './PlayerCardNode';
import { PlayerCardEdge } from './PlayerCardEdge';
import { computeStages } from './stages';

const nodeTypes = { card: PlayerCardNode, playerCard: PlayerCardNode };
const edgeTypes = { card: PlayerCardEdge };

export interface PlayerCoreProps {
  name: string;
  canvas: CanvasJson;
  timeline: TimelineJson;
  config: ConfigJson;
  onExit: () => void;
  allowFreeMode?: boolean;
}

export function PlayerCore(props: PlayerCoreProps) {
  return (
    <div className="presentations-dark">
      <ReactFlowProvider>
        <PlayerInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}

function PlayerInner({ canvas, timeline, config, onExit, allowFreeMode = true }: PlayerCoreProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [freeMode, setFreeMode] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const rfRef = useRef<ReactFlowInstance<any, any> | null>(null);
  const scrollLockRef = useRef(false);

  const steps = timeline.passos;
  const currentStep = steps[stepIndex];
  const total = steps.length;

  const { playerNodes, playerEdges, visibleUpTo } = useMemo(
    () => computeStages(canvas.nos, canvas.arestas, steps, stepIndex),
    [canvas.nos, canvas.arestas, steps, stepIndex],
  );

  const applyCamera = useCallback(() => {
    const rf = rfRef.current;
    if (!rf || !currentStep || freeMode) return;

    const { camera } = currentStep;
    const duration = camera.transicao_ms;
    const visibleIds = canvas.nos.filter((n) => visibleUpTo.has(n.id)).map((n) => ({ id: n.id }));

    setTimeout(async () => {
      if (camera.modo === 'livre') return;

      if (camera.modo === 'foco-card' && camera.target) {
        const target = canvas.nos.find((n) => n.id === camera.target);
        if (target) {
          const w = target.measured?.width ?? 260;
          const h = target.measured?.height ?? 140;
          rf.setCenter(target.position.x + w / 2, target.position.y + h / 2,
            { zoom: camera.zoom, duration });
        }
        return;
      }

      if (camera.modo === 'zoom-area') {
        const entering = canvas.nos.filter((n) => currentStep.elementos_entrando.includes(n.id));
        if (entering.length > 0) {
          rf.fitView({ nodes: entering.map((n) => ({ id: n.id })), padding: 0.3, duration });
        }
        return;
      }

      if (camera.modo === 'travelling' && visibleIds.length > 0) {
        const zoomOutDur = Math.round(duration * 0.45);
        const zoomInDur  = duration - zoomOutDur;
        rf.fitView({ nodes: visibleIds, padding: 1.2, duration: zoomOutDur });
        await new Promise((r) => setTimeout(r, zoomOutDur + 50));
        rf.fitView({ nodes: visibleIds, padding: 0.2, duration: zoomInDur });
        return;
      }

      if (visibleIds.length > 0) {
        rf.fitView({ nodes: visibleIds, padding: 0.2, duration });
      }
    }, 30);
  }, [currentStep, canvas.nos, visibleUpTo, freeMode]);

  useEffect(() => { applyCamera(); }, [stepIndex, applyCamera]);

  const next = useCallback(() => setStepIndex((i) => Math.min(i + 1, Math.max(total - 1, 0))), [total]);
  const prev = useCallback(() => setStepIndex((i) => Math.max(i - 1, 0)), []);
  const toggleFree = useCallback(() => {
    if (!allowFreeMode) return;
    setFreeMode((v) => {
      if (v) setTimeout(() => applyCamera(), 50);
      return !v;
    });
  }, [applyCamera, allowFreeMode]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); prev(); }
      else if (e.key === 'Home') { e.preventDefault(); setStepIndex(0); }
      else if (e.key === 'End')  { e.preventDefault(); setStepIndex(Math.max(total - 1, 0)); }
      else if (e.key === 'Escape') { e.preventDefault(); onExit(); }
      else if (e.key.toLowerCase() === 'm' && allowFreeMode && timeline.config_global.permite_modo_livre) { e.preventDefault(); toggleFree(); }
      else if (e.key.toLowerCase() === 'n') { e.preventDefault(); setShowNotes((v) => !v); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, onExit, toggleFree, total, allowFreeMode, timeline.config_global.permite_modo_livre]);

  useEffect(() => {
    function onWheel(e: WheelEvent) {
      if (freeMode || scrollLockRef.current || Math.abs(e.deltaY) < 20) return;
      scrollLockRef.current = true;
      if (e.deltaY > 0) next(); else prev();
      setTimeout(() => { scrollLockRef.current = false; }, 600);
    }
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => window.removeEventListener('wheel', onWheel);
  }, [freeMode, next, prev]);

  if (total === 0) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-[color:var(--pr-bg)]">
        <div className="text-xl font-light max-w-md text-center text-[color:var(--pr-text-secondary)]">
          Esta apresentação ainda não tem passos configurados.
        </div>
        <button
          onClick={onExit}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[color:var(--pr-gold)] text-[color:var(--pr-gold)] text-sm hover:bg-[color:var(--pr-gold)]/10"
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
            config.logo_cliente_posicao === 'topo-esquerda' ? 'top-6 left-6' :
            config.logo_cliente_posicao === 'topo-direita'  ? 'top-6 right-6' :
            'bottom-6 left-1/2 -translate-x-1/2'
          }`}
        />
      )}

      <ReactFlow
        nodes={playerNodes}
        edges={playerEdges.map((e) => ({ ...e, type: 'card' }))}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={(inst) => { rfRef.current = inst; setTimeout(() => applyCamera(), 100); }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={freeMode}
        panOnScroll={false}
        zoomOnScroll={freeMode}
        zoomOnPinch={freeMode}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        proOptions={{ hideAttribution: true }}
        className="!bg-transparent"
      >
        <Background color="#1f1f2e" gap={24} size={1} />
        {freeMode && (
          <MiniMap pannable zoomable maskColor="rgba(8,8,14,0.8)"
            className="!bg-[color:var(--pr-bg-elevated)] !border !border-[color:var(--pr-border)]" />
        )}
      </ReactFlow>

      <button
        onClick={onExit}
        className="absolute top-6 left-6 z-40 p-2 rounded-md text-[color:var(--pr-text-tertiary)] hover:text-[color:var(--pr-text-primary)] bg-[color:var(--pr-bg-elevated)]/80 backdrop-blur-sm border border-[color:var(--pr-border)]"
        title="Sair (ESC)"
      >
        <X size={16} />
      </button>

      {freeMode && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-md bg-[color:var(--pr-gold)]/10 border border-[color:var(--pr-gold)]/40 text-[color:var(--pr-gold)] text-xs uppercase tracking-widest flex items-center gap-2">
          <Move size={12} /> Modo livre — pressione M para retomar
        </div>
      )}

      {timeline.config_global.mostrar_indicador_progresso && (
        <ProgressBar current={stepIndex + 1} total={total} color={config.cor_acento} />
      )}

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2">
        <button
          onClick={prev} disabled={stepIndex === 0}
          className="p-2.5 rounded-full bg-[color:var(--pr-bg-elevated)]/80 backdrop-blur-sm border border-[color:var(--pr-border)] text-[color:var(--pr-text-secondary)] hover:text-[color:var(--pr-text-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
          title="Anterior (←)"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="px-4 py-2 rounded-full bg-[color:var(--pr-bg-elevated)]/80 backdrop-blur-sm border border-[color:var(--pr-border)] text-xs uppercase tracking-widest">
          <span className="text-[color:var(--pr-gold)] font-medium">{String(stepIndex + 1).padStart(2, '0')}</span>
          <span className="text-[color:var(--pr-text-tertiary)]"> / {String(total).padStart(2, '0')}</span>
          {currentStep && <span className="ml-3 text-[color:var(--pr-text-secondary)] normal-case tracking-normal">{currentStep.titulo}</span>}
        </div>
        <button
          onClick={next} disabled={stepIndex >= total - 1}
          className="p-2.5 rounded-full bg-[color:var(--pr-bg-elevated)]/80 backdrop-blur-sm border border-[color:var(--pr-border)] text-[color:var(--pr-text-secondary)] hover:text-[color:var(--pr-text-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
          title="Próximo (→)"
        >
          <ChevronRight size={16} />
        </button>
        {currentStep?.narracao_apresentador && (
          <button
            onClick={() => setShowNotes((v) => !v)}
            className={`p-2.5 rounded-full backdrop-blur-sm border transition-colors ${
              showNotes
                ? 'bg-[color:var(--pr-gold)]/10 border-[color:var(--pr-gold)] text-[color:var(--pr-gold)]'
                : 'bg-[color:var(--pr-bg-elevated)]/80 border-[color:var(--pr-border)] text-[color:var(--pr-text-tertiary)] hover:text-[color:var(--pr-text-primary)]'
            }`}
            title="Notas (N)"
          >
            <StickyNote size={16} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {showNotes && currentStep?.narracao_apresentador && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 z-40 max-w-2xl w-full px-6"
          >
            <div className="bg-[color:var(--pr-bg-elevated)]/95 backdrop-blur-sm border border-[color:var(--pr-gold)]/30 rounded-lg p-5 text-sm leading-relaxed text-[color:var(--pr-text-secondary)]">
              <div className="pr-label-caps mb-2 text-[color:var(--pr-gold)]">Narração</div>
              {currentStep.narracao_apresentador}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProgressBar({ current, total, color }: { current: number; total: number; color: string }) {
  const pct = (current / total) * 100;
  return (
    <div className="absolute top-0 left-0 right-0 h-0.5 z-30 bg-[color:var(--pr-border)]/40">
      <motion.div
        className="h-full"
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        style={{ background: color }}
      />
    </div>
  );
}
