import { Trash2 } from "lucide-react";
import { Input } from "@/components/Input";
import type { CardNode, EfeitoEntrada, ModoCamera, Passo } from "./types";

const EFEITOS: EfeitoEntrada[] = ["fade", "slide-up", "slide-down", "slide-left", "slide-right", "zoom", "pop", "draw", "typewriter"];
const MODOS_CAMERA: ModoCamera[] = ["auto-fit", "foco-card", "zoom-area", "livre", "travelling"];

interface Props {
  passo: Passo;
  nodes: CardNode[];
  onUpdate: (patch: Partial<Passo>) => void;
  onDelete: () => void;
}

export function PassoInspector({ passo, nodes, onUpdate, onDelete }: Props) {
  return (
    <aside className="w-80 border-l border-[color:var(--color-border)] bg-[color:var(--color-bg-secondary)] flex flex-col">
      <div className="px-5 py-4 border-b border-[color:var(--color-border)] flex items-center justify-between">
        <div>
          <div className="label-caps">Passo</div>
          <div className="text-sm font-medium mt-0.5">Propriedades</div>
        </div>
        <button
          onClick={onDelete}
          className="p-2 rounded-md text-[color:var(--color-text-tertiary)] hover:text-red-400 hover:bg-[color:var(--color-bg-elevated)] transition-colors"
          title="Excluir passo"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
        <Input
          label="Título"
          value={passo.titulo}
          onChange={(e) => onUpdate({ titulo: e.target.value })}
        />

        <div className="flex flex-col gap-1.5">
          <label className="label-caps">Elementos entrando ({passo.elementos_entrando.length})</label>
          {passo.elementos_entrando.length === 0 ? (
            <p className="text-[11px] text-[color:var(--color-text-tertiary)] leading-relaxed">
              Selecione cards/conexões no canvas e clique em <span className="text-[color:var(--color-gold)]">Atribuir</span> no card do passo.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {passo.elementos_entrando.map((id) => {
                const node = nodes.find((n) => n.id === id);
                const label = node?.data.titulo || (id.startsWith("e-") ? "Conexão" : "Elemento removido");
                return (
                  <div key={id} className="flex items-center justify-between text-xs bg-[color:var(--color-bg-elevated)] rounded px-2 py-1.5">
                    <span className="truncate">{label}</span>
                    <button
                      onClick={() => onUpdate({
                        elementos_entrando: passo.elementos_entrando.filter((x) => x !== id),
                      })}
                      className="text-[color:var(--color-text-tertiary)] hover:text-red-400 ml-2"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                );
              })}
              <button
                onClick={() => onUpdate({ elementos_entrando: [] })}
                className="text-[10px] uppercase tracking-widest text-[color:var(--color-text-tertiary)] hover:text-red-400 mt-1 self-start"
              >
                Limpar todos
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-[color:var(--color-border)] pt-4">
          <div className="label-caps mb-3">Entrada</div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="label-caps">Efeito</label>
              <select
                value={passo.entrada.efeito}
                onChange={(e) => onUpdate({ entrada: { ...passo.entrada, efeito: e.target.value as EfeitoEntrada } })}
                className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-md px-3 py-2 text-sm"
              >
                {EFEITOS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <NumberField
              label={`Duração: ${passo.entrada.duracao_ms}ms`}
              value={passo.entrada.duracao_ms}
              min={100} max={3000} step={50}
              onChange={(v) => onUpdate({ entrada: { ...passo.entrada, duracao_ms: v } })}
            />
            <NumberField
              label={`Stagger: ${passo.entrada.stagger_ms}ms`}
              value={passo.entrada.stagger_ms}
              min={0} max={500} step={20}
              onChange={(v) => onUpdate({ entrada: { ...passo.entrada, stagger_ms: v } })}
            />
          </div>
        </div>

        <label className="flex items-center justify-between text-sm border-t border-[color:var(--color-border)] pt-4">
          <span>Saída dos anteriores</span>
          <input
            type="checkbox"
            checked={passo.saida_anteriores}
            onChange={(e) => onUpdate({ saida_anteriores: e.target.checked })}
            className="accent-[color:var(--color-gold)]"
          />
        </label>

        <div className="border-t border-[color:var(--color-border)] pt-4">
          <div className="label-caps mb-3">Câmera</div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="label-caps">Modo</label>
              <select
                value={passo.camera.modo}
                onChange={(e) => onUpdate({ camera: { ...passo.camera, modo: e.target.value as ModoCamera } })}
                className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-md px-3 py-2 text-sm"
              >
                {MODOS_CAMERA.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {passo.camera.modo === "foco-card" && (
              <div className="flex flex-col gap-1.5">
                <label className="label-caps">Card alvo</label>
                <select
                  value={passo.camera.target ?? ""}
                  onChange={(e) => onUpdate({ camera: { ...passo.camera, target: e.target.value || null } })}
                  className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-md px-3 py-2 text-sm"
                >
                  <option value="">Selecione...</option>
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>{n.data.titulo || n.id}</option>
                  ))}
                </select>
              </div>
            )}

            <NumberField
              label={`Zoom: ${passo.camera.zoom.toFixed(2)}x`}
              value={passo.camera.zoom * 100}
              min={25} max={300} step={5}
              onChange={(v) => onUpdate({ camera: { ...passo.camera, zoom: v / 100 } })}
            />
            <NumberField
              label={`Transição: ${passo.camera.transicao_ms}ms`}
              value={passo.camera.transicao_ms}
              min={0} max={3000} step={50}
              onChange={(v) => onUpdate({ camera: { ...passo.camera, transicao_ms: v } })}
            />
          </div>
        </div>

        <div className="border-t border-[color:var(--color-border)] pt-4">
          <div className="label-caps mb-3">Highlight</div>
          <label className="flex items-center justify-between text-sm mb-3">
            <span>Escurecer outros elementos</span>
            <input
              type="checkbox"
              checked={passo.highlight.escurecer_outros}
              onChange={(e) => onUpdate({ highlight: { ...passo.highlight, escurecer_outros: e.target.checked } })}
              className="accent-[color:var(--color-gold)]"
            />
          </label>
          {passo.highlight.escurecer_outros && (
            <NumberField
              label={`Intensidade: ${passo.highlight.intensidade}%`}
              value={passo.highlight.intensidade}
              min={10} max={90} step={5}
              onChange={(v) => onUpdate({ highlight: { ...passo.highlight, intensidade: v } })}
            />
          )}
        </div>

        <div className="border-t border-[color:var(--color-border)] pt-4">
          <div className="label-caps mb-2">Narração do apresentador</div>
          <textarea
            value={passo.narracao_apresentador}
            onChange={(e) => onUpdate({ narracao_apresentador: e.target.value })}
            rows={4}
            placeholder="Notas pessoais que você lê ao apresentar..."
            className="w-full bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-md px-3 py-2 text-sm resize-none focus:border-[color:var(--color-gold)] transition-colors"
          />
        </div>
      </div>
    </aside>
  );
}

function NumberField({
  label, value, min, max, step, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="label-caps">{label}</label>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-[color:var(--color-gold)]"
      />
    </div>
  );
}
