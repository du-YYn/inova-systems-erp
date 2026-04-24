import { useEffect, useRef, useState } from "react";
import { Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { deleteAsset, listAssets, uploadAsset, type Asset } from "@/api/assets";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (asset: Asset) => void;
  selectedId?: string | null;
  hasSelectedCard: boolean;
}

export function AssetLibraryModal({ open, onClose, onSelect, selectedId, hasSelectedCard }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function carregar() {
    setLoading(true);
    try {
      const data = await listAssets();
      setAssets(data.results);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) carregar();
  }, [open]);

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadAsset(file, "logo");
      }
      await carregar();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Remover este asset?")) return;
    await deleteAsset(id);
    await carregar();
  }

  return (
    <Modal
      open={open}
      title="Biblioteca de assets"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 min-w-[420px]">
        {!hasSelectedCard && (
          <div className="text-xs px-3 py-2 rounded-md border border-[color:var(--color-gold)]/40 bg-[color:var(--color-gold)]/5 text-[color:var(--color-gold)]">
            Selecione um card no canvas para aplicar um logo. Aqui você pode gerenciar a biblioteca (upload / remover).
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="text-xs text-[color:var(--color-text-tertiary)]">
            {assets.length} {assets.length === 1 ? "asset" : "assets"}
          </div>
          <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs uppercase tracking-widest border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:border-[color:var(--color-gold)] hover:text-[color:var(--color-gold)] cursor-pointer transition-colors">
            <Upload size={12} />
            {uploading ? "Enviando..." : "Upload"}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => onUpload(e.target.files)}
              className="hidden"
            />
          </label>
        </div>

        {loading && (
          <div className="text-center text-sm text-[color:var(--color-text-tertiary)] py-8">
            Carregando...
          </div>
        )}

        {!loading && assets.length === 0 && (
          <div className="text-center text-sm text-[color:var(--color-text-tertiary)] py-8 border border-dashed border-[color:var(--color-border)] rounded-md">
            Nenhum asset ainda. Clique em Upload para adicionar logos.
          </div>
        )}

        {!loading && assets.length > 0 && (
          <div className="grid grid-cols-4 gap-3 max-h-80 overflow-y-auto">
            {assets.map((a) => {
              const sel = a.id === selectedId;
              return (
                <div
                  key={a.id}
                  className={`relative group rounded-md border p-3 flex flex-col items-center gap-2 transition-colors ${
                    hasSelectedCard ? "cursor-pointer" : "cursor-default"
                  } ${
                    sel
                      ? "border-[color:var(--color-gold)] bg-[color:var(--color-gold)]/10"
                      : "border-[color:var(--color-border)] hover:border-[color:var(--color-gold)]/50 bg-[color:var(--color-bg-elevated)]"
                  }`}
                  onClick={() => { if (hasSelectedCard) onSelect(a); }}
                >
                  <img
                    src={a.arquivo}
                    alt={a.nome}
                    className="w-12 h-12 object-contain"
                  />
                  <div className="text-[10px] text-center text-[color:var(--color-text-tertiary)] truncate w-full">
                    {a.nome}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(a.id); }}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 rounded text-[color:var(--color-text-tertiary)] hover:text-red-400 transition-opacity"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {selectedId && (
          <div className="flex items-center justify-between pt-3 border-t border-[color:var(--color-border)]">
            <span className="text-xs text-[color:var(--color-text-tertiary)]">Asset atual selecionado</span>
            <button
              onClick={() => onSelect({ id: "", nome: "", tipo: "logo", arquivo: "", tamanho_bytes: 0, criado_em: "" })}
              className="text-xs text-[color:var(--color-text-tertiary)] hover:text-red-400 inline-flex items-center gap-1"
            >
              <X size={12} /> Remover logo do card
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
