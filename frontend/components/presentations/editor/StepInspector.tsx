'use client';

import { Trash2 } from 'lucide-react';
import type { CameraMode, CardNode, EntryEffect, Step } from '@/lib/presentations/types';

const EFFECTS: EntryEffect[] = [
  'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right',
  'zoom', 'pop', 'draw', 'typewriter',
];
const CAMERAS: CameraMode[] = ['auto-fit', 'foco-card', 'zoom-area', 'livre', 'travelling'];

interface Props {
  step: Step;
  nodes: CardNode[];
  onUpdate: (patch: Partial<Step>) => void;
  onDelete: () => void;
}

export function StepInspector({ step, nodes, onUpdate, onDelete }: Props) {
  return (
    <aside className="w-80 border-l border-[color:var(--pr-border)] bg-[color:var(--pr-bg-secondary)] flex flex-col">
      <div className="px-5 py-4 border-b border-[color:var(--pr-border)] flex items-center justify-between">
        <div>
          <div className="pr-label-caps">Passo</div>
          <div className="text-sm font-medium mt-0.5">Propriedades</div>
        </div>
        <button
          onClick={onDelete}
          className="p-2 rounded-md text-[color:var(--pr-text-tertiary)] hover:text-red-400 hover:bg-[color:var(--pr-bg-elevated)] transition-colors"
          title="Excluir passo"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
        <TextField label="Título" value={step.titulo} onChange={(v) => onUpdate({ titulo: v })} />

        <div className="flex flex-col gap-1.5">
          <label className="pr-label-caps">Elementos entrando ({step.elementos_entrando.length})</label>
          {step.elementos_entrando.length === 0 ? (
            <p className="text-[11px] text-[color:var(--pr-text-tertiary)] leading-relaxed">
              Selecione cards/conexões no canvas e clique em <span className="text-[color:var(--pr-gold)]">Atribuir</span> no card do passo.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {step.elementos_entrando.map((id) => {
                const node = nodes.find((n) => n.id === id);
                const label = node?.data.titulo || (id.startsWith('e-') ? 'Conexão' : 'Elemento removido');
                return (
                  <div key={id} className="flex items-center justify-between text-xs bg-[color:var(--pr-bg-elevated)] rounded px-2 py-1.5">
                    <span className="truncate">{label}</span>
                    <button
                      onClick={() => onUpdate({ elementos_entrando: step.elementos_entrando.filter((x) => x !== id) })}
                      className="text-[color:var(--pr-text-tertiary)] hover:text-red-400 ml-2"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                );
              })}
              <button
                onClick={() => onUpdate({ elementos_entrando: [] })}
                className="text-[10px] uppercase tracking-widest text-[color:var(--pr-text-tertiary)] hover:text-red-400 mt-1 self-start"
              >
                Limpar todos
              </button>
            </div>
          )}
        </div>

        <Section title="Entrada">
          <SelectField
            label="Efeito"
            value={step.entrada.efeito}
            options={EFFECTS.map((f) => [f, f])}
            onChange={(v) => onUpdate({ entrada: { ...step.entrada, efeito: v as EntryEffect } })}
          />
          <RangeField
            label={`Duração: ${step.entrada.duracao_ms}ms`}
            value={step.entrada.duracao_ms} min={100} max={3000} step={50}
            onChange={(v) => onUpdate({ entrada: { ...step.entrada, duracao_ms: v } })}
          />
          <RangeField
            label={`Stagger: ${step.entrada.stagger_ms}ms`}
            value={step.entrada.stagger_ms} min={0} max={500} step={20}
            onChange={(v) => onUpdate({ entrada: { ...step.entrada, stagger_ms: v } })}
          />
        </Section>

        <label className="flex items-center justify-between text-sm border-t border-[color:var(--pr-border)] pt-4">
          <span>Saída dos anteriores</span>
          <input
            type="checkbox"
            checked={step.saida_anteriores}
            onChange={(e) => onUpdate({ saida_anteriores: e.target.checked })}
            className="accent-[color:var(--pr-gold)]"
          />
        </label>

        <Section title="Câmera">
          <SelectField
            label="Modo"
            value={step.camera.modo}
            options={CAMERAS.map((m) => [m, m])}
            onChange={(v) => onUpdate({ camera: { ...step.camera, modo: v as CameraMode } })}
          />
          {step.camera.modo === 'foco-card' && (
            <SelectField
              label="Card alvo"
              value={step.camera.target ?? ''}
              options={[['', 'Selecione...'], ...nodes.map((n) => [n.id, n.data.titulo || n.id] as [string, string])]}
              onChange={(v) => onUpdate({ camera: { ...step.camera, target: v || null } })}
            />
          )}
          <RangeField
            label={`Zoom: ${step.camera.zoom.toFixed(2)}x`}
            value={step.camera.zoom * 100} min={25} max={300} step={5}
            onChange={(v) => onUpdate({ camera: { ...step.camera, zoom: v / 100 } })}
          />
          <RangeField
            label={`Transição: ${step.camera.transicao_ms}ms`}
            value={step.camera.transicao_ms} min={0} max={3000} step={50}
            onChange={(v) => onUpdate({ camera: { ...step.camera, transicao_ms: v } })}
          />
        </Section>

        <Section title="Highlight">
          <label className="flex items-center justify-between text-sm mb-2">
            <span>Escurecer outros elementos</span>
            <input
              type="checkbox"
              checked={step.highlight.escurecer_outros}
              onChange={(e) => onUpdate({ highlight: { ...step.highlight, escurecer_outros: e.target.checked } })}
              className="accent-[color:var(--pr-gold)]"
            />
          </label>
          {step.highlight.escurecer_outros && (
            <RangeField
              label={`Intensidade: ${step.highlight.intensidade}%`}
              value={step.highlight.intensidade} min={10} max={90} step={5}
              onChange={(v) => onUpdate({ highlight: { ...step.highlight, intensidade: v } })}
            />
          )}
        </Section>

        <Section title="Narração do apresentador">
          <textarea
            value={step.narracao_apresentador}
            onChange={(e) => onUpdate({ narracao_apresentador: e.target.value })}
            rows={4}
            placeholder="Notas pessoais que você lê ao apresentar..."
            className="w-full bg-[color:var(--pr-bg-elevated)] border border-[color:var(--pr-border)] rounded-md px-3 py-2 text-sm resize-none focus:border-[color:var(--pr-gold)] transition-colors"
          />
        </Section>
      </div>
    </aside>
  );
}

// ───── small primitives ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[color:var(--pr-border)] pt-4">
      <div className="pr-label-caps mb-3">{title}</div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="pr-label-caps">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[color:var(--pr-bg-elevated)] border border-[color:var(--pr-border)] rounded-md px-3 py-2 text-sm focus:border-[color:var(--pr-gold)] transition-colors"
      />
    </div>
  );
}

function SelectField({ label, value, options, onChange }:
  { label: string; value: string; options: (readonly [string, string])[]; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="pr-label-caps">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[color:var(--pr-bg-elevated)] border border-[color:var(--pr-border)] rounded-md px-3 py-2 text-sm"
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function RangeField({ label, value, min, max, step, onChange }:
  { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="pr-label-caps">{label}</label>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-[color:var(--pr-gold)]"
      />
    </div>
  );
}
