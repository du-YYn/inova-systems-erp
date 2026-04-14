'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Search, Users2, X, Loader2, Copy, Check, Eye,
  Send, DollarSign, CheckCircle, Clock,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Badge } from '@/components/ui/Badge';
import { Sensitive } from '@/components/ui/Sensitive';
import FocusTrap from '@/components/ui/FocusTrap';
import api, { ApiError } from '@/lib/api';

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

interface PartnerDetail extends Partner {
  referrals_count: number;
  closed_count: number;
  total_commission: number;
  pending_commission: number;
  partner_id: string;
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function ParceirosPage() {
  const toast = useToast();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailData, setDetailData] = useState<PartnerDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', username: '', password: '', phone: '',
    company_name: '',
  });

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim() || !form.email.trim() || !form.password.trim()) return;
    setSaving(true);
    try {
      // 1. Criar user com role=partner
      const user = await api.post<{ id: number }>('/accounts/users/', {
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        username: form.username || form.email,
        password: form.password,
        role: 'partner',
        is_active: true,
      });

      // 2. Criar PartnerProfile
      try {
        await api.post('/accounts/partner-profiles/', {
          user: user.id,
          company_name: form.company_name,
          phone: form.phone,
        });
      } catch {
        // Profile pode falhar se endpoint não existir ainda — não bloqueia
      }

      toast.success('Parceiro cadastrado com sucesso!');
      setShowModal(false);
      setForm({ first_name: '', last_name: '', email: '', username: '', password: '', phone: '', company_name: '' });
      fetchPartners();
    } catch (err) {
      const msg = err instanceof ApiError ? JSON.stringify(err.data) : 'Erro ao criar parceiro.';
      toast.error(msg);
    }
    setSaving(false);
  };

  const toggleDetail = async (partner: Partner) => {
    if (expandedId === partner.id) {
      setExpandedId(null);
      setDetailData(null);
      return;
    }
    setExpandedId(partner.id);
    setLoadingDetail(true);
    try {
      // Buscar leads e comissões deste parceiro
      const [leads, commissions] = await Promise.all([
        api.get<{ id: number; status: string }[]>('/sales/partner/leads/').catch(() => []),
        api.get<{ commission_value: string; status: string }[]>('/sales/partner/commissions/').catch(() => []),
      ]);
      // Como estamos no admin, precisamos de uma abordagem diferente
      // Por agora mostramos dados básicos
      setDetailData({
        ...partner,
        full_name: `${partner.first_name} ${partner.last_name}`.trim(),
        referrals_count: 0,
        closed_count: 0,
        total_commission: 0,
        pending_commission: 0,
        partner_id: '',
      });
    } catch { /* ignore */ }
    setLoadingDetail(false);
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
          onClick={() => setShowModal(true)}
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
                    <p className="text-xs text-gray-400 dark:text-gray-500"><Sensitive>{p.phone}</Sensitive></p>
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
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleDetail(p)}
                      className="p-1.5 text-gray-400 hover:text-accent-gold rounded-lg transition-colors"
                      title="Ver detalhes"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
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
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Criar conta de parceiro de indicação</p>
                </div>
                <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Nome *</label>
                    <input type="text" required value={form.first_name}
                      onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                      className="input-field" placeholder="Nome" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Sobrenome</label>
                    <input type="text" value={form.last_name}
                      onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                      className="input-field" placeholder="Sobrenome" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Empresa</label>
                  <input type="text" value={form.company_name}
                    onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                    className="input-field" placeholder="Nome da empresa do parceiro" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">E-mail *</label>
                  <input type="email" required value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value, username: e.target.value }))}
                    className="input-field" placeholder="email@parceiro.com" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Telefone</label>
                  <input type="text" value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="input-field" placeholder="(00) 00000-0000" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Senha *</label>
                  <input type="password" required minLength={8} value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    className="input-field" placeholder="Mínimo 8 caracteres" />
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
            </div>
          </FocusTrap>
        </div>
      )}
    </div>
  );
}
