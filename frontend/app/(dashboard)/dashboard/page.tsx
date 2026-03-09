'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  TrendingUp, 
  DollarSign, 
  ShoppingCart, 
  FolderKanban,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  Briefcase
} from 'lucide-react';

interface Stats {
  mrr: number;
  active_contracts: number;
  expiring_contracts: number;
  total_projects: number;
  active_projects: number;
  total_budget: number;
  received_this_month: number;
  paid_this_month: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    mrr: 0,
    active_contracts: 0,
    expiring_contracts: 0,
    total_projects: 0,
    active_projects: 0,
    total_budget: 0,
    received_this_month: 0,
    paid_this_month: 0,
  });
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
    
    const fetchStats = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
        const headers = { 'Content-Type': 'application/json' };

        const [contractsRes, projectsRes, financeRes] = await Promise.all([
          fetch(`${apiUrl}/sales/contracts/dashboard/`, { headers, credentials: 'include' }),
          fetch(`${apiUrl}/projects/projects/dashboard/`, { headers, credentials: 'include' }),
          fetch(`${apiUrl}/finance/invoices/dashboard/`, { headers, credentials: 'include' }),
        ]);

        const contractsData = await contractsRes.json();
        const projectsData = await projectsRes.json();
        const financeData = await financeRes.json();

        setStats({
          mrr: contractsData.mrr || 0,
          active_contracts: contractsData.active_contracts || 0,
          expiring_contracts: contractsData.expiring_contracts || 0,
          total_projects: projectsData.total_projects || 0,
          active_projects: projectsData.active_projects || 0,
          total_budget: projectsData.total_budget || 0,
          received_this_month: financeData.received_this_month || 0,
          paid_this_month: financeData.paid_this_month || 0,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
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
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary">
          Bem-vindo{user?.first_name ? `, ${user.first_name}` : ''}!
        </h1>
        <p className="text-text-secondary mt-1">
          Aqui está o overview do seu negócio
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex items-center gap-1 text-sm text-green-600">
              <ArrowUpRight className="w-4 h-4" />
              MRR
            </div>
          </div>
          <p className="text-text-secondary text-sm">Receita Recorrente Mensal</p>
          <p className="text-2xl font-semibold text-text-primary mt-1">
            {loading ? '...' : formatCurrency(stats.mrr)}
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
              <Briefcase className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <p className="text-text-secondary text-sm">Contratos Ativos</p>
          <p className="text-2xl font-semibold text-text-primary mt-1">
            {loading ? '...' : stats.active_contracts}
          </p>
          {stats.expiring_contracts > 0 && (
            <p className="text-xs text-orange-600 mt-1">
              {stats.expiring_contracts} expirando em 30 dias
            </p>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center">
              <FolderKanban className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <p className="text-text-secondary text-sm">Projetos Ativos</p>
          <p className="text-2xl font-semibold text-text-primary mt-1">
            {loading ? '...' : `${stats.active_projects}/${stats.total_projects}`}
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-accent-gold/10 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-accent-gold" />
            </div>
          </div>
          <p className="text-text-secondary text-sm">Receita do Mês</p>
          <p className="text-2xl font-semibold text-text-primary mt-1">
            {loading ? '...' : formatCurrency(stats.received_this_month)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg border border-gray-100">
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            Ações Rápidas
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/crm" className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <Users className="w-5 h-5 text-accent-gold mb-2" />
              <span className="text-sm font-medium">Novo Prospect</span>
            </Link>
            <Link href="/sales" className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <FileText className="w-5 h-5 text-accent-gold mb-2" />
              <span className="text-sm font-medium">Nova Proposta</span>
            </Link>
            <Link href="/projects" className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <FolderKanban className="w-5 h-5 text-accent-gold mb-2" />
              <span className="text-sm font-medium">Novo Projeto</span>
            </Link>
            <Link href="/finance" className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <DollarSign className="w-5 h-5 text-accent-gold mb-2" />
              <span className="text-sm font-medium">Lançar Receita</span>
            </Link>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-100">
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            Fluxo de Caixa do Mês
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <ArrowUpRight className="w-5 h-5 text-green-600" />
                </div>
                <span className="text-text-secondary">Receitas</span>
              </div>
              <span className="font-medium text-green-600">
                {loading ? '...' : formatCurrency(stats.received_this_month)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <ArrowDownRight className="w-5 h-5 text-red-600" />
                </div>
                <span className="text-text-secondary">Despesas</span>
              </div>
              <span className="font-medium text-red-600">
                {loading ? '...' : formatCurrency(stats.paid_this_month)}
              </span>
            </div>
            <div className="h-px bg-gray-200" />
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-primary">Saldo</span>
              <span className={`font-bold text-lg ${
                stats.received_this_month - stats.paid_this_month >= 0 
                  ? 'text-green-600' 
                  : 'text-red-600'
              }`}>
                {loading ? '...' : formatCurrency(stats.received_this_month - stats.paid_this_month)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
