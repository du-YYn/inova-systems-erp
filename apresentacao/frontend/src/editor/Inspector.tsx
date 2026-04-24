import { Image, Plus, Trash2, X } from "lucide-react";
import { Input } from "@/components/Input";
import { CARD_TIPOS } from "./cardTypes";
import type { CardData, CardEdge, CardNode, EdgeData } from "./types";

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
      <aside className="w-80 border-l border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] p-6">
        <div className="label-caps">Inspector</div>
        <p className="text-xs text-[color:var(--color-text-tertiary)] mt-3 leading-relaxed">
          Selecione um card ou conexão para editar. Arraste da sidebar para adicionar cards.
        </p>
      </aside>
    );
  }

  if (selectedEdge) {
    return (
      <EdgeInspector
        edge={selectedEdge}
        onUpdate={(patch) => onUpdateEdge(selectedEdge.id, patch)}
        onDelete={() => onDeleteEdge(selectedEdge.id)}
      />
    );
  }

  return (
    <NodeInspector
      node={selectedNode!}
      onUpdate={(patch) => onUpdateNode(selectedNode!.id, patch)}
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
    const bullets = [...data.bullets];
    bullets[i] = value;
    onUpdate({ bullets });
  }

  function addBullet() {
    if (data.bullets.length >= 5) return;
    onUpdate({ bullets: [...data.bullets, ""] });
  }

  function removeBullet(i: number) {
    onUpdate({ bullets: data.bullets.filter((_, idx) => idx !== i) });
  }

  return (
    <aside className="w-80 border-l border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] flex flex-col">
      <div className="px-5 py-4 border-b border-[color:var(--color-border)] flex items-center justify-between">
        <div>
          <div className="label-caps">Card</div>
          <div className="text-sm font-medium mt-0.5">Propriedades</div>
        </div>
        <button
          onClick={onDelete}
          className="p-2 rounded-md text-[color:var(--color-text-tertiary)] hover:text-red-400 hover:bg-[color:var(--color-bg-elevated)] transition-colors"
          title="Excluir card"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="label-caps">Tipo</label>
          <select
            value={data.tipo}
            onChange={(e) => onUpdate({ tipo: e.target.value as CardData["tipo"] })}
            className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-md px-3 py-2 text-sm"
          >
            {CARD_TIPOS.map((m) => (
              <option key={m.tipo} value={m.tipo}>{m.label}</option>
            ))}
          </select>
        </div>

        <Input
          label="Título"
          value={data.titulo}
          onChange={(e) => onUpdate({ titulo: e.target.value })}
          placeholder="Ex: Webhook de entrada"
        />

        <div className="flex flex-col gap-1.5">
          <label className="label-caps">Descrição</label>
          <textarea
            value={data.descricao}
            onChange={(e) => onUpdate({ descricao: e.target.value })}
            rows={3}
            className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-md px-3 py-2 text-sm resize-none focus:border-[color:var(--color-gold)] transition-colors"
            placeholder="Texto explicativo..."
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="label-caps">Bullets ({data.bullets.length}/5)</label>
            <button
              onClick={addBullet}
              disabled={data.bullets.length >= 5}
              className="p-1 rounded-md text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-gold)] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Plus size={14} />
            </button>
          </div>
          {data.bullets.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={b}
                onChange={(e) => updateBullet(i, e.target.value)}
                className="flex-1 bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-md px-3 py-2 text-xs focus:border-[color:var(--color-gold)] transition-colors"
                placeholder={`Bullet ${i + 1}`}
              />
              <button
                onClick={() => removeBullet(i)}
                className="p-1.5 rounded-md text-[color:var(--color-text-tertiary)] hover:text-red-400"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="label-caps">Logo</label>
          <div className="flex items-center gap-2">
            <button
              onClick={onPickLogo}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-xs border border-[color:var(--color-border)] hover:border-[color:var(--color-gold)] text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-gold)] transition-colors flex-1"
            >
              {data.logo_url ? (
                <img src={data.logo_url} alt="" className="w-5 h-5 object-contain" />
              ) : (
                <Image size={14} />
              )}
              <span className="truncate">{data.logo_url ? "Trocar logo" : "Escolher da biblioteca"}</span>
            </button>
            {data.logo_url && (
              <button
                onClick={() => onUpdate({ logo_asset_id: null, logo_url: null })}
                className="p-2 rounded-md text-[color:var(--color-text-tertiary)] hover:text-red-400"
                title="Remover logo"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="label-caps">Cor override</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={data.cor_override ?? "#D4AF37"}
              onChange={(e) => onUpdate({ cor_override: e.target.value })}
              className="w-10 h-8 rounded border border-[color:var(--color-border)] bg-transparent cursor-pointer"
            />
            <button
              onClick={() => onUpdate({ cor_override: null })}
              disabled={!data.cor_override}
              className="text-xs text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)] disabled:opacity-30"
            >
              Usar cor do tipo
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="label-caps">Borda</label>
          <div className="flex gap-1">
            {(["fina", "media", "grossa"] as const).map((b) => (
              <button
                key={b}
                onClick={() => onUpdate({ borda: b })}
                className={`flex-1 py-2 rounded-md text-xs uppercase tracking-wider border transition-colors ${
                  data.borda === b
                    ? "border-[color:var(--color-gold)] text-[color:var(--color-gold)]"
                    : "border-[color:var(--color-border)] text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

function EdgeInspector({
  edge, onUpdate, onDelete,
}: { edge: CardEdge; onUpdate: (p: Partial<EdgeData>) => void; onDelete: () => void }) {
  const data = edge.data!;

  return (
    <aside className="w-80 border-l border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] flex flex-col">
      <div className="px-5 py-4 border-b border-[color:var(--color-border)] flex items-center justify-between">
        <div>
          <div className="label-caps">Conexão</div>
          <div className="text-sm font-medium mt-0.5">Propriedades</div>
        </div>
        <button
          onClick={onDelete}
          className="p-2 rounded-md text-[color:var(--color-text-tertiary)] hover:text-red-400 hover:bg-[color:var(--color-bg-elevated)] transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
        <Input
          label="Label"
          value={data.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="Ex: Se válido"
        />

        <div className="flex flex-col gap-1.5">
          <label className="label-caps">Estilo</label>
          <div className="flex gap-1">
            {(["bezier", "ortogonal"] as const).map((s) => (
              <button
                key={s}
                onClick={() => onUpdate({ estilo: s })}
                className={`flex-1 py-2 rounded-md text-xs uppercase tracking-wider border transition-colors ${
                  data.estilo === s
                    ? "border-[color:var(--color-gold)] text-[color:var(--color-gold)]"
                    : "border-[color:var(--color-border)] text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]"
                }`}
              >
                {s === "bezier" ? "Curva" : "Reta"}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="label-caps">Espessura</label>
          <div className="flex gap-1">
            {(["fina", "media", "grossa"] as const).map((e) => (
              <button
                key={e}
                onClick={() => onUpdate({ espessura: e })}
                className={`flex-1 py-2 rounded-md text-xs uppercase tracking-wider border transition-colors ${
                  data.espessura === e
                    ? "border-[color:var(--color-gold)] text-[color:var(--color-gold)]"
                    : "border-[color:var(--color-border)] text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="label-caps">Cor</label>
          <input
            type="color"
            value={data.cor}
            onChange={(e) => onUpdate({ cor: e.target.value })}
            className="w-full h-9 rounded border border-[color:var(--color-border)] bg-transparent cursor-pointer"
          />
        </div>

        <label className="flex items-center justify-between text-sm">
          <span>Seta</span>
          <input
            type="checkbox"
            checked={data.seta}
            onChange={(e) => onUpdate({ seta: e.target.checked })}
            className="accent-[color:var(--color-gold)]"
          />
        </label>

        <label className="flex items-center justify-between text-sm">
          <span>Animação (tracejado)</span>
          <input
            type="checkbox"
            checked={data.animado}
            onChange={(e) => onUpdate({ animado: e.target.checked })}
            className="accent-[color:var(--color-gold)]"
          />
        </label>
      </div>
    </aside>
  );
}
