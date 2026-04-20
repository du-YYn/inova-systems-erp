'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Eye, Link2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { formatDateTime } from '@/lib/presentations/format';
import type { PresentationListItem, PresentationStatus } from '@/lib/presentations/types';
import type { Paginated } from '@/lib/presentations/types';
import {
  createPresentation,
  deletePresentation,
  duplicatePresentation,
} from '@/lib/presentations/api';

type StatusFilter = 'todas' | PresentationStatus;

export default function ApresentacoesPage() {
  const router = useRouter();
  const [items, setItems] = useState<PresentationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('todas');
  const [showNew, setShowNew] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<Paginated<PresentationListItem>>('/presentations/presentations/');
      setItems(data.results);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((i) => {
      if (filter !== 'todas' && i.status !== filter) return false;
      if (!term) return true;
      return i.name.toLowerCase().includes(term) || i.client_name.toLowerCase().includes(term);
    });
  }, [items, search, filter]);

  async function onDelete(id: string, name: string) {
    if (!confirm(`Excluir "${name}"? Esta ação não pode ser desfeita.`)) return;
    await deletePresentation(id);
    await load();
  }

  async function onDuplicate(id: string) {
    await duplicatePresentation(id);
    await load();
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Apresentações</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {items.length} {items.length === 1 ? 'apresentação' : 'apresentações'}
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-gold text-white text-sm font-semibold hover:bg-accent-gold-dark transition-colors"
        >
          <Plus size={16} /> Nova apresentação
        </button>
      </div>

      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou cliente..."
            className="input-field pl-9"
          />
        </div>
        <div className="flex gap-1">
          {(['todas', 'draft', 'published', 'archived'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-xs uppercase tracking-widest border transition-colors ${
                filter === f
                  ? 'border-accent-gold text-accent-gold'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100'
              }`}
            >
              {f === 'todas' ? 'todas' : f === 'draft' ? 'rascunho' : f === 'published' ? 'publicada' : 'arquivada'}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full table-premium">
          <thead>
            <tr>
              <th className="text-left px-5 py-3">Nome</th>
              <th className="text-left px-5 py-3">Cliente</th>
              <th className="text-left px-5 py-3">Status</th>
              <th className="text-left px-5 py-3">Engajamento</th>
              <th className="text-left px-5 py-3">Atualizada</th>
              <th className="text-right px-5 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-400">Carregando...</td>
              </tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center text-sm text-gray-400">
                  {items.length === 0 ? 'Nenhuma apresentação ainda. Crie a primeira.' : 'Nenhuma apresentação corresponde aos filtros.'}
                </td>
              </tr>
            )}
            {!loading && visible.map((a) => (
              <tr key={a.id}>
                <td className="px-5 py-3.5 text-sm">
                  <button
                    onClick={() => router.push(`/apresentacoes/${a.id}`)}
                    className="text-left hover:text-accent-gold transition-colors"
                  >
                    {a.name}
                  </button>
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                  {a.client_name || '—'}
                </td>
                <td className="px-5 py-3.5">
                  <StatusBadge status={a.status} />
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                  <div className="inline-flex items-center gap-3">
                    <span className="inline-flex items-center gap-1" title="Visualizações totais">
                      <Eye size={12} className="text-gray-400" /> {a.total_views}
                    </span>
                    <span className="inline-flex items-center gap-1" title="Links ativos">
                      <Link2 size={12} className="text-gray-400" /> {a.total_links}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-400">
                  {formatDateTime(a.updated_at)}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <div className="inline-flex items-center gap-1">
                    <IconBtn onClick={() => router.push(`/apresentacoes/${a.id}`)} title="Abrir editor">
                      <Pencil size={14} />
                    </IconBtn>
                    <IconBtn onClick={() => onDuplicate(a.id)} title="Duplicar">
                      <Copy size={14} />
                    </IconBtn>
                    <IconBtn onClick={() => onDelete(a.id, a.name)} title="Excluir" danger>
                      <Trash2 size={14} />
                    </IconBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NewPresentationModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={(id) => { setShowNew(false); router.push(`/apresentacoes/${id}`); }}
      />
    </div>
  );
}

function IconBtn({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-2 rounded-lg transition-colors text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 ${
        danger ? 'hover:text-red-500' : 'hover:text-accent-gold'
      }`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: PresentationStatus }) {
  const meta: Record<PresentationStatus, { label: string; cls: string }> = {
    draft:     { label: 'Rascunho',  cls: 'text-gray-500 border-gray-300 dark:text-gray-400 dark:border-gray-600' },
    published: { label: 'Publicada', cls: 'text-accent-gold border-accent-gold/40' },
    archived:  { label: 'Arquivada', cls: 'text-gray-400 border-gray-200 dark:text-gray-500 dark:border-gray-700 opacity-60' },
  };
  const m = meta[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[11px] font-medium uppercase tracking-widest border ${m.cls}`}>
      {m.label}
    </span>
  );
}

function NewPresentationModal({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const created = await createPresentation({ name: name.trim(), client_name: client.trim() });
      setName(''); setClient('');
      onCreated(created.id);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="card w-full max-w-md p-5 animate-modal-in">
        <h2 className="text-base font-semibold mb-4">Nova apresentação</h2>
        <div className="flex flex-col gap-4">
          <div>
            <label className="label-input">Nome</label>
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Arquitetura — Cliente X"
              autoFocus className="input-field"
            />
          </div>
          <div>
            <label className="label-input">Cliente</label>
            <input
              value={client} onChange={(e) => setClient(e.target.value)}
              placeholder="Opcional" className="input-field"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={save} disabled={saving || !name.trim()}
            className="px-4 py-2 rounded-lg text-sm bg-accent-gold text-white font-medium hover:bg-accent-gold-dark transition-colors disabled:opacity-40"
          >
            {saving ? 'Criando...' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  );
}
