'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Plus, Search, Edit, Trash2, FileText, TrendingUp, CheckCircle,
  X, Send, ThumbsUp, ThumbsDown, ArrowRight, ChevronUp, ChevronDown,
  Upload, Download, Link, Eye, Copy,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton, CardSkeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Sensitive } from '@/components/ui/Sensitive';
import api from '@/lib/api';
import ProposalFormModal from './ProposalFormModal';

interface Proposal {
  id: number;
  number: string;
  title: string;
  customer: number | null;
  customer_name: string;
  prospect_company: string;
  proposal_type: string;
  billing_type: string;
  total_value: string;
  status: string;
  valid_until: string | null;
  notes: string;
  hours_estimated: string;
  hourly_rate: string;
  proposal_file: string | null;
  public_token: string | null;
  view_count: number;
  created_at: string;
  services?: { id?: number; service: number; service_name?: string; service_code?: string }[];
  payment_plan?: {
    plan_type?: string;
    one_time_amount?: string | number;
    one_time_method?: string;
    one_time_installments?: number;
    one_time_first_due?: string | null;
    recurring_amount?: string | number;
    recurring_method?: string;
    recurring_day_of_month?: number | null;
    recurring_duration_months?: number | null;
    recurring_first_due?: string | null;
  } | null;
}

interface ProspectOption {
  id: number;
  company_name: string;
  contact_name: string;
  service_interest: string[];
  estimated_value: number;
  proposal_value: number | null;
  description: string;
  meeting_transcript: string;
  usage_type: string;
}

const PAGE_SIZE = 10;

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'purple' | 'gold' | 'neutral';

const statusBadge: Record<string, BadgeVariant> = {
  draft: 'neutral', sent: 'info', viewed: 'info',
  negotiation: 'warning', approved: 'success', rejected: 'error', expired: 'warning',
};

const statusLabels: Record<string, string> = {
  draft: 'Rascunho', sent: 'Enviada', viewed: 'Visualizada',
  negotiation: 'Em Negociação', approved: 'Aprovada', rejected: 'Recusada', expired: 'Expirada',
};

const proposalTypeLabels: Record<string, string> = {
  software_dev: 'Desenvolvimento', automation: 'Automação',
  ai: 'Inteligência Artificial', consulting: 'Consultoria',
  maintenance: 'Manutenção', support: 'Suporte', mixed: 'Múltiplos',
};

const formatCurrency = (v: string | number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));

