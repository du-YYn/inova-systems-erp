'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, Users2, X, Loader2, Eye, Power, Trash2, CheckCircle,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { Sensitive } from '@/components/ui/Sensitive';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import FocusTrap from '@/components/ui/FocusTrap';
import api, { ApiError } from '@/lib/api';
import { formatPhone } from '@/lib/validators';

interface Partner {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: string;
  phone: string;
  is_active: boolean;
  created_at: string;
}

export default function ParceirosPage() {
  const toast = useToast();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal criar
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ partner_id: string; email: string } | null>(null);
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', company_name: '',
  });

  // Ações
  const [toggling, setToggling] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Partner | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchPartners = useCallback(async () => {
    try {
      const data = await api.get<{ results?: Partner[] }>('/accounts/users/', { role: 'partner' });
      setPartners(data.results || []);
    } catch {
      toast.error('Erro ao carregar parceiros.');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPartners(); }, [fetchPartners]);

  const openModal = () => {
    setForm({ first_name: '', last_name: '', email: '', phone: '', company_name: '' });
    setCreated(null);
    setShowModal(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.email.trim()) return;
    setSaving(true);
    try {
      const data = await api.post<{ partner_id: string; email: string; message: string; email_status?: string; email_error?: string }>('/sales/partner/register/', form);
      setCreated({ partner_id: data.partner_id, email: data.email });
      if (data.email_status === 'sent') {
        toast.success(data.message);
      } else {
        toast.warning(data.message);
      }
      fetchPartners();
    } catch (err) {
      const msg = err instanceof ApiError
        ? (err.data as Record<string, string>)?.error || JSON.stringify(err.data)
        : 'Erro ao criar parceiro.';
      toast.error(msg);
    }
    setSaving(false);
  };

  const handleToggle = async (partner: Partner) => {
    setToggling(partner.id);
    try {
      await api.patch(`/sales/partner/${partner.id}/update/`, { is_active: !partner.is_active });
      toast.success(`Parceiro ${partner.is_active ? 'desativado' : 'ativado'}.`);
      fetchPartners();
    } catch {
      toast.error('Erro ao atualizar parceiro.');
    }
    setToggling(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/sales/partner/${deleteTarget.id}/delete/`);
      toast.success('Parceiro excluído.');
      setDeleteTarget(null);
      fetchPartners();
    } catch {
      toast.error('Erro ao excluir parceiro.');
    }
    setDeleting(false);
  };

  const filtered = partners.filter(p =>
    !search || `${p.first_name} ${p.last_name} ${p.email}`.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <TableSkeleton />;

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Parceiros</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gestão de parceiros de indicação</p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-xl text-sm font-medium hover:bg-accent-gold-dark transition-colors"
        >
          <Plus className="w-4 h-4" /> Novo Parceiro
        </button>
      </div>

      {/* Busca */}
      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text" placeholder="Buscar parceiro..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
        />
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
          <Users2 className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">Nenhum parceiro cadastrado</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow-card">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Parceiro</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">E-mail</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Desde</th>
                <th className="text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-gray-50 dark:border-gray-700/50 last:border-b-0">
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      <Sensitive>{p.first_name} {p.last_name}</Sensitive>
                    </p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    <Sensitive>{p.email}</Sensitive>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={p.is_active ? 'success' : 'neutral'} dot>
                      {p.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                    {new Date(p.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleToggle(p)}
                        disabled={toggling === p.id}
                        className={`p-1.5 rounded-lg transition-colors ${p.is_active ? 'text-gray-400 hover:text-yellow-500' : 'text-gray-400 hover:text-green-500'}`}
                        title={p.is_active ? 'Desativar' : 'Ativar'}
                      >
                        {toggling === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(p)}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Novo Parceiro */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <FocusTrap onClose={() => setShowModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-md mx-4 shadow-modal animate-modal-in">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Novo Parceiro</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">A senha será gerada automaticamente e enviada por email</p>
                </div>
                <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>

              {created ? (
                /* Sucesso */
                <div className="space-y-4">
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 rounded-xl p-4 text-center">
                    <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Parceiro cadastrado!</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">ID: <span className="font-mono text-accent-gold">{created.partner_id}</span></p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30 rounded-xl p-4">
                    <p className="text-sm text-blue-800 dark:text-blue-300">
                      Email de boas-vindas enviado para <strong>{created.email}</strong> com login, senha e link do portal.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowModal(false)}
                    className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                  >
                    Fechar
                  </button>
                </div>
              ) : (
                /* Formulário */
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Nome *</label>
                      <input type="text" required value={form.first_name}
                        onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                        autoComplete="off"
                        className="input-field" placeholder="Nome" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Sobrenome</label>
                      <input type="text" value={form.last_name}
                        onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                        autoComplete="off"
                        className="input-field" placeholder="Sobrenome" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Empresa</label>
                    <input type="text" value={form.company_name}
                      onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                      autoComplete="off"
                      className="input-field" placeholder="Nome da empresa do parceiro" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">E-mail *</label>
                    <input type="email" required value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      autoComplete="off"
                      className="input-field" placeholder="email@parceiro.com" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Telefone</label>
                    <input type="text" value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: formatPhone(e.target.value) }))}
                      autoComplete="off"
                      className="input-field" placeholder="(00) 00000-0000" />
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      A senha será gerada automaticamente e enviada por email junto com o link de acesso ao portal.
                    </p>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setShowModal(false)}
                      className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      Cancelar
                    </button>
                    <button type="submit" disabled={saving}
                      className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users2 className="w-4 h-4" />}
                      {saving ? 'Criando...' : 'Criar Parceiro'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </FocusTrap>
        </div>
      )}

      {/* Confirmação de exclusão */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Excluir Parceiro"
        description={`Tem certeza que deseja excluir o parceiro "${deleteTarget?.first_name} ${deleteTarget?.last_name}" (${deleteTarget?.email})?`}
        confirmLabel={deleting ? 'Excluindo...' : 'Excluir'}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
