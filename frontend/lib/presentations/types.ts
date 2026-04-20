import type { Edge, Node } from "@xyflow/react";

export type PresentationStatus = "draft" | "published" | "archived";

export type CardType =
  | "trigger"
  | "processamento"
  | "ia"
  | "banco"
  | "integracao"
  | "decisao"
  | "saida"
  | "customizado";

export interface CardData extends Record<string, unknown> {
  tipo: CardType;
  titulo: string;
  descricao: string;
  bullets: string[];
  cor_override: string | null;
  borda: "fina" | "media" | "grossa";
  logo_asset_id: string | null;
  logo_url: string | null;
}

export type CardNode = Node<CardData, "card">;

export interface EdgeData extends Record<string, unknown> {
  estilo: "bezier" | "ortogonal";
  label: string;
  seta: boolean;
  animado: boolean;
  cor: string;
  espessura: "fina" | "media" | "grossa";
}

export type CardEdge = Edge<EdgeData>;

export type EntryEffect =
  | "fade" | "slide-up" | "slide-down" | "slide-left" | "slide-right"
  | "zoom" | "pop" | "draw" | "typewriter";

export type CameraMode =
  | "auto-fit" | "foco-card" | "zoom-area" | "livre" | "travelling";

export interface Step {
  id: string;
  ordem: number;
  titulo: string;
  elementos_entrando: string[];
  elementos_saindo: string[];
  entrada: {
    efeito: EntryEffect;
    duracao_ms: number;
    stagger_ms: number;
  };
  saida_anteriores: boolean;
  camera: {
    modo: CameraMode;
    target: string | null;
    zoom: number;
    transicao_ms: number;
  };
  highlight: {
    escurecer_outros: boolean;
    intensidade: number;
  };
  narracao_apresentador: string;
}

export interface TimelineJson {
  versao: 1;
  config_global: {
    controle_padrao: "scroll" | "setas" | "espaco";
    permite_modo_livre: boolean;
    mostrar_indicador_progresso: boolean;
    duracao_transicao_padrao_ms: number;
  };
  passos: Step[];
}

export interface ConfigJson {
  tema: "dark";
  cor_fundo: string;
  cor_acento: string;
  fonte_titulo: string;
  fonte_corpo: string;
  logo_cliente_url: string | null;
  logo_cliente_posicao: "topo-esquerda" | "topo-direita" | "rodape";
}

export interface CanvasJson {
  versao: 1;
  viewport: { x: number; y: number; zoom: number };
  nos: CardNode[];
  arestas: CardEdge[];
}

export const EMPTY_CANVAS: CanvasJson = {
  versao: 1,
  viewport: { x: 0, y: 0, zoom: 1 },
  nos: [],
  arestas: [],
};

export const DEFAULT_EDGE_DATA: EdgeData = {
  estilo: "bezier",
  label: "",
  seta: true,
  animado: false,
  cor: "#8a8a95",
  espessura: "media",
};

export const DEFAULT_TIMELINE: TimelineJson = {
  versao: 1,
  config_global: {
    controle_padrao: "setas",
    permite_modo_livre: true,
    mostrar_indicador_progresso: true,
    duracao_transicao_padrao_ms: 600,
  },
  passos: [],
};

export const DEFAULT_CONFIG: ConfigJson = {
  tema: "dark",
  cor_fundo: "#08080E",
  cor_acento: "#A6864A",
  fonte_titulo: "Inter",
  fonte_corpo: "Inter",
  logo_cliente_url: null,
  logo_cliente_posicao: "topo-direita",
};

export function newStep(ordem: number): Step {
  return {
    id: `p-${crypto.randomUUID()}`,
    ordem,
    titulo: `Passo ${ordem + 1}`,
    elementos_entrando: [],
    elementos_saindo: [],
    entrada: { efeito: "fade", duracao_ms: 500, stagger_ms: 80 },
    saida_anteriores: false,
    camera: { modo: "auto-fit", target: null, zoom: 1, transicao_ms: 600 },
    highlight: { escurecer_outros: false, intensidade: 60 },
    narracao_apresentador: "",
  };
}

// ───── API DTOs ───────────────────────────────────────────────────────────────

export interface PresentationListItem {
  id: string;
  name: string;
  client_name: string;
  status: PresentationStatus;
  thumbnail_url: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  total_views: number;
  total_links: number;
}

export interface Presentation {
  id: string;
  name: string;
  client_name: string;
  status: PresentationStatus;
  canvas_json: Record<string, unknown>;
  timeline_json: Record<string, unknown>;
  config_json: Record<string, unknown>;
  thumbnail_url: string;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface PublicLink {
  id: string;
  presentation: string;
  token: string;
  label: string;
  is_active: boolean;
  expires_at: string | null;
  total_views: number;
  last_access_at: string | null;
  created_at: string;
  revoked_at: string | null;
  password_protected: boolean;
}

export interface Asset {
  id: string;
  name: string;
  kind: "logo" | "image" | "icon";
  file: string;
  size_bytes: number;
  created_at: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
