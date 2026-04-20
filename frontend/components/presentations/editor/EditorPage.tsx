'use client';

import {
  useCallback, useEffect, useMemo, useRef, useState, type DragEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  addEdge, applyEdgeChanges, applyNodeChanges,
  Background, Controls, MarkerType, MiniMap, ReactFlow, ReactFlowProvider,
  type Connection, type Edge, type EdgeChange, type Node, type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft, Camera, Download, ImageIcon, LayoutGrid, Play,
  Redo2, Settings, Share2, Spline, Undo2,
} from 'lucide-react';
import { getPresentation, updatePresentation } from '@/lib/presentations/api';
import { CARD_TYPE_MAP, defaultCardData } from '@/lib/presentations/cardTypes';
import { autoLayout } from '@/lib/presentations/autoLayout';
import { useAutoSave } from '@/lib/presentations/useAutoSave';
import { useHistory } from '@/lib/presentations/useHistory';
import { exportCanvasPng, generateAndUploadThumbnail } from '@/lib/presentations/exportCanvas';
import {
  DEFAULT_CONFIG, DEFAULT_EDGE_DATA, DEFAULT_TIMELINE, EMPTY_CANVAS,
  newStep,
  type Asset, type CanvasJson, type CardData,
  type CardEdge as CardEdgeT, type CardNode as CardNodeT,
  type CardType, type ConfigJson, type EdgeData,
  type Step, type TimelineJson,
} from '@/lib/presentations/types';
import { CardNode } from './CardNode';
import { CardEdge } from './CardEdge';
import { Sidebar } from './Sidebar';
import { Inspector } from './Inspector';
import { Timeline } from './Timeline';
import { StepInspector } from './StepInspector';
import { AssetLibraryModal } from './AssetLibraryModal';
import { ConfigModal } from './ConfigModal';
import { ShareModal } from './ShareModal';

const nodeTypes = { card: CardNode };
const edgeTypes = { card: CardEdge };

function normalizeOrder(steps: Step[]): Step[] {
  return steps.map((s, i) => ({ ...s, ordem: i }));
}

interface PersistedState {
  canvas: CanvasJson;
  config: ConfigJson;
  timeline: TimelineJson;
}

export function EditorPage({ presentationId }: { presentationId: string }) {
  return (
    <div className="presentations-dark h-screen flex flex-col">
      <ReactFlowProvider>
        <EditorInner presentationId={presentationId} />
      </ReactFlowProvider>
    </div>
  );
}

