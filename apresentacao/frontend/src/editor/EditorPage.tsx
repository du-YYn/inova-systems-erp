import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ArrowLeft, Camera, Download, ImageIcon, LayoutGrid, Play, Redo2, Settings, Share2, Spline, Undo2 } from "lucide-react";
import { Button } from "@/components/Button";
import { getApresentacao, updateApresentacao } from "@/api/apresentacoes";
import type { Asset } from "@/api/assets";
import { CARD_TIPO_MAP, type CardTipo } from "./cardTypes";
import { CardNode } from "./CardNode";
import { CardEdge } from "./CardEdge";
import { Sidebar } from "./Sidebar";
import { Inspector } from "./Inspector";
import { Timeline } from "./Timeline";
import { PassoInspector } from "./PassoInspector";
import { AssetLibraryModal } from "./AssetLibraryModal";
import { ConfigModal } from "./ConfigModal";
import { ShareModal } from "./ShareModal";
import { exportarCanvasPng, gerarEnviarThumbnail } from "./exportCanvas";
import { autoLayout } from "./autoLayout";
import { useAutoSave } from "./useAutoSave";
import { useHistory } from "./useHistory";
import {
  DEFAULT_CONFIG,
  DEFAULT_EDGE_DATA,
  DEFAULT_TIMELINE,
  EMPTY_CANVAS,
  novoPasso,
  type CanvasJson,
  type CardData,
  type CardEdge as CardEdgeT,
  type CardNode as CardNodeT,
  type ConfigJson,
  type EdgeData,
  type Passo,
  type TimelineJson,
} from "./types";

const nodeTypes = { card: CardNode };
const edgeTypes = { card: CardEdge };

function normalizarOrdem(passos: Passo[]): Passo[] {
  return passos.map((p, i) => ({ ...p, ordem: i }));
}

function defaultCardData(tipo: CardTipo): CardData {
  return {
    tipo,
    titulo: CARD_TIPO_MAP[tipo].label,
    descricao: "",
    bullets: [],
    cor_override: null,
    borda: "media",
    logo_asset_id: null,
    logo_url: null,
  };
}

interface PersistedState {
  canvas: CanvasJson;
  config: ConfigJson;
  timeline: TimelineJson;
}

export function EditorPage() {
  return (
    <ReactFlowProvider>
      <EditorInner />
    </ReactFlowProvider>
  );
}

