'use client';

import { useEffect, useState } from 'react';
import { 
  Plus, 
  Search, 
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  Users,
  FileText,
  DollarSign,
  TrendingUp
} from 'lucide-react';

interface Prospect {
  id: number;
  company_name: string;
  contact_name: string;
  contact_email: string;
  source: string;
  status: string;
  estimated_value: number;
}

export default function CRMPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchProspects = async () => {
      try {
        const token = localStorage.getItem('token');
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
        
        const res = await fetch(`${apiUrl}/sales/prospects/`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        
        const data = await res.json();
        setProspects(data.results || data);
      } catch (error) {
        console.error('Error fetching prospects:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProspects();
  }, []);

  const statusColors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-800',
    contacted: 'bg-yellow-100 text-yellow-800',
    qualified: 'bg-purple-100 text-purple-800',
    meeting: 'bg-indigo-100 text-indigo-800',
    proposal: 'bg-orange-100 text-orange-800',
    negotiation: 'bg-teal-100 text-teal-800',
    won: 'bg-green-100 text-green-800',
    lost: 'bg-red-100 text-red-800',
    inactive: 'bg-gray-100 text-gray-800',
  };

  const statusLabels: Record<string, string> = {
    new: 'Novo',
    contacted: 'Contatado',
    qualified: 'Qualificado',
    meeting: 'Reunião',
    proposal: 'Proposta',
    negotiation: 'Negociação',
    won: 'Fechado',
    lost: 'Perdido',
    inactive: 'Inativo',
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const filteredProspects = prospects.filter(p => 
    p.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.contact_name?.toLowerCase().includes(search.toLowerCase())
  );

  const pipelineValue = prospects.reduce((acc, p) => acc + (p.estimated_value || 0), 0);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">CRM</h1>
          <p className="text-text-secondary mt-1">Gestão de Prospecção e Clientes</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors">
          <Plus className="w-5 h-5" />
          Novo Prospect
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-text-secondary">Total Prospects</p>
              <p className="text-lg font-semibold text-text-primary">{prospects.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-text-secondary">Pipeline</p>
              <p className="text-lg font-semibold text-text-primary">{formatCurrency(pipelineValue)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-text-secondary">Propostas Abertas</p>
              <p className="text-lg font-semibold text-text-primary">
                {prospects.filter(p => p.status === 'proposal').length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent-gold/10 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-accent-gold" />
            </div>
            <div>
              <p className="text-sm text-text-secondary">Fechados</p>
              <p className="text-lg font-semibold text-text-primary">
                {prospects.filter(p => p.status === 'won').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar prospects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">Empresa</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">Contato</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">Origem</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">Valor Est.</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-text-secondary">Status</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-text-secondary">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-text-secondary">
                    Carregando...
                  </td>
                </tr>
              ) : filteredProspects.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-text-secondary">
                    Nenhum prospect encontrado
                  </td>
                </tr>
              ) : (
                filteredProspects.map((prospect) => (
                  <tr key={prospect.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-text-primary">{prospect.company_name}</td>
                    <td className="px-4 py-3 text-text-secondary">
                      <div>
                        <p className="text-text-primary">{prospect.contact_name}</p>
                        <p className="text-xs text-text-secondary">{prospect.contact_email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary capitalize">{prospect.source}</td>
                    <td className="px-4 py-3 text-text-primary font-medium">{formatCurrency(prospect.estimated_value)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[prospect.status] || 'bg-gray-100 text-gray-800'}`}>
                        {statusLabels[prospect.status] || prospect.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-1.5 text-gray-400 hover:text-accent-gold transition-colors">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 text-gray-400 hover:text-accent-gold transition-colors">
                          <Edit className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
