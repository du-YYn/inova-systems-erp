'use client';

import { useRef, useState } from 'react';
import {
  Check, Plus, X, Paperclip, PenLine, Link2, ExternalLink, Download,
} from 'lucide-react';
import type { LegalCaseTask } from './types';

interface StageWorkspaceProps {
  stageLabel: string;
  tasks: LegalCaseTask[];           // já filtradas para a etapa atual
  attachmentUrl: string | null;
  notes: string;
  autentiqueId: string;
  autentiqueLink: string;
  onToggle: (task: LegalCaseTask) => void;
  onAdd: (label: string) => void;
  onRemove: (task: LegalCaseTask) => void;
  onUpload: (file: File) => void;
  onSaveNotes: (notes: string) => void;
  onSaveAutentique: (id: string, link: string) => void;
}

export default function StageWorkspace({
  stageLabel, tasks, attachmentUrl, notes, autentiqueId, autentiqueLink,
  onToggle, onAdd, onRemove, onUpload, onSaveNotes, onSaveAutentique,
}: StageWorkspaceProps) {
  const [newTask, setNewTask] = useState('');
  const [openTool, setOpenTool] = useState<null | 'notes' | 'autentique'>(null);
  const [notesDraft, setNotesDraft] = useState(notes);
  const [aId, setAId] = useState(autentiqueId);
  const [aLink, setALink] = useState(autentiqueLink);
  const fileRef = useRef<HTMLInputElement>(null);

  const doneCount = tasks.filter((t) => t.done).length;

  return (
    <div className="mx-1 mb-5 rounded-xl border border-accent-gold/30 bg-accent-gold/[0.06] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-bold uppercase tracking-wide text-accent-gold">
          ▸ Etapa atual: {stageLabel}
        </div>
        <span className="text-[11px] text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-2.5 py-0.5">
          {doneCount} de {tasks.length} tarefas
        </span>
      </div>

      {/* Checklist */}
      <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-lg p-3 mb-3">
        {tasks.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-2">Sem tarefas nesta etapa.</p>
        )}
        {tasks.map((task) => (
          <div key={task.id} className="flex items-center gap-2 py-1 group">
            <button
              type="button"
              onClick={() => onToggle(task)}
              aria-label={task.done ? 'Desmarcar tarefa' : 'Marcar tarefa como feita'}
              className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                task.done
                  ? 'bg-green-600 border-green-600 text-white'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            >
              {task.done && <Check className="w-3 h-3" />}
            </button>
            <span className={`text-sm flex-1 ${task.done ? 'line-through text-gray-400' : 'text-gray-700 dark:text-gray-200'}`}>
              {task.label}
            </span>
            {task.done && task.done_by_name && (
              <span className="text-[10px] text-gray-400">{task.done_by_name}</span>
            )}
            <button
              type="button"
              onClick={() => onRemove(task)}
              aria-label="Remover tarefa"
              className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-rose-500"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {/* Adicionar tarefa avulsa */}
        <form
          onSubmit={(e) => { e.preventDefault(); onAdd(newTask); setNewTask(''); }}
          className="flex items-center gap-2 pt-2 mt-1 border-t border-dashed border-gray-100 dark:border-gray-700"
        >
          <Plus className="w-3.5 h-3.5 text-gray-400" />
          <input
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            placeholder="adicionar tarefa…"
            className="flex-1 bg-transparent text-sm outline-none text-gray-700 dark:text-gray-200 placeholder:text-gray-400"
          />
        </form>
      </div>

      {/* Ferramentas */}
      <div className="flex flex-wrap gap-2 mb-1">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = ''; }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="text-xs text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 inline-flex items-center gap-1.5 hover:border-accent-gold"
        >
          <Paperclip className="w-3.5 h-3.5" /> Anexar documento
        </button>
        <button
          type="button"
          onClick={() => { setNotesDraft(notes); setOpenTool(openTool === 'notes' ? null : 'notes'); }}
          className="text-xs text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 inline-flex items-center gap-1.5 hover:border-accent-gold"
        >
          <PenLine className="w-3.5 h-3.5" /> Editar notas
        </button>
        <button
          type="button"
          onClick={() => { setAId(autentiqueId); setALink(autentiqueLink); setOpenTool(openTool === 'autentique' ? null : 'autentique'); }}
          className="text-xs text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 inline-flex items-center gap-1.5 hover:border-accent-gold"
        >
          <Link2 className="w-3.5 h-3.5" /> Link Autentique
        </button>
      </div>

      {/* Estado atual do documento/link */}
      {(attachmentUrl || autentiqueLink) && (
        <div className="flex flex-wrap gap-3 mt-2">
          {attachmentUrl && (
            <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 inline-flex items-center gap-1 hover:underline">
              <Download className="w-3 h-3" /> Documento anexado
            </a>
          )}
          {autentiqueLink && (
            <a href={autentiqueLink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 inline-flex items-center gap-1 hover:underline">
              <ExternalLink className="w-3 h-3" /> Documento no Autentique
            </a>
          )}
        </div>
      )}

      {/* Editor de notas inline */}
      {openTool === 'notes' && (
        <div className="mt-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            rows={3}
            className="w-full input-field text-sm"
            placeholder="Anotações do jurídico"
          />
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={() => setOpenTool(null)} className="text-xs px-3 py-1 border border-gray-200 dark:border-gray-700 rounded-lg">Cancelar</button>
            <button type="button" onClick={() => { onSaveNotes(notesDraft); setOpenTool(null); }} className="text-xs px-3 py-1 bg-accent-gold text-white rounded-lg">Salvar</button>
          </div>
        </div>
      )}

      {/* Editor do Autentique inline */}
      {openTool === 'autentique' && (
        <div className="mt-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
          <input value={aId} onChange={(e) => setAId(e.target.value)} placeholder="ID do documento no Autentique" className="w-full input-field text-sm" />
          <input value={aLink} onChange={(e) => setALink(e.target.value)} type="url" placeholder="https://app.autentique.com.br/…" className="w-full input-field text-sm" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpenTool(null)} className="text-xs px-3 py-1 border border-gray-200 dark:border-gray-700 rounded-lg">Cancelar</button>
            <button type="button" onClick={() => { onSaveAutentique(aId, aLink); setOpenTool(null); }} className="text-xs px-3 py-1 bg-accent-gold text-white rounded-lg">Salvar</button>
          </div>
        </div>
      )}
    </div>
  );
}
