'use client';

import { useState } from 'react';
import { Target, FileText, ScrollText, Building2, Activity } from 'lucide-react';
import FunilTab from './FunilTab';
import PropostasTab from './PropostasTab';
import ContratosTab from './ContratosTab';
import ContasTab from './ContasTab';

type Tab = 'funil' | 'propostas' | 'contratos' | 'contas';

const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'funil', label: 'Funil', icon: Target },
  { key: 'propostas', label: 'Propostas', icon: FileText },
  { key: 'contratos', label: 'Contratos', icon: ScrollText },
  { key: 'contas', label: 'Contas', icon: Building2 },
];

export default function CRMPage() {
  const [activeTab, setActiveTab] = useState<Tab>('funil');

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">CRM</h1>
        <p className="text-sm text-gray-500 mt-1">Gestão comercial completa — do lead ao pós-venda</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-card mb-6 w-fit">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
              activeTab === key
                ? 'bg-[#A6864A] text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'funil' && <FunilTab />}
      {activeTab === 'propostas' && <PropostasTab />}
      {activeTab === 'contratos' && <ContratosTab />}
      {activeTab === 'contas' && <ContasTab />}
    </div>
  );
}
