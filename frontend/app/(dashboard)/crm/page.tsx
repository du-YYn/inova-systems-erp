'use client';

import { useState } from 'react';
import { Target, FileText, ScrollText, Building2, Activity } from 'lucide-react';
import FunilTab from './FunilTab';
import PropostasTab from './PropostasTab';
import ContratosTab from './ContratosTab';
import ContasTab from './ContasTab';
import AtividadesTab from './AtividadesTab';

type Tab = 'funil' | 'propostas' | 'contratos' | 'contas' | 'atividades';

const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'funil', label: 'Funil', icon: Target },
  { key: 'propostas', label: 'Propostas', icon: FileText },
  { key: 'contratos', label: 'Contratos', icon: ScrollText },
  { key: 'contas', label: 'Contas', icon: Building2 },
  { key: 'atividades', label: 'Atividades', icon: Activity },
];

export default function CRMPage() {
  const [activeTab, setActiveTab] = useState<Tab>('funil');

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">CRM</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Gestão comercial completa — do lead ao pós-venda</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-1 shadow-card mb-6 w-fit overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 whitespace-nowrap ${
              activeTab === key
                ? 'bg-accent-gold text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Keyboard shortcut hint */}
      <div className="hidden md:flex items-center gap-4 mb-4 text-[10px] text-gray-400 dark:text-gray-500">
        <span><kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px]">Ctrl+N</kbd> Novo Lead</span>
        <span><kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px]">Ctrl+K</kbd> Buscar</span>
        <span><kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px]">Esc</kbd> Fechar</span>
      </div>

      {/* Tab content */}
      {activeTab === 'funil' && <FunilTab />}
      {activeTab === 'propostas' && <PropostasTab />}
      {activeTab === 'contratos' && <ContratosTab />}
      {activeTab === 'contas' && <ContasTab />}
      {activeTab === 'atividades' && <AtividadesTab />}
    </div>
  );
}