function EditorInner({ presentationId }: { presentationId: string }) {
  const router = useRouter();
  const rfWrapper = useRef<HTMLDivElement>(null);
  const [rf, setRf] = useState<ReactFlowInstance<CardNodeT, CardEdgeT> | null>(null);
  const [name, setName] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [showAssets, setShowAssets] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);

  const history = useHistory<PersistedState>({
    canvas: EMPTY_CANVAS, config: DEFAULT_CONFIG, timeline: DEFAULT_TIMELINE,
  });
  const { state, push: setState, replace, undo, redo, canUndo, canRedo } = history;
  const canvas = state.canvas;
  const config = state.config;
  const timeline = state.timeline;

  const setCanvas   = useCallback((c: CanvasJson)   => setState({ ...state, canvas: c }),   [setState, state]);
  const setConfig   = useCallback((c: ConfigJson)   => setState({ ...state, config: c }),   [setState, state]);
  const setTimeline = useCallback((t: TimelineJson) => setState({ ...state, timeline: t }), [setState, state]);

  const status = useAutoSave(state, async (v) => {
    if (!loaded) return;
    await updatePresentation(presentationId, {
      canvas_json:   v.canvas   as unknown as Record<string, unknown>,
      config_json:   v.config   as unknown as Record<string, unknown>,
      timeline_json: v.timeline as unknown as Record<string, unknown>,
    });
  });

  useEffect(() => {
    (async () => {
      const data = await getPresentation(presentationId);
      setName(data.name);
      const c = (data.canvas_json   && Object.keys(data.canvas_json).length   ? data.canvas_json   : EMPTY_CANVAS)     as unknown as CanvasJson;
      const g = (data.config_json   && Object.keys(data.config_json).length   ? data.config_json   : DEFAULT_CONFIG)   as unknown as ConfigJson;
      const t = (data.timeline_json && Object.keys(data.timeline_json).length ? data.timeline_json : DEFAULT_TIMELINE) as unknown as TimelineJson;
      replace({
        canvas:   { ...EMPTY_CANVAS,     ...c },
        config:   { ...DEFAULT_CONFIG,   ...g },
        timeline: { ...DEFAULT_TIMELINE, ...t },
      });
      setLoaded(true);
    })();
  }, [presentationId, replace]);

  const onNodesChange = useCallback((changes: NodeChange<CardNodeT>[]) => {
    setCanvas({ ...canvas, nos: applyNodeChanges(changes, canvas.nos) });
  }, [canvas, setCanvas]);

  const onEdgesChange = useCallback((changes: EdgeChange<CardEdgeT>[]) => {
    setCanvas({ ...canvas, arestas: applyEdgeChanges(changes, canvas.arestas) });
  }, [canvas, setCanvas]);

  const onConnect = useCallback((conn: Connection) => {
    const newEdge: CardEdgeT = {
      id: `e-${crypto.randomUUID()}`,
      source: conn.source!,
      target: conn.target!,
      sourceHandle: conn.sourceHandle,
      targetHandle: conn.targetHandle,
      type: 'card',
      data: { ...DEFAULT_EDGE_DATA },
      markerEnd: { type: MarkerType.ArrowClosed, color: DEFAULT_EDGE_DATA.cor },
    };
    setCanvas({ ...canvas, arestas: addEdge(newEdge, canvas.arestas) as CardEdgeT[] });
  }, [canvas, setCanvas]);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    const tipo = e.dataTransfer.getData('application/inova-card') as CardType;
    if (!tipo || !rf) return;
    const position = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const node: CardNodeT = {
      id: `n-${crypto.randomUUID()}`,
      type: 'card',
      position,
      data: defaultCardData(tipo),
    };
    setCanvas({ ...canvas, nos: [...canvas.nos, node] });
  }, [rf, canvas, setCanvas]);

  function onDragOver(e: DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }

  const onSelectionChange = useCallback(({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) => {
    setSelectedNodeId(nodes[0]?.id ?? null);
    setSelectedEdgeId(edges[0]?.id ?? null);
    if (nodes.length > 0 || edges.length > 0) setCurrentStepId(null);
  }, []);

  function updateNode(id: string, patch: Partial<CardData>) {
    setCanvas({ ...canvas, nos: canvas.nos.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n) });
  }
  function updateEdge(id: string, patch: Partial<EdgeData>) {
    setCanvas({
      ...canvas,
      arestas: canvas.arestas.map((e) => {
        if (e.id !== id) return e;
        const data = { ...(e.data ?? DEFAULT_EDGE_DATA), ...patch };
        return { ...e, data, markerEnd: data.seta ? { type: MarkerType.ArrowClosed, color: data.cor } : undefined };
      }),
    });
  }
  function deleteNode(id: string) {
    setCanvas({
      ...canvas,
      nos: canvas.nos.filter((n) => n.id !== id),
      arestas: canvas.arestas.filter((e) => e.source !== id && e.target !== id),
    });
    setSelectedNodeId(null);
  }
  function deleteEdge(id: string) {
    setCanvas({ ...canvas, arestas: canvas.arestas.filter((e) => e.id !== id) });
    setSelectedEdgeId(null);
  }

  function organize() {
    const newNodes = autoLayout(canvas.nos, canvas.arestas, 'LR');
    const newEdges = canvas.arestas.map((e) => ({
      ...e,
      data: { ...(e.data ?? DEFAULT_EDGE_DATA), estilo: 'ortogonal' as const },
    }));
    setCanvas({ ...canvas, nos: newNodes, arestas: newEdges });
    setTimeout(() => rf?.fitView({ padding: 0.2, duration: 400 }), 50);
  }

  function toggleEdgeStyle() {
    const allOrthogonal = canvas.arestas.every((e) => e.data?.estilo === 'ortogonal');
    const next = allOrthogonal ? 'bezier' : 'ortogonal';
    setCanvas({
      ...canvas,
      arestas: canvas.arestas.map((e) => ({
        ...e, data: { ...(e.data ?? DEFAULT_EDGE_DATA), estilo: next },
      })),
    });
  }

  function duplicateNode() {
    if (!selectedNodeId) return;
    const source = canvas.nos.find((n) => n.id === selectedNodeId);
    if (!source) return;
    const clone: CardNodeT = {
      ...source,
      id: `n-${crypto.randomUUID()}`,
      position: { x: source.position.x + 40, y: source.position.y + 40 },
      data: { ...source.data, bullets: [...source.data.bullets] },
      selected: false,
    };
    setCanvas({ ...canvas, nos: [...canvas.nos, clone] });
  }
  function selectAll() {
    setCanvas({
      ...canvas,
      nos: canvas.nos.map((n) => ({ ...n, selected: true })),
      arestas: canvas.arestas.map((e) => ({ ...e, selected: true })),
    });
  }

  function onAssetSelected(asset: Asset | null) {
    if (!selectedNodeId) return;
    if (!asset) {
      updateNode(selectedNodeId, { logo_asset_id: null, logo_url: null });
    } else {
      updateNode(selectedNodeId, { logo_asset_id: asset.id, logo_url: asset.file });
    }
    setShowAssets(false);
  }

  // ── timeline operations ─────────────────────────────────────────────────────
  function addStep() {
    const s = newStep(timeline.passos.length);
    setTimeline({ ...timeline, passos: [...timeline.passos, s] });
    setCurrentStepId(s.id);
  }
  function updateStep(id: string, patch: Partial<Step>) {
    setTimeline({ ...timeline, passos: timeline.passos.map((p) => p.id === id ? { ...p, ...patch } : p) });
  }
  function duplicateStep(id: string) {
    const src = timeline.passos.find((p) => p.id === id);
    if (!src) return;
    const copy: Step = {
      ...src,
      id: `p-${crypto.randomUUID()}`,
      ordem: timeline.passos.length,
      titulo: `${src.titulo} (cópia)`,
      elementos_entrando: [...src.elementos_entrando],
      elementos_saindo: [...src.elementos_saindo],
    };
    const idx = timeline.passos.findIndex((p) => p.id === id);
    const next = [...timeline.passos];
    next.splice(idx + 1, 0, copy);
    setTimeline({ ...timeline, passos: normalizeOrder(next) });
    setCurrentStepId(copy.id);
  }
  function deleteStep(id: string) {
    if (!confirm('Excluir este passo?')) return;
    setTimeline({ ...timeline, passos: normalizeOrder(timeline.passos.filter((p) => p.id !== id)) });
    if (currentStepId === id) setCurrentStepId(null);
  }
  function reorderSteps(ids: string[]) {
    const map = new Map(timeline.passos.map((p) => [p.id, p]));
    const next = ids.map((id) => map.get(id)).filter((p): p is Step => !!p);
    setTimeline({ ...timeline, passos: normalizeOrder(next) });
  }
  function attachSelectionToStep(stepId: string) {
    const ids = [
      ...canvas.nos.filter((n) => n.selected).map((n) => n.id),
      ...canvas.arestas.filter((e) => e.selected).map((e) => e.id),
    ];
    if (ids.length === 0) return;
    setTimeline({
      ...timeline,
      passos: timeline.passos.map((p) => {
        if (p.id !== stepId) return p;
        const set = new Set(p.elementos_entrando);
        ids.forEach((i) => set.add(i));
        return { ...p, elementos_entrando: Array.from(set) };
      }),
    });
  }

  // ── keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      const editing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (editing) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateNode(); }
      else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); selectAll(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) { e.preventDefault(); deleteNode(selectedNodeId); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdgeId) { e.preventDefault(); deleteEdge(selectedEdgeId); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, selectedEdgeId, canvas]);

  const selectedNode = useMemo(() => canvas.nos.find((n) => n.id === selectedNodeId) ?? null,    [canvas.nos, selectedNodeId]);
  const selectedEdge = useMemo(() => canvas.arestas.find((e) => e.id === selectedEdgeId) ?? null, [canvas.arestas, selectedEdgeId]);
  const currentStep  = useMemo(() => timeline.passos.find((p) => p.id === currentStepId) ?? null,  [timeline.passos, currentStepId]);

  return (
    <div className="h-full flex flex-col bg-[color:var(--pr-bg)]">
      <header className="h-14 border-b border-[color:var(--pr-border)] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/apresentacoes')}
            className="p-2 rounded-md text-[color:var(--pr-text-secondary)] hover:text-[color:var(--pr-text-primary)] hover:bg-[color:var(--pr-bg-elevated)] transition-colors"
            title="Voltar"
          >
            <ArrowLeft size={14} />
          </button>
          <div>
            <div className="pr-label-caps">Editor</div>
            <div className="text-sm font-medium leading-tight">{name || 'Carregando...'}</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <SaveIndicator status={status} />
          <div className="w-px h-5 bg-[color:var(--pr-border)]" />

          <button
            onClick={() => router.push(`/apresentacoes/${presentationId}/play`)}
            disabled={timeline.passos.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs uppercase tracking-widest bg-[color:var(--pr-gold)] text-[color:var(--pr-bg)] hover:bg-[color:var(--pr-gold-soft)] disabled:opacity-30 disabled:cursor-not-allowed font-medium transition-colors"
            title={timeline.passos.length === 0 ? 'Crie ao menos um passo' : 'Apresentar'}
          >
            <Play size={12} /> Apresentar
          </button>

          <div className="w-px h-5 bg-[color:var(--pr-border)]" />

          <div className="flex gap-1">
            <ToolButton icon={<LayoutGrid size={12} />} label="Organizar" onClick={organize} disabled={canvas.nos.length === 0} title="Auto-layout (dagre) + ortogonal" />
            <ToolButton icon={<Spline size={12} />}    label="Curva/Reta" onClick={toggleEdgeStyle} disabled={canvas.arestas.length === 0} title="Alternar curva ↔ ortogonal" />

            <IconButton onClick={() => setShowAssets(true)}                     title="Biblioteca de assets"><ImageIcon size={14} /></IconButton>
            <IconButton onClick={async () => { try { await exportCanvasPng(name); } catch (err) { console.error(err); } }} title="Exportar PNG"><Download size={14} /></IconButton>
            <IconButton onClick={async () => { try { await generateAndUploadThumbnail(presentationId); } catch (err) { console.error(err); } }} title="Gerar thumbnail"><Camera size={14} /></IconButton>
            <IconButton onClick={() => setShowShare(true)}                      title="Compartilhar"><Share2 size={14} /></IconButton>
            <IconButton onClick={() => setShowConfig(true)}                     title="Configurações"><Settings size={14} /></IconButton>
          </div>

          <div className="w-px h-5 bg-[color:var(--pr-border)]" />

          <div className="flex gap-1">
            <IconButton onClick={undo} disabled={!canUndo} title="Desfazer (Ctrl+Z)"><Undo2 size={14} /></IconButton>
            <IconButton onClick={redo} disabled={!canRedo} title="Refazer (Ctrl+Y)"><Redo2 size={14} /></IconButton>
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <Sidebar />

        <div ref={rfWrapper} className="flex-1 relative" onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow<CardNodeT, CardEdgeT>
            nodes={canvas.nos}
            edges={canvas.arestas.map((e) => ({ ...e, type: 'card' }))}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setRf}
            onSelectionChange={onSelectionChange}
            defaultViewport={canvas.viewport}
            onMoveEnd={(_, vp) => replace({ canvas: { ...canvas, viewport: vp }, config, timeline })}
            fitView={canvas.nos.length > 0}
            multiSelectionKeyCode="Shift"
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
            style={{ background: config.cor_fundo }}
          >
            <Background color="#1f1f2e" gap={20} size={1} />
            <Controls className="!bg-[color:var(--pr-bg-elevated)] !border !border-[color:var(--pr-border)]" />
            <MiniMap
              pannable zoomable
              nodeColor={(n) => {
                const d = n.data as CardData | undefined;
                if (!d) return '#333';
                return d.cor_override ?? CARD_TYPE_MAP[d.tipo].cor;
              }}
              maskColor="rgba(8,8,14,0.7)"
              className="!bg-[color:var(--pr-bg-elevated)] !border !border-[color:var(--pr-border)]"
            />
          </ReactFlow>
        </div>

        {currentStep ? (
          <StepInspector
            step={currentStep}
            nodes={canvas.nos}
            onUpdate={(p) => updateStep(currentStep.id, p)}
            onDelete={() => deleteStep(currentStep.id)}
          />
        ) : (
          <Inspector
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            onUpdateNode={updateNode}
            onUpdateEdge={updateEdge}
            onDeleteNode={deleteNode}
            onDeleteEdge={deleteEdge}
            onPickLogo={() => setShowAssets(true)}
          />
        )}
      </div>

      <Timeline
        steps={timeline.passos}
        currentStepId={currentStepId}
        onSelect={(id) => { setCurrentStepId(id); setSelectedNodeId(null); setSelectedEdgeId(null); }}
        onAdd={addStep}
        onDuplicate={duplicateStep}
        onDelete={deleteStep}
        onReorder={reorderSteps}
        onAttachSelection={attachSelectionToStep}
        hasCanvasSelection={canvas.nos.some((n) => n.selected) || canvas.arestas.some((e) => e.selected)}
      />

      <AssetLibraryModal
        open={showAssets}
        onClose={() => setShowAssets(false)}
        onSelect={onAssetSelected}
        selectedId={selectedNode?.data.logo_asset_id ?? null}
        hasSelectedCard={!!selectedNodeId}
      />
      <ConfigModal
        open={showConfig}
        onClose={() => setShowConfig(false)}
        config={config}
        onChange={(patch) => setConfig({ ...config, ...patch })}
      />
      <ShareModal
        open={showShare}
        onClose={() => setShowShare(false)}
        presentationId={presentationId}
      />
    </div>
  );
}

