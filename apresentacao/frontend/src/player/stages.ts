import { DEFAULT_EDGE_DATA, type CardData, type CardEdge, type CardNode, type EdgeData, type Passo } from "@/editor/types";

export type AnimStage = "hidden" | "entering" | "visible" | "dimmed" | "exiting";

export interface PlayerNodeData extends Record<string, unknown> {
  stage: AnimStage;
  efeito: Passo["entrada"]["efeito"];
  duracao_ms: number;
  delay_ms: number;
  intensidade_dim: number;
  original: CardData;
}

export interface PlayerEdgeData extends Record<string, unknown> {
  stage: AnimStage;
  efeito: Passo["entrada"]["efeito"];
  duracao_ms: number;
  delay_ms: number;
  intensidade_dim: number;
  original: EdgeData;
}

function acumulados(passos: Passo[], ateIndex: number) {
  const visiveis = new Set<string>();
  for (let i = 0; i <= ateIndex; i++) {
    const p = passos[i];
    if (!p) continue;
    if (p.saida_anteriores) visiveis.clear();
    p.elementos_entrando.forEach((id) => visiveis.add(id));
    p.elementos_saindo.forEach((id) => visiveis.delete(id));
  }
  return visiveis;
}

export function computarEstagios(
  nodes: CardNode[],
  edges: CardEdge[],
  passos: Passo[],
  passoIndex: number,
) {
  const passo = passos[passoIndex];
  const anterior = passoIndex > 0 ? passos[passoIndex - 1] : null;

  const ativosAte = acumulados(passos, passoIndex);
  const ativosAnterior = anterior ? acumulados(passos, passoIndex - 1) : new Set<string>();

  const entrantes = new Set(passo?.elementos_entrando ?? []);
  const saintes = new Set(passo?.elementos_saindo ?? []);

  function stageFor(id: string): AnimStage {
    if (entrantes.has(id)) return "entering";
    if (saintes.has(id)) return "exiting";
    if (ativosAte.has(id)) {
      if (passo?.highlight.escurecer_outros && !entrantes.has(id) && !ativosAnterior.has(id)) {
        return "visible";
      }
      if (passo?.highlight.escurecer_outros) return "dimmed";
      return "visible";
    }
    return "hidden";
  }

  const duracao = passo?.entrada.duracao_ms ?? 500;
  const stagger = passo?.entrada.stagger_ms ?? 0;
  const efeito = passo?.entrada.efeito ?? "fade";
  const intensidade_dim = (passo?.highlight.intensidade ?? 60) / 100;

  const playerNodes = nodes.map((n, i) => ({
    ...n,
    data: {
      stage: stageFor(n.id),
      efeito,
      duracao_ms: duracao,
      delay_ms: entrantes.has(n.id) ? i * stagger : 0,
      intensidade_dim,
      original: n.data,
    } satisfies PlayerNodeData,
  }));

  const playerEdges = edges.map((e, i) => ({
    ...e,
    data: {
      stage: stageFor(e.id),
      efeito,
      duracao_ms: duracao,
      delay_ms: entrantes.has(e.id) ? i * stagger : 0,
      intensidade_dim,
      original: e.data ?? DEFAULT_EDGE_DATA,
    } satisfies PlayerEdgeData,
  }));

  return { playerNodes, playerEdges, ativosAte };
}
