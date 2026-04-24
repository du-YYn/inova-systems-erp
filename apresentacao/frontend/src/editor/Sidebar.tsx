import type { DragEvent } from "react";
import { CARD_TIPOS } from "./cardTypes";

export function Sidebar() {
  function onDragStart(e: DragEvent, tipo: string) {
    e.dataTransfer.setData("application/inova-card", tipo);
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <aside className="w-64 border-r border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] flex flex-col">
      <div className="px-4 py-4 border-b border-[color:var(--color-border)]">
        <div className="label-caps">Cards</div>
        <p className="text-xs text-[color:var(--color-text-tertiary)] mt-1">
          Arraste para o canvas
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {CARD_TIPOS.map((m) => {
          const Icon = m.icon;
          return (
            <div
              key={m.tipo}
              draggable
              onDragStart={(e) => onDragStart(e, m.tipo)}
              className="group flex items-start gap-3 p-3 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-bg-elevated)] cursor-grab active:cursor-grabbing hover:border-[color:var(--color-gold)]/50 transition-colors"
            >
              <div
                className="flex items-center justify-center w-8 h-8 rounded-md shrink-0"
                style={{ backgroundColor: `${m.cor}1a`, color: m.cor }}
              >
                <Icon size={16} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium leading-tight">{m.label}</div>
                <div className="text-[11px] text-[color:var(--color-text-tertiary)] mt-0.5 leading-snug">
                  {m.descricao}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
