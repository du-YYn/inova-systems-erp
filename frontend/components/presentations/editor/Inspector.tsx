'use client';

import { Image, Plus, Trash2, X } from 'lucide-react';
import { CARD_TYPES } from '@/lib/presentations/cardTypes';
import type { CardData, CardEdge, CardNode, EdgeData } from '@/lib/presentations/types';

interface Props {
  selectedNode: CardNode | null;
  selectedEdge: CardEdge | null;
  onUpdateNode: (id: string, patch: Partial<CardData>) => void;
  onUpdateEdge: (id: string, patch: Partial<EdgeData>) => void;
  onDeleteNode: (id: string) => void;
  onDeleteEdge: (id: string) => void;
  onPickLogo: () => void;
}

export function Inspector({
  selectedNode, selectedEdge, onUpdateNode, onUpdateEdge, onDeleteNode, onDeleteEdge, onPickLogo,
}: Props) {
  if (!selectedNode && !selectedEdge) {
    return (
      <aside className="w-80 border-l border-[color:var(--pr-border)] bg-[color:var(--pr-bg-secondary)] p-6">
        <div className="pr-label-caps">Inspector</div>
        <p className="text-xs text-[color:var(--pr-text-tertiary)] mt-3 leading-relaxed">
          Selecione um card ou conexão para editar. Arraste da sidebar para adicionar cards.
        </p>
      </aside>
    );
  }
  if (selectedEdge) {
    return (
      <EdgeInspector
        edge={selectedEdge}
        onUpdate={(p) => onUpdateEdge(selectedEdge.id, p)}
        onDelete={() => onDeleteEdge(selectedEdge.id)}
      />
    );
  }
  return (
    <NodeInspector
      node={selectedNode!}
      onUpdate={(p) => onUpdateNode(selectedNode!.id, p)}
      onDelete={() => onDeleteNode(selectedNode!.id)}
      onPickLogo={onPickLogo}
    />
  );
}

