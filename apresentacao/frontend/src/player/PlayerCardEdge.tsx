import { memo } from "react";
import {
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import { motion } from "framer-motion";
import type { PlayerEdgeData } from "./stages";

const ESPESSURA: Record<string, number> = { fina: 1.2, media: 2, grossa: 3 };

function PlayerCardEdgeComponent(props: EdgeProps & { data?: PlayerEdgeData }) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd } = props;
  if (!data) return null;
  const { stage, efeito, duracao_ms, delay_ms, intensidade_dim, original } = data;
  if (stage === "hidden") return null;

  const getPath = original.estilo === "ortogonal" ? getSmoothStepPath : getBezierPath;
  const [path, labelX, labelY] = getPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  });
  const strokeWidth = ESPESSURA[original.espessura];
  const stroke = original.cor;
  const baseOpacity = stage === "dimmed" ? 1 - intensidade_dim : 1;

  const isDraw = efeito === "draw" && stage === "entering";
  const dur = duracao_ms / 1000;
  const del = delay_ms / 1000;

  return (
    <>
      <motion.path
        id={id}
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        markerEnd={original.seta ? markerEnd : undefined}
        strokeDasharray={original.animado ? "6 4" : undefined}
        style={{ animation: original.animado ? "inova-dash 1.4s linear infinite" : undefined }}
        initial={isDraw ? { pathLength: 0, opacity: 1 } : { opacity: stage === "entering" ? 0 : baseOpacity }}
        animate={isDraw ? { pathLength: 1, opacity: 1 } : { opacity: baseOpacity }}
        transition={{ duration: dur, delay: del, ease: [0.22, 1, 0.36, 1] }}
      />
      {original.label && (
        <EdgeLabelRenderer>
          <motion.div
            initial={{ opacity: stage === "entering" ? 0 : baseOpacity }}
            animate={{ opacity: baseOpacity }}
            transition={{ duration: dur, delay: del + (isDraw ? dur * 0.6 : 0) }}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
            }}
            className="absolute px-2 py-0.5 rounded text-[11px] font-medium bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] nodrag nopan"
          >
            {original.label}
          </motion.div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const PlayerCardEdge = memo(PlayerCardEdgeComponent);
