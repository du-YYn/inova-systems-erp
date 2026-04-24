import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import type { ConfigJson } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  config: ConfigJson;
  onChange: (patch: Partial<ConfigJson>) => void;
}

export function ConfigModal({ open, onClose, config, onChange }: Props) {
  return (
    <Modal
      open={open}
      title="Configurações da apresentação"
      onClose={onClose}
      footer={<Button variant="ghost" onClick={onClose}>Fechar</Button>}
    >
      <div className="flex flex-col gap-5 min-w-[380px]">
        <div className="flex flex-col gap-1.5">
          <label className="label-caps">Cor de fundo</label>
          <input
            type="color"
            value={config.cor_fundo}
            onChange={(e) => onChange({ cor_fundo: e.target.value })}
            className="w-full h-10 rounded border border-[color:var(--color-border)] bg-transparent cursor-pointer"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="label-caps">Cor de acento</label>
          <input
            type="color"
            value={config.cor_acento}
            onChange={(e) => onChange({ cor_acento: e.target.value })}
            className="w-full h-10 rounded border border-[color:var(--color-border)] bg-transparent cursor-pointer"
          />
          <span className="text-[11px] text-[color:var(--color-text-tertiary)]">
            Aplicada em destaques e CTAs durante apresentação
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="label-caps">URL do logo do cliente</label>
          <input
            type="text"
            value={config.logo_cliente_url ?? ""}
            onChange={(e) => onChange({ logo_cliente_url: e.target.value || null })}
            placeholder="https://..."
            className="bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-md px-3 py-2 text-sm focus:border-[color:var(--color-gold)] transition-colors"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="label-caps">Posição do logo</label>
          <div className="flex gap-1">
            {(["topo-esquerda", "topo-direita", "rodape"] as const).map((p) => (
              <button
                key={p}
                onClick={() => onChange({ logo_cliente_posicao: p })}
                className={`flex-1 py-2 rounded-md text-[11px] uppercase tracking-wider border transition-colors ${
                  config.logo_cliente_posicao === p
                    ? "border-[color:var(--color-gold)] text-[color:var(--color-gold)]"
                    : "border-[color:var(--color-border)] text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]"
                }`}
              >
                {p.replace("-", " ")}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
