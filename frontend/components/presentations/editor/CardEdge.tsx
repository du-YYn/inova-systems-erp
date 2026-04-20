'use client';

import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import type { CardEdge as CardEdgeT } from '@/lib/presentations/types';

const WEIGHT: Record<string, number> = { fina: 1.2, media: 2, grossa: 3 };

function CardEdgeComponent(props: EdgeProps<CardEdgeT>) {
  const {
    id, sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition, data, markerEnd, selected,
  } = props;
  const d = data ?? {
    estilo: 'bezier', label: '', seta: true, animado: false,
    cor: '#8a8a95', espessura: 'media' as const,
  };

  const getPath = d.estilo === 'ortogonal' ? getSmoothStepPath : getBezierPath;
  const [path, labelX, labelY] = getPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={d.seta ? markerEnd : undefined}
        style={{
          stroke: selected ? 'var(--pr-gold)' : d.cor,
          strokeWidth: WEIGHT[d.espessura],
          strokeDasharray: d.animado ? '6 4' : undefined,
          animation: d.animado ? 'inova-dash 1.4s linear infinite' : undefined,
        }}
      />
      {d.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="absolute px-2 py-0.5 rounded text-[11px] font-medium bg-[color:var(--pr-bg-elevated)] border border-[color:var(--pr-border)] text-[color:var(--pr-text-secondary)] nodrag nopan"
          >
            {d.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const CardEdge = memo(CardEdgeComponent);
