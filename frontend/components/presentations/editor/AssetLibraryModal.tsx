'use client';

import { useEffect, useRef, useState } from 'react';
import { Trash2, Upload, X } from 'lucide-react';
import { deleteAsset, listAssets, uploadAsset } from '@/lib/presentations/api';
import type { Asset } from '@/lib/presentations/types';
import { Modal } from './Modal';
import { PButton } from './buttons';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (asset: Asset | null) => void;
  selectedId?: string | null;
  hasSelectedCard: boolean;
}

export function AssetLibraryModal({ open, onClose, onSelect, selectedId, hasSelectedCard }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await listAssets();
      setAssets(data.results);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (open) load(); }, [open]);

  async function onUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) await uploadAsset(f, 'logo');
      await load();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Remover este asset?')) return;
    await deleteAsset(id);
    await load();
  }

  return (
    <Modal open={open} title="Biblioteca de assets" onClose={onClose} footer={<PButton variant="ghost" onClick={onClose}>Fechar</PButton>}>
      <div className="flex flex-col gap-4 min-w-[420px]">
        {!hasSelectedCard && (
          <div className="text-xs px-3 py-2 rounded-md border border-[color:var(--pr-gold)]/40 bg-[color:var(--pr-gold)]/5 text-[color:var(--pr-gold)]">
            Selecione um card no canvas para aplicar um logo. Aqui você gerencia a biblioteca (upload / remover).
          </div>
        )}
        <div className="flex items-center justify-between">
          <div className="text-xs text-[color:var(--pr-text-tertiary)]">
            {assets.length} {assets.length === 1 ? 'asset' : 'assets'}
          </div>
          <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs uppercase tracking-widest border border-[color:var(--pr-border)] text-[color:var(--pr-text-secondary)] hover:border-[color:var(--pr-gold)] hover:text-[color:var(--pr-gold)] cursor-pointer transition-colors">
            <Upload size={12} /> {uploading ? 'Enviando...' : 'Upload'}
            <input
              ref={fileRef} type="file" accept="image/*" multiple
              onChange={(e) => onUpload(e.target.files)} className="hidden"
            />
          </label>
        </div>

        {loading && (
          <div className="text-center text-sm text-[color:var(--pr-text-tertiary)] py-8">Carregando...</div>
        )}

        {!loading && assets.length === 0 && (
          <div className="text-center text-sm text-[color:var(--pr-text-tertiary)] py-8 border border-dashed border-[color:var(--pr-border)] rounded-md">
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
                    hasSelectedCard ? 'cursor-pointer' : 'cursor-default'
                  } ${
                    sel
                      ? 'border-[color:var(--pr-gold)] bg-[color:var(--pr-gold)]/10'
                      : 'border-[color:var(--pr-border)] hover:border-[color:var(--pr-gold)]/50 bg-[color:var(--pr-bg-elevated)]'
                  }`}
                  onClick={() => { if (hasSelectedCard) onSelect(a); }}
                >
                  <img src={a.file} alt={a.name} className="w-12 h-12 object-contain" />
                  <div className="text-[10px] text-center text-[color:var(--pr-text-tertiary)] truncate w-full">{a.name}</div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(a.id); }}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 rounded text-[color:var(--pr-text-tertiary)] hover:text-red-400 transition-opacity"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {selectedId && (
          <div className="flex items-center justify-between pt-3 border-t border-[color:var(--pr-border)]">
            <span className="text-xs text-[color:var(--pr-text-tertiary)]">Asset atual selecionado</span>
            <button
              onClick={() => onSelect(null)}
              className="text-xs text-[color:var(--pr-text-tertiary)] hover:text-red-400 inline-flex items-center gap-1"
            >
              <X size={12} /> Remover logo do card
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
