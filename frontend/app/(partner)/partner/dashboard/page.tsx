'use client';

import { useEffect, useState } from 'react';
import { Send, CheckCircle, DollarSign, Clock, Loader2 } from 'lucide-react';
import api from '@/lib/api';

interface DashboardData {
  total_leads: number;
  leads_fechados: number;
  total_comissao: number;
  comissao_pendente: number;
  comissao_paga: number;
  ultimos_leads: { id: number; company_name: string; status: string; status_label: string; created_at: string }[];
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function PartnerDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<DashboardData>('/sales/partner/dashboard/')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-[#A6864A] animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const kpis = [
    { label: 'Indicações', value: data.total_leads, icon: Send, color: 'text-blue-400', bg: 'bg-blue-900/20' },
    { label: 'Fechados', value: data.leads_fechados, icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-900/20' },
    { label: 'Comissão Total', value: fmt(data.total_comissao), icon: DollarSign, color: 'text-[#A6864A]', bg: 'bg-[#A6864A]/10' },
    { label: 'Pendente', value: fmt(data.comissao_pendente), icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-900/20' },
  ];

  const STATUS_COLORS: Record<string, string> = {
    'Em análise': 'bg-blue-900/30 text-blue-400',
    'Em negociação': 'bg-yellow-900/30 text-yellow-400',
    'Fechado': 'bg-green-900/30 text-green-400',
    'Concluído': 'bg-emerald-900/30 text-emerald-400',
    'Não fechou': 'bg-red-900/30 text-red-400',
    'Acompanhamento': 'bg-orange-900/30 text-orange-400',
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-100">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-0.5">Acompanhe suas indicações e comissões</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {kpis.map(k => (
          <div key={k.label} className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4">
            <div className={`w-9 h-9 ${k.bg} rounded-lg flex items-center justify-center mb-2`}>
              <k.icon className={`w-4 h-4 ${k.color}`} />
            </div>
            <p className="text-[11px] text-gray-500 uppercase tracking-wide">{k.label}</p>
            <p className="text-lg font-bold text-gray-100 mt-0.5">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Últimas indicações */}
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Últimas Indicações</h3>
      <div className="space-y-2">
        {data.ultimos_leads.length === 0 ? (
          <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-6 text-center">
            <Send className="w-8 h-8 text-gray-600 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Nenhuma indicação ainda</p>
            <p className="text-gray-600 text-xs mt-1">Cadastre seu primeiro lead na aba Indicações</p>
          </div>
        ) : (
          data.ultimos_leads.map(lead => (
            <div key={lead.id} className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-200">{lead.company_name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[lead.status_label] || 'bg-gray-800 text-gray-400'}`}>
                {lead.status_label}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
