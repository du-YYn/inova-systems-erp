import { useEffect, useState } from "react";
import { Ban, Check, Copy, Eye, Lock, Plus, Trash2 } from "lucide-react";
import { AxiosError } from "axios";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { formatDateTime } from "@/lib/format";
import {
  createLink,
  deleteLink,
  listLinks,
  revokeLink,
  type LinkPublico,
} from "@/api/links";

interface Props {
  open: boolean;
  onClose: () => void;
  apresentacaoId: string;
}

export function ShareModal({ open, onClose, apresentacaoId }: Props) {
  const [links, setLinks] = useState<LinkPublico[]>([]);
  const [loading, setLoading] = useState(false);
  const [criando, setCriando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  // form fields
  const [rotulo, setRotulo] = useState("");
  const [senha, setSenha] = useState("");
  const [expiraEm, setExpiraEm] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setLoading(true);
    try {
      const data = await listLinks(apresentacaoId);
      setLinks(data.results);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) { carregar(); setMostrarForm(false); setCopiado(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, apresentacaoId]);

  async function onCriar() {
    if (!rotulo.trim()) { setErro("Informe um rótulo"); return; }
    setCriando(true);
    setErro(null);
    try {
      await createLink({
        apresentacao: apresentacaoId,
        rotulo: rotulo.trim(),
        senha: senha || null,
        expira_em: expiraEm ? new Date(expiraEm).toISOString() : null,
      });
      setRotulo(""); setSenha(""); setExpiraEm("");
      setMostrarForm(false);
      await carregar();
    } catch (err) {
      const ax = err as AxiosError<{ detail?: string }>;
      setErro(ax.response?.data?.detail ?? "Erro ao criar link");
    } finally {
      setCriando(false);
    }
  }

  async function onRevogar(id: string) {
    if (!confirm("Revogar este link? O cliente não conseguirá mais acessar.")) return;
    await revokeLink(id);
    await carregar();
  }

  async function onExcluir(id: string) {
    if (!confirm("Excluir permanentemente? Isso também remove o histórico de acessos.")) return;
    await deleteLink(id);
    await carregar();
  }

  function urlPara(token: string) {
    return `${window.location.origin}/p/${token}`;
  }

  async function copiar(token: string) {
    try {
      await navigator.clipboard.writeText(urlPara(token));
      setCopiado(token);
      setTimeout(() => setCopiado(null), 2000);
    } catch { /* ignore */ }
  }

  return (
    <Modal
      open={open}
      title="Compartilhar"
      onClose={onClose}
      footer={<Button variant="ghost" onClick={onClose}>Fechar</Button>}
    >
      <div className="flex flex-col gap-4 min-w-[540px]">
        <div className="flex items-center justify-between">
          <div className="text-xs text-[color:var(--color-text-tertiary)]">
            {links.length} {links.length === 1 ? "link" : "links"}
          </div>
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs uppercase tracking-widest border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:border-[color:var(--color-gold)] hover:text-[color:var(--color-gold)] transition-colors"
          >
            <Plus size={12} /> Novo link
          </button>
        </div>

        {mostrarForm && (
          <div className="surface-elevated p-4 flex flex-col gap-3">
            <Input
              label="Rótulo (interno)"
              placeholder="Ex: Ezequiel Baú — proposta ERP"
              value={rotulo}
              onChange={(e) => setRotulo(e.target.value)}
              autoFocus
              error={erro ?? undefined}
            />
            <Input
              label="Senha (opcional)"
              type="password"
              placeholder="Deixe vazio para acesso sem senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
            <div className="flex flex-col gap-1.5">
              <label className="label-caps">Expiração (opcional)</label>
              <input
                type="datetime-local"
                value={expiraEm}
                onChange={(e) => setExpiraEm(e.target.value)}
                className="bg-[color:var(--color-bg)] border border-[color:var(--color-border)] rounded-md px-3 py-2 text-sm focus:border-[color:var(--color-gold)] transition-colors"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="ghost" onClick={() => setMostrarForm(false)}>Cancelar</Button>
              <Button onClick={onCriar} disabled={criando}>
                {criando ? "Criando..." : "Criar link"}
              </Button>
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center text-sm text-[color:var(--color-text-tertiary)] py-6">
            Carregando...
          </div>
        )}

        {!loading && links.length === 0 && !mostrarForm && (
          <div className="text-center text-sm text-[color:var(--color-text-tertiary)] py-8 border border-dashed border-[color:var(--color-border)] rounded-md">
            Nenhum link criado ainda. Gere um para compartilhar com o cliente.
          </div>
        )}

        {!loading && links.length > 0 && (
          <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
            {links.map((l) => (
              <div
                key={l.id}
                className={`surface-elevated p-3 flex flex-col gap-2 ${!l.ativo ? "opacity-60" : ""}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{l.rotulo || "(sem rótulo)"}</span>
                      {!l.ativo && (
                        <span className="text-[10px] uppercase tracking-widest text-red-400 border border-red-400/30 rounded px-1.5 py-0.5">
                          Revogado
                        </span>
                      )}
                      {l.expira_em && new Date(l.expira_em) < new Date() && (
                        <span className="text-[10px] uppercase tracking-widest text-red-400 border border-red-400/30 rounded px-1.5 py-0.5">
                          Expirado
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[color:var(--color-text-tertiary)] mt-0.5 truncate">
                      {urlPara(l.token)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => copiar(l.token)}
                      disabled={!l.ativo}
                      className="p-2 rounded-md text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-gold)] hover:bg-[color:var(--color-bg)] disabled:opacity-30 transition-colors"
                      title="Copiar URL"
                    >
                      {copiado === l.token ? <Check size={14} className="text-[color:var(--color-gold)]" /> : <Copy size={14} />}
                    </button>
                    {l.ativo && (
                      <button
                        onClick={() => onRevogar(l.id)}
                        className="p-2 rounded-md text-[color:var(--color-text-tertiary)] hover:text-red-400 hover:bg-[color:var(--color-bg)] transition-colors"
                        title="Revogar"
                      >
                        <Ban size={14} />
                      </button>
                    )}
                    <button
                      onClick={() => onExcluir(l.id)}
                      className="p-2 rounded-md text-[color:var(--color-text-tertiary)] hover:text-red-400 hover:bg-[color:var(--color-bg)] transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-[11px] text-[color:var(--color-text-tertiary)]">
                  <span className="inline-flex items-center gap-1">
                    <Eye size={11} /> {l.total_views} {l.total_views === 1 ? "view" : "views"}
                  </span>
                  {l.ultimo_acesso && (
                    <span>Último: {formatDateTime(l.ultimo_acesso)}</span>
                  )}
                  {l.protegido_por_senha && (
                    <span className="inline-flex items-center gap-1 text-[color:var(--color-gold)]">
                      <Lock size={11} /> protegido
                    </span>
                  )}
                  {l.expira_em && (
                    <span>Expira em {formatDateTime(l.expira_em)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
