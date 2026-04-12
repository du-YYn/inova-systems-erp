'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, Copy, Check, Eye, CheckCircle, Clock, FileCheck, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Sensitive } from '@/components/ui/Sensitive';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton } from '@/components/ui/Skeleton';
import api from '@/lib/api';

interface Onboarding {
  id: number;
  prospect: number;
  prospect_company_name: string;
  customer_name: string;
  public_token: string;
  status: string;
  company_legal_name: string;
  company_cnpj: string;
  company_street: string;
  company_number: string;
  company_complement: string;
  company_neighborhood: string;
  company_city: string;
  company_state: string;
  company_cep: string;
  rep_full_name: string;
  rep_marital_status: string;
  rep_profession: string;
  rep_cpf: string;
  rep_street: string;
  rep_number: string;
  rep_complement: string;
  rep_neighborhood: string;
  rep_city: string;
  rep_state: string;
  rep_cep: string;
  submitted_at: string | null;
  created_by_name: string;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'warning' | 'success' | 'info'; icon: React.ElementType }> = {
  pending: { label: 'Pendente', variant: 'warning', icon: Clock },
  submitted: { label: 'Preenchido', variant: 'success', icon: FileCheck },
  reviewed: { label: 'Revisado', variant: 'info', icon: CheckCircle },
};

const MARITAL_LABELS: Record<string, string> = {
  solteiro: 'Solteiro(a)',
  casado: 'Casado(a)',
  divorciado: 'Divorciado(a)',
  viuvo: 'Viúvo(a)',
  separado: 'Separado(a)',
  uniao_estavel: 'União Estável',
};

export default function OnboardingTab() {
  const toast = useToast();
  const [onboardings, setOnboardings] = useState<Onboarding[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [reviewing, setReviewing] = useState<number | null>(null);

  const fetchOnboardings = useCallback(async () => {
    try {
      const params: Record<string, string> = { page_size: '100' };
      if (filterStatus) params.status = filterStatus;
      if (search) params.search = search;
      const data = await api.get<{ results?: Onboarding[] }>('/sales/onboardings/', params);
      setOnboardings(data.results || []);
    } catch {
      toast.error('Erro ao carregar cadastros.');
    }
    setLoading(false);
  }, [filterStatus, search]);

  useEffect(() => { fetchOnboardings(); }, [fetchOnboardings]);

  const copyLink = async (onboarding: Onboarding) => {
    const link = `${window.location.origin}/onboarding/${onboarding.public_token}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const input = document.createElement('input');
      input.value = link;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
    setCopied(onboarding.id);
    toast.success('Link copiado!');
    setTimeout(() => setCopied(null), 2000);
  };

  const markReviewed = async (id: number) => {
    setReviewing(id);
    try {
      await api.post(`/sales/onboardings/${id}/mark-reviewed/`);
      toast.success('Cadastro marcado como revisado.');
      fetchOnboardings();
    } catch {
      toast.error('Erro ao marcar como revisado.');
    }
    setReviewing(null);
  };

  if (loading) return <TableSkeleton />;

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por empresa, representante, CNPJ ou CPF..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
        >
          <option value="">Todos os status</option>
          <option value="pending">Pendente</option>
          <option value="submitted">Preenchido</option>
          <option value="reviewed">Revisado</option>
        </select>
      </div>

      {/* Empty state */}
      {onboardings.length === 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-12 text-center">
          <FileCheck className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">Nenhum cadastro encontrado</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
            Cadastros são gerados ao fechar um lead no Funil.
          </p>
        </div>
      )}

      {/* Table */}
      {onboardings.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow-card">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Empresa</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Representante</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Data</th>
                <th className="text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {onboardings.map(ob => {
                const config = STATUS_CONFIG[ob.status] || STATUS_CONFIG.pending;
                const isExpanded = expandedId === ob.id;
                return (
                  <tr key={ob.id} className="border-b border-gray-50 dark:border-gray-700/50 last:border-b-0">
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        <Sensitive>{ob.company_legal_name || ob.prospect_company_name}</Sensitive>
                      </p>
                      {ob.company_cnpj && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          <Sensitive>{ob.company_cnpj}</Sensitive>
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        <Sensitive>{ob.rep_full_name || '—'}</Sensitive>
                      </p>
                      {ob.rep_cpf && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          <Sensitive>{ob.rep_cpf}</Sensitive>
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={config.variant} dot>{config.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {ob.submitted_at
                        ? new Date(ob.submitted_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                        : new Date(ob.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => copyLink(ob)}
                          className="p-1.5 text-gray-400 hover:text-accent-gold rounded-lg transition-colors"
                          title="Copiar link"
                        >
                          {copied === ob.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                        {ob.status !== 'pending' && (
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : ob.id)}
                            className="p-1.5 text-gray-400 hover:text-accent-gold rounded-lg transition-colors"
                            title="Ver detalhes"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        {ob.status === 'submitted' && (
                          <button
                            onClick={() => markReviewed(ob.id)}
                            disabled={reviewing === ob.id}
                            className="p-1.5 text-gray-400 hover:text-blue-500 rounded-lg transition-colors disabled:opacity-50"
                            title="Marcar como revisado"
                          >
                            {reviewing === ob.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                      {/* Expanded detail */}
                      {isExpanded && ob.status !== 'pending' && (
                        <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl text-xs space-y-3 text-left">
                          <div>
                            <h4 className="font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">Dados da Empresa</h4>
                            <div className="grid grid-cols-2 gap-1 text-gray-600 dark:text-gray-400">
                              <p>Razão Social: <span className="text-gray-900 dark:text-gray-200"><Sensitive>{ob.company_legal_name}</Sensitive></span></p>
                              <p>CNPJ: <span className="text-gray-900 dark:text-gray-200"><Sensitive>{ob.company_cnpj}</Sensitive></span></p>
                              <p className="col-span-2">
                                Endereço: <span className="text-gray-900 dark:text-gray-200">
                                  <Sensitive>{ob.company_street}, {ob.company_number}{ob.company_complement ? ` - ${ob.company_complement}` : ''}, {ob.company_neighborhood}, {ob.company_city}/{ob.company_state} - CEP {ob.company_cep}</Sensitive>
                                </span>
                              </p>
                            </div>
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">Representante Legal</h4>
                            <div className="grid grid-cols-2 gap-1 text-gray-600 dark:text-gray-400">
                              <p>Nome: <span className="text-gray-900 dark:text-gray-200"><Sensitive>{ob.rep_full_name}</Sensitive></span></p>
                              <p>CPF: <span className="text-gray-900 dark:text-gray-200"><Sensitive>{ob.rep_cpf}</Sensitive></span></p>
                              <p>Estado Civil: <span className="text-gray-900 dark:text-gray-200">{MARITAL_LABELS[ob.rep_marital_status] || ob.rep_marital_status}</span></p>
                              <p>Profissão: <span className="text-gray-900 dark:text-gray-200">{ob.rep_profession}</span></p>
                              <p className="col-span-2">
                                Endereço: <span className="text-gray-900 dark:text-gray-200">
                                  <Sensitive>{ob.rep_street}, {ob.rep_number}{ob.rep_complement ? ` - ${ob.rep_complement}` : ''}, {ob.rep_neighborhood}, {ob.rep_city}/{ob.rep_state} - CEP {ob.rep_cep}</Sensitive>
                                </span>
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
