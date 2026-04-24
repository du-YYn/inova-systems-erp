import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { clsx } from "clsx";
import { CARD_TIPO_MAP } from "./cardTypes";
import type { CardNode as CardNodeT } from "./types";

const BORDA: Record<string, string> = { fina: "1px", media: "2px", grossa: "3px" };

function CardNodeComponent({ data, selected }: NodeProps<CardNodeT>) {
  const meta = CARD_TIPO_MAP[data.tipo];
  const Icon = meta.icon;
  const cor = data.cor_override ?? meta.cor;

  return (
    <div
      className={clsx(
        "rounded-lg bg-[color:var(--color-bg-elevated)] min-w-[220px] max-w-[280px] transition-shadow",
        selected ? "shadow-[0_0_0_2px_var(--color-gold)]" : "shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
      )}
      style={{ border: `${BORDA[data.borda]} solid ${cor}` }}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[color:var(--color-border)]">
        <div
          className="flex items-center justify-center w-6 h-6 rounded-md"
          style={{ backgroundColor: `${cor}22`, color: cor }}
        >
          <Icon size={14} />
        </div>
        <div className="text-[10px] uppercase tracking-widest font-medium flex-1 truncate" style={{ color: cor }}>
          {meta.label}
        </div>
        {data.logo_url && (
          <img
            src={data.logo_url}
            alt=""
            className="w-5 h-5 object-contain rounded-sm"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        )}
      </div>

      <div className="px-3 py-3">
        <div className="text-sm font-medium text-[color:var(--color-text-primary)] leading-tight">
          {data.titulo || <span className="text-[color:var(--color-text-tertiary)] italic">Sem título</span>}
        </div>
        {data.descricao && (
          <div className="text-xs text-[color:var(--color-text-secondary)] mt-1.5 leading-snug">
            {data.descricao}
          </div>
        )}
        {data.bullets.length > 0 && (
          <ul className="mt-2 space-y-1">
            {data.bullets.map((b, i) => (
              <li key={i} className="text-xs text-[color:var(--color-text-secondary)] flex gap-1.5">
                <span style={{ color: cor }}>›</span>
                <span className="leading-snug">{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(["Top", "Right", "Bottom", "Left"] as const).map((side) => (
        <Handle
          key={side}
          id={side.toLowerCase()}
          type="source"
          position={Position[side]}
          className="!w-2 !h-2 !bg-[color:var(--color-gold)] !border-[color:var(--color-bg)]"
        />
      ))}
      {(["Top", "Right", "Bottom", "Left"] as const).map((side) => (
        <Handle
          key={`t-${side}`}
          id={`t-${side.toLowerCase()}`}
          type="target"
          position={Position[side]}
          className="!w-2 !h-2 !opacity-0"
        />
      ))}
    </div>
  );
}

export const CardNode = memo(CardNodeComponent);
