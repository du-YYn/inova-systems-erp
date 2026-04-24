import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AxiosError } from "axios";
import { Copy, Eye, Link2, LogOut, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime } from "@/lib/format";
import { useAuth } from "@/store/auth";
import {
  createApresentacao,
  deleteApresentacao,
  duplicarApresentacao,
  listApresentacoes,
} from "@/api/apresentacoes";
import type { ApresentacaoListItem, StatusApresentacao } from "@/types";

type StatusFilter = "todas" | StatusApresentacao;

export function Dashboard() {
  const [itens, setItens] = useState<ApresentacaoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<StatusFilter>("todas");
  const [modalNova, setModalNova] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const usuario = useAuth((s) => s.usuario);
  const logout = useAuth((s) => s.logout);
  const nav = useNavigate();

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const data = await listApresentacoes();
      setItens(data.results);
    } catch (err) {
      const ax = err as AxiosError;
      setErro(ax.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return itens.filter((i) => {
      if (filtro !== "todas" && i.status !== filtro) return false;
      if (!termo) return true;
      return (
        i.nome.toLowerCase().includes(termo) ||
        i.cliente_nome.toLowerCase().includes(termo)
      );
    });
  }, [itens, busca, filtro]);

  async function onExcluir(id: string, nome: string) {
    if (!confirm(`Excluir "${nome}"? Esta ação não pode ser desfeita.`)) return;
    await deleteApresentacao(id);
    await carregar();
  }

  async function onDuplicar(id: string) {
    await duplicarApresentacao(id);
    await carregar();
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[color:var(--color-border)] px-8 py-5 flex items-center justify-between">
        <div>
          <div className="label-caps">Inova</div>
          <h1 className="text-lg font-light tracking-tight mt-0.5">
            Apresentação <span className="text-[color:var(--color-gold)]">Comercial</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm">{usuario?.nome}</div>
            <div className="text-xs text-[color:var(--color-text-tertiary)]">{usuario?.email}</div>
          </div>
          <Button variant="ghost" onClick={logout} title="Sair">
            <LogOut size={14} />
          </Button>
        </div>
      </header>

      <main className="flex-1 px-8 py-8 max-w-7xl w-full mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-light tracking-tight">Apresentações</h2>
            <p className="text-sm text-[color:var(--color-text-tertiary)] mt-1">
              {itens.length} {itens.length === 1 ? "apresentação" : "apresentações"}
            </p>
          </div>
          <Button onClick={() => setModalNova(true)}>
            <Plus size={16} /> Nova apresentação
          </Button>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--color-text-tertiary)]"
            />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou cliente..."
              className="w-full bg-[color:var(--color-bg-elevated)] border border-[color:var(--color-border)] rounded-md pl-9 pr-3 py-2 text-sm placeholder:text-[color:var(--color-text-tertiary)] focus:border-[color:var(--color-gold)] transition-colors"
            />
          </div>
          <div className="flex gap-1">
            {(["todas", "rascunho", "publicada", "arquivada"] as StatusFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-3 py-2 rounded-md text-xs uppercase tracking-widest border transition-colors ${
                  filtro === f
                    ? "border-[color:var(--color-gold)] text-[color:var(--color-gold)]"
                    : "border-[color:var(--color-border)] text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-primary)]"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {erro && (
          <div className="mb-4 text-xs text-red-400 border border-red-500/30 rounded-md px-3 py-2">
            {erro}
          </div>
        )}

        <div className="surface overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[color:var(--color-border)]">
                <th className="text-left px-5 py-3 label-caps">Nome</th>
                <th className="text-left px-5 py-3 label-caps">Cliente</th>
                <th className="text-left px-5 py-3 label-caps">Status</th>
                <th className="text-left px-5 py-3 label-caps">Engajamento</th>
                <th className="text-left px-5 py-3 label-caps">Atualizada</th>
                <th className="text-right px-5 py-3 label-caps">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-[color:var(--color-text-tertiary)]">
                    Carregando...
                  </td>
                </tr>
              )}
              {!loading && visiveis.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center text-sm text-[color:var(--color-text-tertiary)]">
                    {itens.length === 0
                      ? "Nenhuma apresentação ainda. Crie a primeira."
                      : "Nenhuma apresentação corresponde aos filtros."}
                  </td>
                </tr>
              )}
              {!loading && visiveis.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-[color:var(--color-border)] last:border-b-0 hover:bg-[color:var(--color-bg-elevated)]/40 transition-colors"
                >
                  <td className="px-5 py-3.5 text-sm">
                    <button
                      onClick={() => nav(`/apresentacao/${a.id}/editor`)}
                      className="text-left hover:text-[color:var(--color-gold)] transition-colors"
                    >
                      {a.nome}
                    </button>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-[color:var(--color-text-secondary)]">
                    {a.cliente_nome || "—"}
                  </td>
                  <td className="px-5 py-3.5"><StatusBadge status={a.status} /></td>
                  <td className="px-5 py-3.5 text-sm text-[color:var(--color-text-secondary)]">
                    <div className="inline-flex items-center gap-3">
                      <span className="inline-flex items-center gap-1" title="Visualizações totais">
                        <Eye size={12} className="text-[color:var(--color-text-tertiary)]" /> {a.total_views}
                      </span>
                      <span className="inline-flex items-center gap-1" title="Links ativos">
                        <Link2 size={12} className="text-[color:var(--color-text-tertiary)]" /> {a.total_links}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-[color:var(--color-text-secondary)]">
                    {formatDateTime(a.atualizado_em)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => nav(`/apresentacao/${a.id}/editor`)}
                        className="p-2 rounded-md text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-gold)] hover:bg-[color:var(--color-bg-elevated)] transition-colors"
                        title="Abrir editor"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => onDuplicar(a.id)}
                        className="p-2 rounded-md text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-gold)] hover:bg-[color:var(--color-bg-elevated)] transition-colors"
                        title="Duplicar"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={() => onExcluir(a.id, a.nome)}
                        className="p-2 rounded-md text-[color:var(--color-text-tertiary)] hover:text-red-400 hover:bg-[color:var(--color-bg-elevated)] transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      <NovaApresentacaoModal
        open={modalNova}
        onClose={() => setModalNova(false)}
        onCreated={() => { setModalNova(false); carregar(); }}
      />
    </div>
  );
}

function NovaApresentacaoModal({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [nome, setNome] = useState("");
  const [cliente, setCliente] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!nome.trim()) return;
    setSalvando(true);
    try {
      await createApresentacao({ nome: nome.trim(), cliente_nome: cliente.trim() });
      setNome(""); setCliente("");
      onCreated();
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Nova apresentação"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || !nome.trim()}>
            {salvando ? "Criando..." : "Criar"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Nome"
          placeholder="Ex: Arquitetura de automação — Cliente X"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoFocus
        />
        <Input
          label="Cliente"
          placeholder="Opcional"
          value={cliente}
          onChange={(e) => setCliente(e.target.value)}
        />
      </div>
    </Modal>
  );
}
