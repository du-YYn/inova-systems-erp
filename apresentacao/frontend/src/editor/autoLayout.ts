import dagre from "dagre";
import type { CardEdge, CardNode } from "./types";

const NODE_WIDTH = 260;
const NODE_HEIGHT = 140;

export function autoLayout(
  nodes: CardNode[],
  edges: CardEdge[],
  direction: "LR" | "TB" = "LR",
): CardNode[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 100, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((n) => {
    g.setNode(n.id, {
      width: n.measured?.width ?? NODE_WIDTH,
      height: n.measured?.height ?? NODE_HEIGHT,
    });
  });
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map((n) => {
    const { x, y } = g.node(n.id);
    const w = n.measured?.width ?? NODE_WIDTH;
    const h = n.measured?.height ?? NODE_HEIGHT;
    return { ...n, position: { x: x - w / 2, y: y - h / 2 } };
  });
}
