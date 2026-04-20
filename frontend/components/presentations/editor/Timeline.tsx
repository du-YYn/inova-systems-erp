'use client';

import type { DragEvent } from 'react';
import { Copy, Link2, Plus, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { Step } from '@/lib/presentations/types';

interface Props {
  steps: Step[];
  currentStepId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onAttachSelection: (id: string) => void;
  hasCanvasSelection: boolean;
}

export function Timeline({
  steps, currentStepId, onSelect, onAdd, onDuplicate, onDelete, onReorder, onAttachSelection, hasCanvasSelection,
}: Props) {
  function onDragStart(e: DragEvent, id: string) {
    e.dataTransfer.setData('application/inova-step', id);
    e.dataTransfer.effectAllowed = 'move';
  }
  function onDragOver(e: DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
  function onDrop(e: DragEvent, targetId: string) {
    e.preventDefault();
    const srcId = e.dataTransfer.getData('application/inova-step');
    if (!srcId || srcId === targetId) return;
    const ids = steps.map((s) => s.id);
    const src = ids.indexOf(srcId);
    const tgt = ids.indexOf(targetId);
    if (src < 0 || tgt < 0) return;
    const next = [...ids];
    next.splice(src, 1);
    next.splice(tgt, 0, srcId);
    onReorder(next);
  }

  return (
    <div className="h-28 border-t border-[color:var(--pr-border)] bg-[color:var(--pr-bg-secondary)] shrink-0 flex items-stretch">
      <div className="px-5 py-3 border-r border-[color:var(--pr-border)] flex flex-col justify-between w-44 shrink-0">
        <div>
          <div className="pr-label-caps">Timeline</div>
          <div className="text-xs text-[color:var(--pr-text-tertiary)] mt-0.5">
            {steps.length} {steps.length === 1 ? 'passo' : 'passos'}
          </div>
        </div>
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs uppercase tracking-widest border border-[color:var(--pr-border)] text-[color:var(--pr-text-secondary)] hover:border-[color:var(--pr-gold)] hover:text-[color:var(--pr-gold)] transition-colors"
        >
          <Plus size={12} /> Passo
        </button>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex items-center gap-2 p-3 h-full">
          {steps.length === 0 && (
            <div className="text-xs text-[color:var(--pr-text-tertiary)] italic px-2">
              Crie o primeiro passo para começar a coreografar a apresentação.
            </div>
          )}
          {steps.map((p, i) => {
            const active = p.id === currentStepId;
            return (
              <div
                key={p.id}
                draggable
                onDragStart={(e) => onDragStart(e, p.id)}
                onDragOver={onDragOver}
                onDrop={(e) => onDrop(e, p.id)}
                onClick={() => onSelect(p.id)}
                className={clsx(
                  'group relative shrink-0 w-48 h-20 rounded-md border p-2.5 cursor-pointer transition-colors select-none',
                  active
                    ? 'border-[color:var(--pr-gold)] bg-[color:var(--pr-gold)]/5'
                    : 'border-[color:var(--pr-border)] bg-[color:var(--pr-bg-elevated)] hover:border-[color:var(--pr-gold)]/40',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className={clsx('text-[10px] uppercase tracking-widest font-medium',
                    active ? 'text-[color:var(--pr-gold)]' : 'text-[color:var(--pr-text-tertiary)]')}>
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
                    {active && hasCanvasSelection && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onAttachSelection(p.id); }}
                        className="p-1 rounded text-[color:var(--pr-text-tertiary)] hover:text-[color:var(--pr-gold)]"
                        title="Atribuir seleção ao passo"
                      >
                        <Link2 size={11} />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onDuplicate(p.id); }}
                      className="p-1 rounded text-[color:var(--pr-text-tertiary)] hover:text-[color:var(--pr-text-primary)]"
                      title="Duplicar"
                    >
                      <Copy size={11} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
                      className="p-1 rounded text-[color:var(--pr-text-tertiary)] hover:text-red-400"
                      title="Excluir"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
                <div className="text-xs font-medium mt-1 leading-tight line-clamp-2">
                  {p.titulo}
                </div>
                <div className="absolute bottom-1.5 left-2.5 right-2.5 flex items-center justify-between text-[9px] text-[color:var(--pr-text-tertiary)] uppercase tracking-wider">
                  <span>{p.entrada.efeito}</span>
                  {p.elementos_entrando.length > 0 && (
                    <span className="text-[color:var(--pr-gold)]/70">+{p.elementos_entrando.length}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
