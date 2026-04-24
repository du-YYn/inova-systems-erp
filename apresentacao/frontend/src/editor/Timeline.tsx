import { Copy, Link2, Plus, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import type { Passo } from "./types";

interface Props {
  passos: Passo[];
  passoAtualId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onAtribuirSelecao: (id: string) => void;
  temSelecaoCanvas: boolean;
}

export function Timeline({
  passos, passoAtualId, onSelect, onAdd, onDuplicate, onDelete, onReorder, onAtribuirSelecao, temSelecaoCanvas,
}: Props) {
  function onDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("application/inova-passo", id);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    const srcId = e.dataTransfer.getData("application/inova-passo");
    if (!srcId || srcId === targetId) return;
    const ids = passos.map((p) => p.id);
    const srcIdx = ids.indexOf(srcId);
    const tgtIdx = ids.indexOf(targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;
    const next = [...ids];
    next.splice(srcIdx, 1);
    next.splice(tgtIdx, 0, srcId);
    onReorder(next);
  }

  return (
    <div className="h-28 border-t border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] shrink-0 flex items-stretch">
      <div className="px-5 py-3 border-r border-[color:var(--color-border)] flex flex-col justify-between w-44 shrink-0">
        <div>
          <div className="label-caps">Timeline</div>
          <div className="text-xs text-[color:var(--color-text-tertiary)] mt-0.5">
            {passos.length} {passos.length === 1 ? "passo" : "passos"}
          </div>
        </div>
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs uppercase tracking-widest border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:border-[color:var(--color-gold)] hover:text-[color:var(--color-gold)] transition-colors"
        >
          <Plus size={12} /> Passo
        </button>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex items-center gap-2 p-3 h-full">
          {passos.length === 0 && (
            <div className="text-xs text-[color:var(--color-text-tertiary)] italic px-2">
              Crie o primeiro passo para começar a coreografar a apresentação.
            </div>
          )}
          {passos.map((p, i) => {
            const ativo = p.id === passoAtualId;
            return (
              <div
                key={p.id}
                draggable
                onDragStart={(e) => onDragStart(e, p.id)}
                onDragOver={onDragOver}
                onDrop={(e) => onDrop(e, p.id)}
                onClick={() => onSelect(p.id)}
                className={clsx(
                  "group relative shrink-0 w-48 h-20 rounded-md border p-2.5 cursor-pointer transition-colors select-none",
                  ativo
                    ? "border-[color:var(--color-gold)] bg-[color:var(--color-gold)]/5"
                    : "border-[color:var(--color-border)] bg-[color:var(--color-bg-elevated)] hover:border-[color:var(--color-gold)]/40"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className={clsx("text-[10px] uppercase tracking-widest font-medium", ativo ? "text-[color:var(--color-gold)]" : "text-[color:var(--color-text-tertiary)]")}>
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
                    {ativo && temSelecaoCanvas && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onAtribuirSelecao(p.id); }}
                        className="p-1 rounded text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-gold)]"
                        title="Atribuir seleção ao passo"
                      >
                        <Link2 size={11} />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onDuplicate(p.id); }}
                      className="p-1 rounded text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]"
                      title="Duplicar"
                    >
                      <Copy size={11} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                      className="p-1 rounded text-[color:var(--color-text-tertiary)] hover:text-red-400"
                      title="Excluir"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
                <div className="text-xs font-medium mt-1 leading-tight line-clamp-2">
                  {p.titulo}
                </div>
                <div className="absolute bottom-1.5 left-2.5 right-2.5 flex items-center justify-between text-[9px] text-[color:var(--color-text-tertiary)] uppercase tracking-wider">
                  <span>{p.entrada.efeito}</span>
                  <span>
                    {p.elementos_entrando.length > 0 && (
                      <span className="text-[color:var(--color-gold)]/70">
                        +{p.elementos_entrando.length}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