function EditorInner() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const rfWrapper = useRef<HTMLDivElement>(null);
  const [rf, setRf] = useState<ReactFlowInstance<CardNodeT, CardEdgeT> | null>(null);
  const [nome, setNome] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [showAssets, setShowAssets] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [passoAtualId, setPassoAtualId] = useState<string | null>(null);

  const history = useHistory<PersistedState>({ canvas: EMPTY_CANVAS, config: DEFAULT_CONFIG, timeline: DEFAULT_TIMELINE });
  const { state, push: setState, replace, undo, redo, canUndo, canRedo } = history;
  const canvas = state.canvas;
  const config = state.config;
  const timeline = state.timeline;

  const setCanvas = useCallback((c: CanvasJson) => setState({ ...state, canvas: c }), [setState, state]);
  const setConfig = useCallback((cfg: ConfigJson) => setState({ ...state, config: cfg }), [setState, state]);
  const setTimeline = useCallback((t: TimelineJson) => setState({ ...state, timeline: t }), [setState, state]);

  const status = useAutoSave(state, async (v) => {
    if (!id || !loaded) return;
    await updateApresentacao(id, {
      canvas_json: v.canvas as unknown as Record<string, unknown>,
      config_json: v.config as unknown as Record<string, unknown>,
      timeline_json: v.timeline as unknown as Record<string, unknown>,
    });
  });

  useEffect(() => {
    if (!id) return;
    (async () => {
      const data = await getApresentacao(id);
      setNome(data.nome);
      const c = (data.canvas_json && Object.keys(data.canvas_json).length
        ? data.canvas_json
        : EMPTY_CANVAS) as unknown as CanvasJson;
      const cfg = (data.config_json && Object.keys(data.config_json).length
        ? data.config_json
        : DEFAULT_CONFIG) as unknown as ConfigJson;
      const tl = (data.timeline_json && Object.keys(data.timeline_json).length
        ? data.timeline_json
        : DEFAULT_TIMELINE) as unknown as TimelineJson;
      replace({
        canvas: { ...EMPTY_CANVAS, ...c },
        config: { ...DEFAULT_CONFIG, ...cfg },
        timeline: { ...DEFAULT_TIMELINE, ...tl },
      });
      setLoaded(true);
    })();
  }, [id, replace]);

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
      type: "card",
      data: { ...DEFAULT_EDGE_DATA },
      markerEnd: { type: MarkerType.ArrowClosed, color: DEFAULT_EDGE_DATA.cor },
    };
    setCanvas({ ...canvas, arestas: addEdge(newEdge, canvas.arestas) as CardEdgeT[] });
  }, [canvas, setCanvas]);

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    const tipo = e.dataTransfer.getData("application/inova-card") as CardTipo;
    if (!tipo || !rf) return;
    const position = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const newNode: CardNodeT = {
      id: `n-${crypto.randomUUID()}`,
      type: "card",
      position,
      data: defaultCardData(tipo),
    };
    setCanvas({ ...canvas, nos: [...canvas.nos, newNode] });
  }, [rf, canvas, setCanvas]);

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  const onSelectionChange = useCallback(({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) => {
    setSelectedNodeId(nodes[0]?.id ?? null);
    setSelectedEdgeId(edges[0]?.id ?? null);
    if (nodes.length > 0 || edges.length > 0) setPassoAtualId(null);
  }, []);

  function updateNode(nodeId: string, patch: Partial<CardData>) {
    setCanvas({
      ...canvas,
      nos: canvas.nos.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n),
    });
  }

  function updateEdge(edgeId: string, patch: Partial<EdgeData>) {
    setCanvas({
      ...canvas,
      arestas: canvas.arestas.map((e) => {
        if (e.id !== edgeId) return e;
        const newData = { ...(e.data ?? DEFAULT_EDGE_DATA), ...patch };
        return {
          ...e,
          data: newData,
          markerEnd: newData.seta
            ? { type: MarkerType.ArrowClosed, color: newData.cor }
            : undefined,
        };
      }),
    });
  }

  function deleteNode(nodeId: string) {
    setCanvas({
      ...canvas,
      nos: canvas.nos.filter((n) => n.id !== nodeId),
      arestas: canvas.arestas.filter((e) => e.source !== nodeId && e.target !== nodeId),
    });
    setSelectedNodeId(null);
  }

  function deleteEdge(edgeId: string) {
    setCanvas({ ...canvas, arestas: canvas.arestas.filter((e) => e.id !== edgeId) });
    setSelectedEdgeId(null);
  }

  function organizar() {
    const newNodes = autoLayout(canvas.nos, canvas.arestas, "LR");
    const newEdges = canvas.arestas.map((e) => ({
      ...e,
      data: { ...(e.data ?? DEFAULT_EDGE_DATA), estilo: "ortogonal" as const },
    }));
    setCanvas({ ...canvas, nos: newNodes, arestas: newEdges });
    setTimeout(() => rf?.fitView({ padding: 0.2, duration: 400 }), 50);
  }

  function alternarEstiloEdges() {
    const todasOrtogonais = canvas.arestas.every((e) => e.data?.estilo === "ortogonal");
    const novoEstilo = todasOrtogonais ? "bezier" : "ortogonal";
    setCanvas({
      ...canvas,
      arestas: canvas.arestas.map((e) => ({
        ...e,
        data: { ...(e.data ?? DEFAULT_EDGE_DATA), estilo: novoEstilo },
      })),
    });
  }

  function duplicarNode() {
    if (!selectedNodeId) return;
    const orig = canvas.nos.find((n) => n.id === selectedNodeId);
    if (!orig) return;
    const novo: CardNodeT = {
      ...orig,
      id: `n-${crypto.randomUUID()}`,
      position: { x: orig.position.x + 40, y: orig.position.y + 40 },
      data: { ...orig.data, bullets: [...orig.data.bullets] },
      selected: false,
    };
    setCanvas({ ...canvas, nos: [...canvas.nos, novo] });
  }

  function selecionarTudo() {
    setCanvas({
      ...canvas,
      nos: canvas.nos.map((n) => ({ ...n, selected: true })),
      arestas: canvas.arestas.map((e) => ({ ...e, selected: true })),
    });
  }

  function onPickLogo() { setShowAssets(true); }

  function addPasso() {
    const p = novoPasso(timeline.passos.length);
    setTimeline({ ...timeline, passos: [...timeline.passos, p] });
    setPassoAtualId(p.id);
  }

  function updatePasso(passoId: string, patch: Partial<Passo>) {
    setTimeline({
      ...timeline,
      passos: timeline.passos.map((p) => p.id === passoId ? { ...p, ...patch } : p),
    });
  }

  function duplicarPasso(passoId: string) {
    const orig = timeline.passos.find((p) => p.id === passoId);
    if (!orig) return;
    const copia: Passo = {
      ...orig,
      id: `p-${crypto.randomUUID()}`,
      ordem: timeline.passos.length,
      titulo: `${orig.titulo} (cópia)`,
      elementos_entrando: [...orig.elementos_entrando],
      elementos_saindo: [...orig.elementos_saindo],
    };
    const idx = timeline.passos.findIndex((p) => p.id === passoId);
    const novos = [...timeline.passos];
    novos.splice(idx + 1, 0, copia);
    setTimeline({ ...timeline, passos: normalizarOrdem(novos) });
    setPassoAtualId(copia.id);
  }

  function excluirPasso(passoId: string) {
    if (!confirm("Excluir este passo?")) return;
    setTimeline({ ...timeline, passos: normalizarOrdem(timeline.passos.filter((p) => p.id !== passoId)) });
    if (passoAtualId === passoId) setPassoAtualId(null);
  }

  function reordenarPassos(ids: string[]) {
    const map = new Map(timeline.passos.map((p) => [p.id, p]));
    const novos = ids.map((id) => map.get(id)).filter((p): p is Passo => !!p);
    setTimeline({ ...timeline, passos: normalizarOrdem(novos) });
  }

  function atribuirSelecaoAoPasso(passoId: string) {
    const ids = [
      ...canvas.nos.filter((n) => n.selected).map((n) => n.id),
      ...canvas.arestas.filter((e) => e.selected).map((e) => e.id),
    ];
    if (ids.length === 0) return;
    setTimeline({
      ...timeline,
      passos: timeline.passos.map((p) => {
        if (p.id !== passoId) return p;
        const existing = new Set(p.elementos_entrando);
        ids.forEach((i) => existing.add(i));
        return { ...p, elementos_entrando: Array.from(existing) };
      }),
    });
  }

  function onAssetSelected(asset: Asset) {
    if (!selectedNodeId) return;
    if (!asset.id) {
      updateNode(selectedNodeId, { logo_asset_id: null, logo_url: null });
    } else {
      updateNode(selectedNodeId, { logo_asset_id: asset.id, logo_url: asset.arquivo });
    }
    setShowAssets(false);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const editing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (editing) return;

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault(); duplicarNode();
      } else if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault(); selecionarTudo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeId) {
        e.preventDefault(); deleteNode(selectedNodeId);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedEdgeId) {
        e.preventDefault(); deleteEdge(selectedEdgeId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, selectedEdgeId, canvas]);

  const selectedNode = useMemo(
    () => canvas.nos.find((n) => n.id === selectedNodeId) ?? null,
    [canvas.nos, selectedNodeId]
  );
  const selectedEdge = useMemo(
    () => canvas.arestas.find((e) => e.id === selectedEdgeId) ?? null,
    [canvas.arestas, selectedEdgeId]
  );
  const passoAtual = useMemo(
    () => timeline.passos.find((p) => p.id === passoAtualId) ?? null,
    [timeline.passos, passoAtualId]
  );

  return (
    <div className="h-screen flex flex-col bg-[color:var(--color-bg)]">
      <header className="h-14 border-b border-[color:var(--color-border)] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => nav("/")}>
            <ArrowLeft size={14} />
          </Button>
          <div>
            <div className="label-caps">Editor</div>
            <div className="text-sm font-medium leading-tight">{nome || "Carregando..."}</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <SaveIndicator status={status} />
          <div className="w-px h-5 bg-[color:var(--color-border)]" />

          <button
            onClick={() => id && nav(`/apresentacao/${id}/play`)}
            disabled={timeline.passos.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs uppercase tracking-widest bg-[color:var(--color-gold)] text-[color:var(--color-bg)] hover:bg-[color:var(--color-gold-soft)] disabled:opacity-30 disabled:cursor-not-allowed font-medium transition-colors"
            title={timeline.passos.length === 0 ? "Crie ao menos um passo" : "Apresentar (F5)"}
          >
            <Play size={12} /> Apresentar
          </button>

          <div className="w-px h-5 bg-[color:var(--color-border)]" />

          <div className="flex gap-1">
            <button
              onClick={organizar}
              disabled={canvas.nos.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs uppercase tracking-widest border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:border-[color:var(--color-gold)] hover:text-[color:var(--color-gold)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Auto-layout (dagre) + ortogonal"
            >
              <LayoutGrid size={12} /> Organizar
            </button>
            <button
              onClick={alternarEstiloEdges}
              disabled={canvas.arestas.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs uppercase tracking-widest border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:border-[color:var(--color-gold)] hover:text-[color:var(--color-gold)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Alternar curva ↔ ortogonal"
            >
              <Spline size={12} /> Curva/Reta
            </button>
            <button
              onClick={() => setShowAssets(true)}
              className="p-2 rounded-md text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-bg-elevated)] transition-colors"
              title="Biblioteca de assets"
            >
              <ImageIcon size={14} />
            </button>
            <button
              onClick={async () => { try { await exportarCanvasPng(nome); } catch (err) { console.error(err); } }}
              className="p-2 rounded-md text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-bg-elevated)] transition-colors"
              title="Exportar PNG"
            >
              <Download size={14} />
            </button>
            <button
              onClick={async () => { if (!id) return; try { await gerarEnviarThumbnail(id); } catch (err) { console.error(err); } }}
              className="p-2 rounded-md text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-bg-elevated)] transition-colors"
              title="Gerar thumbnail"
            >
              <Camera size={14} />
            </button>
            <button
              onClick={() => setShowShare(true)}
              className="p-2 rounded-md text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-bg-elevated)] transition-colors"
              title="Compartilhar"
            >
              <Share2 size={14} />
            </button>
            <button
              onClick={() => setShowConfig(true)}
              className="p-2 rounded-md text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-bg-elevated)] transition-colors"
              title="Configurações"
            >
              <Settings size={14} />
            </button>
          </div>

          <div className="w-px h-5 bg-[color:var(--color-border)]" />

          <div className="flex gap-1">
            <button
              onClick={undo}
              disabled={!canUndo}
              className="p-2 rounded-md text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-bg-elevated)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Desfazer (Ctrl+Z)"
            >
              <Undo2 size={14} />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className="p-2 rounded-md text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-bg-elevated)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Refazer (Ctrl+Y)"
            >
              <Redo2 size={14} />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <Sidebar />

        <div ref={rfWrapper} className="flex-1 relative" onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow<CardNodeT, CardEdgeT>
            nodes={canvas.nos}
            edges={canvas.arestas.map((e) => ({ ...e, type: "card" }))}
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
            <Controls className="!bg-[color:var(--color-bg-elevated)] !border !border-[color:var(--color-border)]" />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => {
                const d = (n.data as CardData | undefined);
                if (!d) return "#333";
                return d.cor_override ?? CARD_TIPO_MAP[d.tipo].cor;
              }}
              maskColor="rgba(8,8,14,0.7)"
              className="!bg-[color:var(--color-bg-elevated)] !border !border-[color:var(--color-border)]"
            />
          </ReactFlow>
        </div>

        {passoAtual ? (
          <PassoInspector
            passo={passoAtual}
            nodes={canvas.nos}
            onUpdate={(patch) => updatePasso(passoAtual.id, patch)}
            onDelete={() => excluirPasso(passoAtual.id)}
          />
        ) : (
          <Inspector
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            onUpdateNode={updateNode}
            onUpdateEdge={updateEdge}
            onDeleteNode={deleteNode}
            onDeleteEdge={deleteEdge}
            onPickLogo={onPickLogo}
          />
        )}
      </div>

      <Timeline
        passos={timeline.passos}
        passoAtualId={passoAtualId}
        onSelect={(pid) => { setPassoAtualId(pid); setSelectedNodeId(null); setSelectedEdgeId(null); }}
        onAdd={addPasso}
        onDuplicate={duplicarPasso}
        onDelete={excluirPasso}
        onReorder={reordenarPassos}
        onAtribuirSelecao={atribuirSelecaoAoPasso}
        temSelecaoCanvas={canvas.nos.some((n) => n.selected) || canvas.arestas.some((e) => e.selected)}
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
      {id && (
        <ShareModal
          open={showShare}
          onClose={() => setShowShare(false)}
          apresentacaoId={id}
        />
      )}
    </div>
  );
}

function SaveIndicator({ status }: { status: string }) {
  const labels: Record<string, string> = {
    idle:   "—",
    dirty:  "Editando...",
    saving: "Salvando...",
    saved:  "Salvo",
    error:  "Erro ao salvar",
  };
  const colors: Record<string, string> = {
    idle:   "text-[color:var(--color-text-tertiary)]",
    dirty:  "text-[color:var(--color-text-tertiary)]",
    saving: "text-[color:var(--color-text-secondary)]",
    saved:  "text-[color:var(--color-gold)]",
    error:  "text-red-400",
  };
  return (
    <div className={`text-xs uppercase tracking-widest ${colors[status]}`}>
      {labels[status]}
    </div>
  );
}
