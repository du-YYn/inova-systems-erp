'use client';

import { useEffect, useState } from 'react';
import { 
  Plus, 
  Search, 
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  CreditCard,
  TrendingUp,
  FileText,
  ArrowRightCircle
} from 'lucide-react';

export default function FinancePage() {
  const [stats, setStats] = useState({
    pending_receivables: 0,
    pending_payables: 0,
    received_this_month: 0,
    paid_this_month: 0,
    balance: 0,
    overdue_invoices: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('token');
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
        
        const res = await fetch(`${apiUrl}/finance/invoices/dashboard/`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        
        const data = await res.json();
        setStats(data);
      } catch (error) {
        console.error('Error fetching finance stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Financeiro</h1>
          <p className="text-text-secondary mt-1">Controle de receitas e despesas</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
            <ArrowUpRight className="w-5 h-5" />
            Nova Receita
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
            <ArrowDownRight className="w-5 h-5" />
            Nova Despesa
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-6 rounded-lg border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
              <ArrowUpRight className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <p className="text-text-secondary text-sm">Receitas do Mês</p>
          <p className="text-2xl font-semibold text-text-primary mt-1">
            {loading ? '...' : formatCurrency(stats.received_this_month)}
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
              <ArrowDownRight className="w-6 h-6 text-red-600" />
            </div>
          </div>
          <p className="text-text-secondary text-sm">Despesas do Mês</p>
          <p className="text-2xl font-semibold text-text-primary mt-1">
            {loading ? '...' : formatCurrency(stats.paid_this_month)}
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <p className="text-text-secondary text-sm">Receber</p>
          <p className="text-2xl font-semibold text-text-primary mt-1">
            {loading ? '...' : formatCurrency(stats.pending_receivables)}
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-orange-600" />
            </div>
            {stats.overdue_invoices > 0 && (
              <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                {stats.overdue_invoices} vencidas
              </span>
            )}
          </div>
          <p className="text-text-secondary text-sm">Pagar</p>
          <p className="text-2xl font-semibold text-text-primary mt-1">
            {loading ? '...' : formatCurrency(stats.pending_payables)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">Contas a Receber</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">Fatura #001</p>
                  <p className="text-xs text-text-secondary">Cliente ABC</p>
                </div>
              </div>
              <span className="text-sm font-medium text-green-600">R$ 5.000,00</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">Fatura #002</p>
                  <p className="text-xs text-text-secondary">Cliente XYZ</p>
                </div>
              </div>
              <span className="text-sm font-medium text-green-600">R$ 12.500,00</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">Contas a Pagar</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">Aluguel</p>
                  <p className="text-xs text-text-secondary">Próprio comercial</p>
                </div>
              </div>
              <span className="text-sm font-medium text-red-600">R$ 3.500,00</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">Serviços Cloud</p>
                  <p className="text-xs text-text-secondary">AWS</p>
                </div>
              </div>
              <span className="text-sm font-medium text-red-600">R$ 890,00</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 bg-white rounded-lg border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-primary">Ações Rápidas</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left">
            <FileText className="w-5 h-5 text-accent-gold mb-2" />
            <span className="text-sm font-medium">Nova Fatura</span>
          </button>
          <button className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left">
            <TrendingUp className="w-5 h-5 text-accent-gold mb-2" />
            <span className="text-sm font-medium">Fluxo de Caixa</span>
          </button>
          <button className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left">
            <DollarSign className="w-5 h-5 text-accent-gold mb-2" />
            <span className="text-sm font-medium">Extrato</span>
          </button>
          <button className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left">
            <CreditCard className="w-5 h-5 text-accent-gold mb-2" />
            <span className="text-sm font-medium">Categorias</span>
          </button>
        </div>
      </div>
    </div>
  );
}