// ───── toolbar helpers ──────────────────────────────────────────────────────

function SaveIndicator({ status }: { status: string }) {
  const labels: Record<string, string> = {
    idle: '—', dirty: 'Editando...', saving: 'Salvando...', saved: 'Salvo', error: 'Erro ao salvar',
  };
  const colors: Record<string, string> = {
    idle: 'text-[color:var(--pr-text-tertiary)]',
    dirty: 'text-[color:var(--pr-text-tertiary)]',
    saving: 'text-[color:var(--pr-text-secondary)]',
    saved: 'text-[color:var(--pr-gold)]',
    error: 'text-red-400',
  };
  return <div className={`text-xs uppercase tracking-widest ${colors[status]}`}>{labels[status]}</div>;
}

function IconButton({ children, onClick, disabled, title }:
  { children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="p-2 rounded-md text-[color:var(--pr-text-tertiary)] hover:text-[color:var(--pr-text-primary)] hover:bg-[color:var(--pr-bg-elevated)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}

function ToolButton({ icon, label, onClick, disabled, title }:
  { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs uppercase tracking-widest border border-[color:var(--pr-border)] text-[color:var(--pr-text-secondary)] hover:border-[color:var(--pr-gold)] hover:text-[color:var(--pr-gold)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      {icon} {label}
    </button>
  );
}
