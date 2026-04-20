import { DEFAULT_EDGE_DATA, type CardData, type CardEdge, type CardNode, type EdgeData, type EntryEffect, type Step } from '@/lib/presentations/types';

export type AnimStage = 'hidden' | 'entering' | 'visible' | 'dimmed' | 'exiting';

export interface PlayerNodeData extends Record<string, unknown> {
  stage: AnimStage;
  efeito: EntryEffect;
  duracao_ms: number;
  delay_ms: number;
  intensidade_dim: number;
  original: CardData;
}

export interface PlayerEdgeData extends Record<string, unknown> {
  stage: AnimStage;
  efeito: EntryEffect;
  duracao_ms: number;
  delay_ms: number;
  intensidade_dim: number;
  original: EdgeData;
}

function accumulated(steps: Step[], upto: number) {
  const visible = new Set<string>();
  for (let i = 0; i <= upto; i++) {
    const s = steps[i];
    if (!s) continue;
    if (s.saida_anteriores) visible.clear();
    s.elementos_entrando.forEach((id) => visible.add(id));
    s.elementos_saindo.forEach((id) => visible.delete(id));
  }
  return visible;
}

export function computeStages(
  nodes: CardNode[],
  edges: CardEdge[],
  steps: Step[],
  index: number,
) {
  const step = steps[index];
  const previous = index > 0 ? steps[index - 1] : null;

  const visibleUpTo = accumulated(steps, index);
  const visiblePrev = previous ? accumulated(steps, index - 1) : new Set<string>();

  const entering = new Set(step?.elementos_entrando ?? []);
  const exiting  = new Set(step?.elementos_saindo ?? []);

  function stageFor(id: string): AnimStage {
    if (entering.has(id)) return 'entering';
    if (exiting.has(id)) return 'exiting';
    if (visibleUpTo.has(id)) {
      if (step?.highlight.escurecer_outros && !entering.has(id) && !visiblePrev.has(id)) return 'visible';
      if (step?.highlight.escurecer_outros) return 'dimmed';
      return 'visible';
    }
    return 'hidden';
  }

  const duration = step?.entrada.duracao_ms ?? 500;
  const stagger  = step?.entrada.stagger_ms ?? 0;
  const effect   = step?.entrada.efeito ?? 'fade';
  const dim      = (step?.highlight.intensidade ?? 60) / 100;

  const playerNodes = nodes.map((n, i) => ({
    ...n,
    data: {
      stage: stageFor(n.id),
      efeito: effect,
      duracao_ms: duration,
      delay_ms: entering.has(n.id) ? i * stagger : 0,
      intensidade_dim: dim,
      original: n.data,
    } satisfies PlayerNodeData,
  }));

  const playerEdges = edges.map((e, i) => ({
    ...e,
    data: {
      stage: stageFor(e.id),
      efeito: effect,
      duracao_ms: duration,
      delay_ms: entering.has(e.id) ? i * stagger : 0,
      intensidade_dim: dim,
      original: e.data ?? DEFAULT_EDGE_DATA,
    } satisfies PlayerEdgeData,
  }));

  return { playerNodes, playerEdges, visibleUpTo };
}
