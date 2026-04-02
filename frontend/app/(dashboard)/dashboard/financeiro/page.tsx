'use client';

import DashboardFinanceiro from '../../finance/DashboardFinanceiro';
import { useDemoMode } from '@/components/ui/DemoContext';

export default function DashboardFinanceiroPage() {
  const { isDemoMode } = useDemoMode();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard Financeiro</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Visão executiva financeira — DRE, MRR, resultado e distribuição</p>
      </div>
      <DashboardFinanceiro isDemoMode={isDemoMode} />
    </div>
  );
}