export default function PropostasTab() {
  const toast = useToast();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [prospects, setProspects] = useState<ProspectOption[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingProposal, setEditingProposal] = useState<Proposal | null>(null);
  const [performingAction, setPerformingAction] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Proposal | null>(null);
  const [sortField, setSortField] = useState<'number' | 'title' | 'value' | 'status' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Drawer de detalhes da proposta
  const [viewingProposal, setViewingProposal] = useState<Proposal | null>(null);
  const [viewHistory, setViewHistory] = useState<{ viewed_at: string; ip_address: string; user_agent: string }[]>([]);

  const handleSort = (field: 'number' | 'title' | 'value' | 'status') => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const openProposalDrawer = (p: Proposal) => {
    setViewingProposal(p);
    setViewHistory([]);
    if (p.view_count > 0) {
      api.get<{ viewed_at: string; ip_address: string; user_agent: string }[]>(
        `/sales/proposals/${p.id}/views-history/`
      ).then(data => setViewHistory(Array.isArray(data) ? data : []))
       .catch(() => {});
    }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), page_size: String(PAGE_SIZE) };
      if (search) params.search = search;
      const propData = await api.get<{ results: Proposal[]; count: number }>('/sales/proposals/', params);
      const pList = propData.results || propData;
      setProposals(Array.isArray(pList) ? pList : []);
      setTotal(propData.count ?? (Array.isArray(pList) ? pList.length : 0));
    } catch (err) {
      console.error('[PropostasTab] proposals error:', err);
    } finally {
      setLoading(false);
    }
    // Prospects carregados separadamente — falha não trava a tab
    try {
      const prospData = await api.get<{ results: ProspectOption[] }>('/sales/prospects/', { page_size: '200' });
      const prList = prospData.results || prospData;
      setProspects(Array.isArray(prList) ? prList : []);
    } catch {
      console.error('[PropostasTab] prospects fetch error');
    }
  }, [page, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const approvedValue = proposals.filter(p => p.status === 'approved').reduce((s, p) => s + Number(p.total_value || 0), 0);
  const approvedCount = proposals.filter(p => p.status === 'approved').length;

  const sortedProposals = useMemo(() => {
    if (!sortField) return proposals;
    return [...proposals].sort((a, b) => {
      let aVal = '', bVal = '';
      if (sortField === 'number') { aVal = a.number; bVal = b.number; }
      if (sortField === 'title')  { aVal = a.title.toLowerCase(); bVal = b.title.toLowerCase(); }
      if (sortField === 'value')  { aVal = String(Number(a.total_value || 0)); bVal = String(Number(b.total_value || 0)); }
      if (sortField === 'status') { aVal = a.status; bVal = b.status; }
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
  }, [proposals, sortField, sortDir]);

  const openNewModal = () => { setEditingProposal(null); setShowModal(true); };

  const openEditModal = (p: Proposal) => {
    setEditingProposal(p);
    setShowModal(true);
  };

  const handleAction = async (proposal: Proposal, action: 'send' | 'approve' | 'reject' | 'convert_to_contract') => {
    const actionKey = `${proposal.id}-${action}`;
    setPerformingAction(actionKey);
    try {
      await api.post(`/sales/proposals/${proposal.id}/${action}/`);
      const labels: Record<string, string> = {
        send: 'Proposta enviada!', approve: 'Proposta aprovada!',
        reject: 'Proposta rejeitada.', convert_to_contract: 'Contrato criado!',
      };
      toast.success(labels[action]);
      fetchData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao executar ação.';
      toast.error(message);
    } finally {
      setPerformingAction(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/sales/proposals/${confirmDelete.id}/`);
      toast.success(`Proposta "${confirmDelete.number}" excluída.`);
      setConfirmDelete(null);
      setViewingProposal(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir proposta.');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div />
        <Button onClick={openNewModal}>
          <Plus className="w-4 h-4" /> Nova Proposta
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {loading ? Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />) : (
          <>
            {[
              { icon: FileText, bg: 'bg-blue-50', color: 'text-blue-600', label: 'Total de Propostas', value: <Sensitive>{total}</Sensitive> },
              { icon: CheckCircle, bg: 'bg-emerald-50', color: 'text-emerald-600', label: 'Aprovadas', value: <Sensitive>{approvedCount}</Sensitive> },
              { icon: TrendingUp, bg: 'bg-violet-50', color: 'text-violet-600', label: 'Valor Aprovado', value: <Sensitive>{formatCurrency(approvedValue)}</Sensitive> },
            ].map(({ icon: Icon, bg, color, label, value }) => (
              <div key={label} className="card card-hover p-5">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 ${bg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">{label}</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">{value}</p>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
            <input type="text" placeholder="Buscar propostas..."
              value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              className="input-field pl-9" />
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? <TableSkeleton rows={6} cols={8} /> : (
            <table className="w-full table-premium">
              <thead>
                <tr>
                  <th className="th-sort text-left" onClick={() => handleSort('number')}>
                    Número
                    <span className={`sort-icon ${sortField === 'number' ? 'active' : ''}`}>
                      {sortField === 'number' && sortDir === 'desc' ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronUp className="w-3 h-3 inline" />}
                    </span>
                  </th>
                  <th className="th-sort text-left" onClick={() => handleSort('title')}>
                    Título
                    <span className={`sort-icon ${sortField === 'title' ? 'active' : ''}`}>
                      {sortField === 'title' && sortDir === 'desc' ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronUp className="w-3 h-3 inline" />}
                    </span>
                  </th>
                  <th className="text-left">Cliente</th>
                  <th className="text-left">Tipo</th>
                  <th className="th-sort text-left" onClick={() => handleSort('value')}>
                    Valor
                    <span className={`sort-icon ${sortField === 'value' ? 'active' : ''}`}>
                      {sortField === 'value' && sortDir === 'desc' ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronUp className="w-3 h-3 inline" />}
                    </span>
                  </th>
                  <th className="th-sort text-left" onClick={() => handleSort('status')}>
                    Status
                    <span className={`sort-icon ${sortField === 'status' ? 'active' : ''}`}>
                      {sortField === 'status' && sortDir === 'desc' ? <ChevronDown className="w-3 h-3 inline" /> : <ChevronUp className="w-3 h-3 inline" />}
                    </span>
                  </th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {sortedProposals.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-gray-400 dark:text-gray-500 text-sm">
                      Nenhuma proposta encontrada
                    </td>
                  </tr>
                ) : sortedProposals.map((p) => (
                  <tr key={p.id} onClick={() => openProposalDrawer(p)} className="cursor-pointer">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400"><Sensitive>{p.number}</Sensitive></td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100"><Sensitive>{p.title}</Sensitive></td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400"><Sensitive>{p.customer_name || p.prospect_company || '—'}</Sensitive></td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {p.services && p.services.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                          {p.services.slice(0, 3).map((s, i) => (
                            <span key={s.id ?? i} className="inline-block px-2 py-0.5 text-[11px] rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                              {s.service_name || '—'}
                            </span>
                          ))}
                          {p.services.length > 3 && (
                            <span className="inline-block px-2 py-0.5 text-[11px] rounded-md bg-gray-100 dark:bg-gray-700 text-gray-400">
                              +{p.services.length - 3}
                            </span>
                          )}
                        </div>
                      ) : (
                        proposalTypeLabels[p.proposal_type] || p.proposal_type
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
                      <Sensitive>{p.total_value ? formatCurrency(p.total_value) : '—'}</Sensitive>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusBadge[p.status] || 'neutral'}>
                        {statusLabels[p.status] || p.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {p.status === 'draft' && (
                          <button
                            onClick={() => handleAction(p, 'send')}
                            disabled={performingAction === `${p.id}-send`}
                            title="Enviar proposta"
                            aria-label="Enviar proposta"
                            className="p-1.5 text-gray-300 hover:text-blue-600 transition-colors rounded-lg hover:bg-blue-50 disabled:opacity-50">
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        {['sent', 'viewed', 'negotiation'].includes(p.status) && (
                          <>
                            <button onClick={() => handleAction(p, 'approve')} disabled={!!performingAction}
                              title="Aprovar"
                              aria-label="Aprovar"
                              className="p-1.5 text-gray-300 hover:text-emerald-600 transition-colors rounded-lg hover:bg-emerald-50 disabled:opacity-50">
                              <ThumbsUp className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleAction(p, 'reject')} disabled={!!performingAction}
                              title="Rejeitar"
                              aria-label="Rejeitar"
                              className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 disabled:opacity-50">
                              <ThumbsDown className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {p.status === 'approved' && (
                          <button onClick={() => handleAction(p, 'convert_to_contract')} disabled={!!performingAction}
                            title="Converter em Contrato"
                            aria-label="Converter em Contrato"
                            className="p-1.5 text-gray-300 hover:text-accent-gold transition-colors rounded-lg hover:bg-accent-gold/5 disabled:opacity-50">
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        )}
                        {/* Upload PDF */}
                        <label className={`p-1.5 transition-colors cursor-pointer ${p.proposal_file ? 'text-blue-400 hover:text-blue-500' : 'text-gray-300 hover:text-blue-500'}`}
                          title={p.proposal_file ? 'Substituir PDF' : 'Anexar PDF'}>
                          <Upload className="w-4 h-4" />
                          <input type="file" accept=".html,.htm,.pdf,text/html,application/pdf" className="hidden" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try { await api.upload(`/sales/proposals/${p.id}/upload-pdf/`, file, 'proposal_file'); toast.success(p.proposal_file ? 'PDF substituído!' : 'PDF anexado! Link gerado.'); fetchData(); }
                            catch { toast.error('Erro ao anexar PDF.'); }
                            e.target.value = '';
                          }} />
                        </label>
                        {/* Download PDF (admin) */}
                        {p.proposal_file && (
                          <a href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/sales/proposals/${p.id}/download-pdf/`}
                            className="p-1.5 text-green-500 hover:text-green-600 transition-colors" title="Baixar PDF">
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                        {/* Copiar link público */}
                        {p.public_token && (
                          <button onClick={() => {
                            const proposalDomain = process.env.NEXT_PUBLIC_PROPOSAL_URL
                              || window.location.origin.replace('erp.', 'proposta.');
                            const url = `${proposalDomain}/p/${p.public_token}`;
                            navigator.clipboard.writeText(url);
                            toast.success('Link copiado!');
                          }} className="p-1.5 text-gray-300 hover:text-accent-gold transition-colors" title="Copiar link público">
                            <Copy className="w-4 h-4" />
                          </button>
                        )}
                        {/* Visualizações */}
                        {p.view_count > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-gray-400 px-1" title={`${p.view_count} visualizações`}>
                            <Eye className="w-3 h-3" /> {p.view_count}
                          </span>
                        )}
                        <button onClick={() => openEditModal(p)}
                          aria-label="Editar"
                          className="p-1.5 text-gray-300 hover:text-accent-gold transition-colors rounded-lg hover:bg-accent-gold/5">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => setConfirmDelete(p)}
                          aria-label="Excluir"
                          className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Pagination page={page} totalPages={totalPages} totalItems={total} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
        <div className="flex items-center gap-1"><Send className="w-3.5 h-3.5 text-blue-400" /> Enviar</div>
        <div className="flex items-center gap-1"><ThumbsUp className="w-3.5 h-3.5 text-emerald-500" /> Aprovar</div>
        <div className="flex items-center gap-1"><ThumbsDown className="w-3.5 h-3.5 text-red-400" /> Rejeitar</div>
        <div className="flex items-center gap-1"><ArrowRight className="w-3.5 h-3.5 text-accent-gold" /> Converter em Contrato</div>
      </div>

      {/* Modal compartilhado */}
      <ProposalFormModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={fetchData}
        editingProposal={editingProposal}
        prospects={prospects}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Excluir proposta"
        description={`Tem certeza que deseja excluir "${confirmDelete?.number} — ${confirmDelete?.title}"?${confirmDelete?.proposal_file ? ' O arquivo e o link público serão removidos permanentemente.' : ''}${confirmDelete?.view_count ? ` (${confirmDelete.view_count} visualização${confirmDelete.view_count > 1 ? 'ões' : ''} registrada${confirmDelete.view_count > 1 ? 's' : ''})` : ''}`}
        confirmLabel="Excluir permanentemente"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* ── Drawer: Detalhes da Proposta ──────────────────────────── */}
      {viewingProposal && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setViewingProposal(null)} />
          <div className="relative w-full max-w-md bg-white dark:bg-gray-800 shadow-2xl overflow-y-auto animate-modal-in">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-accent-gold font-semibold uppercase tracking-wide">{viewingProposal.number}</p>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{viewingProposal.title}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">{viewingProposal.prospect_company || viewingProposal.customer_name} · <Sensitive>{formatCurrency(viewingProposal.total_value)}</Sensitive></p>
                </div>
                <button onClick={() => setViewingProposal(null)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="mt-3">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                  viewingProposal.status === 'approved' ? 'bg-green-100 text-green-800' :
                  viewingProposal.status === 'rejected' ? 'bg-red-100 text-red-800' :
                  viewingProposal.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {statusLabels[viewingProposal.status] || viewingProposal.status}
                </span>
              </div>
            </div>

            <div className="p-5 space-y-6">
              {/* ── Detalhes ───────────────────────────── */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Detalhes</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                    <p className="text-[10px] text-gray-400 uppercase font-semibold">Tipo</p>
                    <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">{proposalTypeLabels[viewingProposal.proposal_type] || viewingProposal.proposal_type}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                    <p className="text-[10px] text-gray-400 uppercase font-semibold">Cobrança</p>
                    <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">
                      {{ fixed: 'Valor Fixo', hourly: 'Por Hora', monthly: 'Mensal', milestone: 'Por Marco' }[viewingProposal.billing_type] || viewingProposal.billing_type}
                    </p>
                  </div>
                  {viewingProposal.valid_until && (
                    <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                      <p className="text-[10px] text-gray-400 uppercase font-semibold">Validade</p>
                      <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">
                        {new Date(viewingProposal.valid_until + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  )}
                  {(viewingProposal.hours_estimated && Number(viewingProposal.hours_estimated) > 0) && (
                    <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                      <p className="text-[10px] text-gray-400 uppercase font-semibold">Horas Estimadas</p>
                      <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5"><Sensitive>{viewingProposal.hours_estimated}h</Sensitive></p>
                    </div>
                  )}
                  {(viewingProposal.hourly_rate && Number(viewingProposal.hourly_rate) > 0) && (
                    <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                      <p className="text-[10px] text-gray-400 uppercase font-semibold">Valor/Hora</p>
                      <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5"><Sensitive>{formatCurrency(viewingProposal.hourly_rate)}</Sensitive></p>
                    </div>
                  )}
                  <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                    <p className="text-[10px] text-gray-400 uppercase font-semibold">Criado em</p>
                    <p className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">
                      {new Date(viewingProposal.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
                {viewingProposal.notes && (
                  <div className="mt-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                    <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Observações</p>
                    <p className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-line"><Sensitive>{viewingProposal.notes}</Sensitive></p>
                  </div>
                )}
              </div>

              {/* ── Tracking ────────────────────────────── */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Tracking</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                    <p className="text-[10px] text-gray-400 uppercase font-semibold">Status</p>
                    <p className={`text-sm font-bold mt-0.5 ${viewingProposal.view_count > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {viewingProposal.view_count > 0 ? '🟢 Abriu' : '🔴 Não abriu'}
                    </p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                    <p className="text-[10px] text-gray-400 uppercase font-semibold">Visualizações</p>
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5">{viewingProposal.view_count}</p>
                  </div>
                </div>
                {viewHistory.length > 0 && (
                  <div className="mt-3">
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                        <p className="text-[10px] text-gray-400 uppercase font-semibold">Primeira abertura</p>
                        <p className="text-xs text-gray-900 dark:text-gray-100 mt-0.5">
                          {new Date(viewHistory[viewHistory.length - 1].viewed_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                        <p className="text-[10px] text-gray-400 uppercase font-semibold">Última abertura</p>
                        <p className="text-xs text-gray-900 dark:text-gray-100 mt-0.5">
                          {new Date(viewHistory[0].viewed_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-400 uppercase font-semibold mb-2">Histórico</p>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {viewHistory.map((v, i) => {
                        const isMobile = v.user_agent.toLowerCase().includes('mobile');
                        return (
                          <div key={i} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/30 rounded-lg px-3 py-2 text-xs">
                            <span className="text-gray-600 dark:text-gray-300">
                              {new Date(v.viewed_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span className="text-gray-400">{isMobile ? '📱 Mobile' : '💻 Desktop'}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Link ─────────────────────────────── */}
              {viewingProposal.public_token && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Link Público</p>
                  <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3">
                    <p className="text-[10px] text-gray-400 font-mono break-all mb-2">
                      {(process.env.NEXT_PUBLIC_PROPOSAL_URL || window.location.origin.replace('erp.', 'proposta.'))}/p/{viewingProposal.public_token}
                    </p>
                    <button onClick={() => {
                      const baseUrl = process.env.NEXT_PUBLIC_PROPOSAL_URL || window.location.origin.replace('erp.', 'proposta.');
                      navigator.clipboard.writeText(`${baseUrl}/p/${viewingProposal.public_token}`);
                      toast.success('Link copiado!');
                    }} className="w-full flex items-center justify-center gap-2 py-2 bg-accent-gold text-white rounded-lg text-sm font-medium hover:bg-accent-gold-dark transition-colors">
                      <Copy className="w-4 h-4" /> Copiar Link
                    </button>
                  </div>
                </div>
              )}

              {/* ── Arquivo ──────────────────────────── */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Arquivo</p>
                {viewingProposal.proposal_file ? (
                  <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-green-500" />
                      <span className="text-xs text-gray-600 dark:text-gray-300">Arquivo anexado</span>
                    </div>
                    <div className="flex gap-2">
                      <label className="flex-1 flex items-center justify-center gap-2 py-2 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg text-xs font-medium cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        <Upload className="w-3.5 h-3.5" /> Substituir
                        <input type="file" accept=".html,.htm,.pdf,text/html,application/pdf" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try { await api.upload(`/sales/proposals/${viewingProposal.id}/upload-pdf/`, file, 'proposal_file'); toast.success('Arquivo substituído!'); fetchData(); setViewingProposal(null); }
                          catch { toast.error('Erro ao substituir.'); }
                          e.target.value = '';
                        }} />
                      </label>
                      <a href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/sales/proposals/${viewingProposal.id}/download-pdf/`}
                        className="flex-1 flex items-center justify-center gap-2 py-2 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        <Download className="w-3.5 h-3.5" /> Baixar
                      </a>
                    </div>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 py-4 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-400 cursor-pointer hover:border-accent-gold hover:text-accent-gold transition-colors">
                    <Upload className="w-4 h-4" /> Anexar arquivo HTML
                    <input type="file" accept=".html,.htm,.pdf,text/html,application/pdf" className="hidden" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try { await api.upload(`/sales/proposals/${viewingProposal.id}/upload-pdf/`, file, 'proposal_file'); toast.success('Arquivo anexado! Link gerado.'); fetchData(); setViewingProposal(null); }
                      catch { toast.error('Erro ao anexar.'); }
                      e.target.value = '';
                    }} />
                  </label>
                )}
              </div>

              {/* ── Ações ────────────────────────────── */}
              <div>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Ações</p>
                <div className="space-y-2">
                  {viewingProposal.status === 'draft' && (
                    <button onClick={() => { handleAction(viewingProposal, 'send'); setViewingProposal(null); }}
                      disabled={performingAction === `${viewingProposal.id}-send`}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                      <Send className="w-4 h-4" /> Enviar Proposta
                    </button>
                  )}
                  {['sent', 'viewed', 'negotiation'].includes(viewingProposal.status) && (
                    <button onClick={() => { handleAction(viewingProposal, 'approve'); setViewingProposal(null); }}
                      disabled={performingAction === `${viewingProposal.id}-approve`}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
                      <ThumbsUp className="w-4 h-4" /> Aprovar Proposta
                    </button>
                  )}
                  {['sent', 'viewed', 'negotiation'].includes(viewingProposal.status) && (
                    <button onClick={() => { handleAction(viewingProposal, 'reject'); setViewingProposal(null); }}
                      disabled={performingAction === `${viewingProposal.id}-reject`}
                      className="w-full flex items-center justify-center gap-2 py-2 border border-red-200 text-red-500 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors">
                      <ThumbsDown className="w-4 h-4" /> Rejeitar
                    </button>
                  )}
                  {viewingProposal.status === 'approved' && (
                    <button onClick={() => { handleAction(viewingProposal, 'convert_to_contract'); setViewingProposal(null); }}
                      disabled={performingAction === `${viewingProposal.id}-convert_to_contract`}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-accent-gold text-white rounded-lg text-sm font-medium hover:bg-accent-gold-dark disabled:opacity-50 transition-colors">
                      <ArrowRight className="w-4 h-4" /> Converter em Contrato
                    </button>
                  )}
                  {/* Editar / Excluir */}
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { openEditModal(viewingProposal); setViewingProposal(null); }}
                      className="flex-1 flex items-center justify-center gap-2 py-2 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                      <Edit className="w-4 h-4" /> Editar
                    </button>
                    <button onClick={() => { setConfirmDelete(viewingProposal); setViewingProposal(null); }}
                      className="flex-1 flex items-center justify-center gap-2 py-2 border border-red-200 dark:border-red-800 text-red-500 rounded-lg text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <Trash2 className="w-4 h-4" /> Excluir
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
