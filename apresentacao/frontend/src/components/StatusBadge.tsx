import { clsx } from "clsx";
import type { StatusApresentacao } from "@/types";

const meta: Record<StatusApresentacao, { label: string; cls: string }> = {
  rascunho:   { label: "Rascunho",  cls: "text-[color:var(--color-text-tertiary)] border-[color:var(--color-border)]" },
  publicada:  { label: "Publicada", cls: "text-[color:var(--color-gold)] border-[color:var(--color-gold)]/40" },
  arquivada:  { label: "Arquivada", cls: "text-[color:var(--color-text-tertiary)] border-[color:var(--color-border)] opacity-60" },
};

export function StatusBadge({ status }: { status: StatusApresentacao }) {
  const m = meta[status];
  return (
    <span className={clsx(
      "inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-medium uppercase tracking-widest border",
      m.cls
    )}>
      {m.label}
    </span>
  );
}
