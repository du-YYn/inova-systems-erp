'use client';

import { useEffect, useState } from 'react';
import { DollarSign, Loader2, CheckCircle, Clock } from 'lucide-react';
import api from '@/lib/api';

interface Commission {
  id: number;
  company_name: string;
  project_value: string;
  commission_pct: string;
  commission_value: string;
  status: string;
  paid_at: string | null;
  created_at: string;
}

const fmt = (v: number | string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));

export default function PartnerCommissionsPage() {
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Commission[]>('/sales/partner/commissions/')
      .then(setCommissions)
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

  const total = commissions.reduce((acc, c) => acc + Number(c.commission_value), 0);
  const pending = commissions.filter(c => c.status === 'pending').reduce((acc, c) => acc + Number(c.commission_value), 0);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-100">Comissões</h2>
        <p className="text-sm text-gray-500 mt-0.5">Acompanhe seus ganhos por indicação</p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Total</p>
          <p className="text-lg font-bold text-[#A6864A] mt-0.5">{fmt(total)}</p>
        </div>
        <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Pendente</p>
          <p className="text-lg font-bold text-yellow-400 mt-0.5">{fmt(pending)}</p>
        </div>
      </div>

      {/* Lista */}
      {commissions.length === 0 ? (
        <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-8 text-center">
          <DollarSign className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">Nenhuma comissão ainda</p>
          <p className="text-gray-600 text-sm mt-1">Comissões são geradas ao fechar um lead indicado por você</p>
        </div>
      ) : (
        <div className="space-y-2">
          {commissions.map(c => (
            <div key={c.id} className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-gray-200">{c.company_name}</p>
                {c.status === 'paid' ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-green-400">
                    <CheckCircle className="w-3.5 h-3.5" /> Pago
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-semibold text-yellow-400">
                    <Clock className="w-3.5 h-3.5" /> Pendente
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>Projeto: {fmt(c.project_value)}</span>
                <span className="text-[#A6864A] font-bold text-sm">{fmt(c.commission_value)}</span>
              </div>
              <p className="text-[10px] text-gray-600 mt-1">
                {Number(c.commission_pct)}% · {new Date(c.created_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
