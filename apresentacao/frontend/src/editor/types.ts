import type { Edge, Node } from "@xyflow/react";
import type { CardTipo } from "./cardTypes";

export interface CardData extends Record<string, unknown> {
  tipo: CardTipo;
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

export type EfeitoEntrada = "fade" | "slide-up" | "slide-down" | "slide-left" | "slide-right" | "zoom" | "pop" | "draw" | "typewriter";
export type ModoCamera = "auto-fit" | "foco-card" | "zoom-area" | "livre" | "travelling";

export interface Passo {
  id: string;
  ordem: number;
  titulo: string;
  elementos_entrando: string[];
  elementos_saindo: string[];
  entrada: {
    efeito: EfeitoEntrada;
    duracao_ms: number;
    stagger_ms: number;
  };
  saida_anteriores: boolean;
  camera: {
    modo: ModoCamera;
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
  passos: Passo[];
}

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

export function novoPasso(ordem: number): Passo {
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

export interface ConfigJson {
  tema: "dark";
  cor_fundo: string;
  cor_acento: string;
  fonte_titulo: string;
  fonte_corpo: string;
  logo_cliente_url: string | null;
  logo_cliente_posicao: "topo-esquerda" | "topo-direita" | "rodape";
}

export const DEFAULT_CONFIG: ConfigJson = {
  tema: "dark",
  cor_fundo: "#08080E",
  cor_acento: "#D4AF37",
  fonte_titulo: "Outfit",
  fonte_corpo: "Outfit",
  logo_cliente_url: null,
  logo_cliente_posicao: "topo-direita",
};

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