function NodeInspector({
  node, onUpdate, onDelete, onPickLogo,
}: { node: CardNode; onUpdate: (p: Partial<CardData>) => void; onDelete: () => void; onPickLogo: () => void }) {
  const { data } = node;

  function updateBullet(i: number, value: string) {
    const next = [...data.bullets];
    next[i] = value;
    onUpdate({ bullets: next });
  }
  function addBullet() {
    if (data.bullets.length >= 5) return;
    onUpdate({ bullets: [...data.bullets, ''] });
  }
  function removeBullet(i: number) {
    onUpdate({ bullets: data.bullets.filter((_, idx) => idx !== i) });
  }

  return (
    <aside className="w-80 border-l border-[color:var(--pr-border)] bg-[color:var(--pr-bg-secondary)] flex flex-col">
      <div className="px-5 py-4 border-b border-[color:var(--pr-border)] flex items-center justify-between">
        <div>
          <div className="pr-label-caps">Card</div>
          <div className="text-sm font-medium mt-0.5">Propriedades</div>
        </div>
        <button
          onClick={onDelete}
          className="p-2 rounded-md text-[color:var(--pr-text-tertiary)] hover:text-red-400 hover:bg-[color:var(--pr-bg-elevated)] transition-colors"
          title="Excluir card"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
        <LabeledSelect
          label="Tipo"
          value={data.tipo}
          options={CARD_TYPES.map((m) => ({ value: m.tipo, label: m.label }))}
          onChange={(v) => onUpdate({ tipo: v as CardData['tipo'] })}
        />

        <LabeledInput label="Título" value={data.titulo} onChange={(v) => onUpdate({ titulo: v })} placeholder="Ex: Webhook de entrada" />

        <div className="flex flex-col gap-1.5">
          <label className="pr-label-caps">Descrição</label>
          <textarea
            value={data.descricao}
            onChange={(e) => onUpdate({ descricao: e.target.value })}
            rows={3}
            className="bg-[color:var(--pr-bg-elevated)] border border-[color:var(--pr-border)] rounded-md px-3 py-2 text-sm resize-none focus:border-[color:var(--pr-gold)] transition-colors"
            placeholder="Texto explicativo..."
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="pr-label-caps">Logo</label>
          <div className="flex items-center gap-2">
            <button
              onClick={onPickLogo}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-xs border border-[color:var(--pr-border)] hover:border-[color:var(--pr-gold)] text-[color:var(--pr-text-secondary)] hover:text-[color:var(--pr-gold)] transition-colors flex-1"
            >
              {data.logo_url ? (
                <img src={data.logo_url} alt="" className="w-5 h-5 object-contain" />
              ) : (
                <Image size={14} />
              )}
              <span className="truncate">{data.logo_url ? 'Trocar logo' : 'Escolher da biblioteca'}</span>
            </button>
            {data.logo_url && (
              <button
                onClick={() => onUpdate({ logo_asset_id: null, logo_url: null })}
                className="p-2 rounded-md text-[color:var(--pr-text-tertiary)] hover:text-red-400"
                title="Remover logo"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="pr-label-caps">Bullets ({data.bullets.length}/5)</label>
            <button
              onClick={addBullet}
              disabled={data.bullets.length >= 5}
              className="p-1 rounded-md text-[color:var(--pr-text-tertiary)] hover:text-[color:var(--pr-gold)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Plus size={14} />
            </button>
          </div>
          {data.bullets.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={b}
                onChange={(e) => updateBullet(i, e.target.value)}
                className="flex-1 bg-[color:var(--pr-bg-elevated)] border border-[color:var(--pr-border)] rounded-md px-3 py-2 text-xs focus:border-[color:var(--pr-gold)] transition-colors"
                placeholder={`Bullet ${i + 1}`}
              />
              <button
                onClick={() => removeBullet(i)}
                className="p-1.5 rounded-md text-[color:var(--pr-text-tertiary)] hover:text-red-400"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="pr-label-caps">Cor override</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={data.cor_override ?? '#A6864A'}
              onChange={(e) => onUpdate({ cor_override: e.target.value })}
              className="w-10 h-8 rounded border border-[color:var(--pr-border)] bg-transparent cursor-pointer"
            />
            <button
              onClick={() => onUpdate({ cor_override: null })}
              disabled={!data.cor_override}
              className="text-xs text-[color:var(--pr-text-tertiary)] hover:text-[color:var(--pr-text-primary)] disabled:opacity-30"
            >
              Usar cor do tipo
            </button>
          </div>
        </div>

        <SegmentedControl
          label="Borda"
          value={data.borda}
          options={[['fina', 'fina'], ['media', 'média'], ['grossa', 'grossa']] as const}
          onChange={(v) => onUpdate({ borda: v as CardData['borda'] })}
        />
      </div>
    </aside>
  );
}

function EdgeInspector({
  edge, onUpdate, onDelete,
}: { edge: CardEdge; onUpdate: (p: Partial<EdgeData>) => void; onDelete: () => void }) {
  const data = edge.data!;
  return (
    <aside className="w-80 border-l border-[color:var(--pr-border)] bg-[color:var(--pr-bg-secondary)] flex flex-col">
      <div className="px-5 py-4 border-b border-[color:var(--pr-border)] flex items-center justify-between">
        <div>
          <div className="pr-label-caps">Conexão</div>
          <div className="text-sm font-medium mt-0.5">Propriedades</div>
        </div>
        <button
          onClick={onDelete}
          className="p-2 rounded-md text-[color:var(--pr-text-tertiary)] hover:text-red-400 hover:bg-[color:var(--pr-bg-elevated)] transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
        <LabeledInput label="Label" value={data.label} onChange={(v) => onUpdate({ label: v })} placeholder="Ex: Se válido" />

        <SegmentedControl
          label="Estilo"
          value={data.estilo}
          options={[['bezier', 'curva'], ['ortogonal', 'reta']] as const}
          onChange={(v) => onUpdate({ estilo: v as EdgeData['estilo'] })}
        />
        <SegmentedControl
          label="Espessura"
          value={data.espessura}
          options={[['fina', 'fina'], ['media', 'média'], ['grossa', 'grossa']] as const}
          onChange={(v) => onUpdate({ espessura: v as EdgeData['espessura'] })}
        />

        <div className="flex flex-col gap-1.5">
          <label className="pr-label-caps">Cor</label>
          <input
            type="color"
            value={data.cor}
            onChange={(e) => onUpdate({ cor: e.target.value })}
            className="w-full h-9 rounded border border-[color:var(--pr-border)] bg-transparent cursor-pointer"
          />
        </div>

        <Checkbox label="Seta"                        checked={data.seta}    onChange={(v) => onUpdate({ seta: v })} />
        <Checkbox label="Animação (tracejado)"        checked={data.animado} onChange={(v) => onUpdate({ animado: v })} />
      </div>
    </aside>
  );
}

// ───── tiny form primitives (scoped to this inspector) ───────────────────────

function LabeledInput({ label, value, onChange, placeholder }:
  { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="pr-label-caps">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-[color:var(--pr-bg-elevated)] border border-[color:var(--pr-border)] rounded-md px-3 py-2 text-sm focus:border-[color:var(--pr-gold)] transition-colors"
      />
    </div>
  );
}

function LabeledSelect({ label, value, options, onChange }:
  { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="pr-label-caps">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[color:var(--pr-bg-elevated)] border border-[color:var(--pr-border)] rounded-md px-3 py-2 text-sm"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function SegmentedControl<V extends string>({ label, value, options, onChange }:
  { label: string; value: V; options: readonly (readonly [V, string])[]; onChange: (v: V) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="pr-label-caps">{label}</label>
      <div className="flex gap-1">
        {options.map(([v, l]) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`flex-1 py-2 rounded-md text-xs uppercase tracking-wider border transition-colors ${
              value === v
                ? 'border-[color:var(--pr-gold)] text-[color:var(--pr-gold)]'
                : 'border-[color:var(--pr-border)] text-[color:var(--pr-text-tertiary)] hover:text-[color:var(--pr-text-primary)]'
            }`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Checkbox({ label, checked, onChange }:
  { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[color:var(--pr-gold)]"
      />
    </label>
  );
}
