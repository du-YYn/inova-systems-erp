'use client';

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { 
  LayoutDashboard, 
  Users, 
  FolderKanban, 
  LogOut,
  DollarSign,
  FileText,
} from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  
  if (!token) {
    redirect('/login');
  }

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh');
    localStorage.removeItem('user');
    redirect('/login');
  };

  return (
    <div className="flex min-h-screen bg-bg-secondary">
      <aside className="w-64 bg-text-primary text-white flex flex-col">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent-gold rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">IS</span>
            </div>
            <div>
              <h1 className="font-semibold">Inova ERP</h1>
              <p className="text-xs text-gray-400">Gestão Empresarial</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <Link 
            href="/dashboard" 
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LayoutDashboard className="w-5 h-5" />
            Dashboard
          </Link>

          <div className="pt-4 pb-2">
            <p className="px-4 text-xs text-gray-500 uppercase tracking-wider">Comercial</p>
          </div>
          <Link 
            href="/crm" 
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <Users className="w-5 h-5" />
            CRM
          </Link>
          <Link 
            href="/sales" 
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <FileText className="w-5 h-5" />
            Propostas
          </Link>

          <div className="pt-4 pb-2">
            <p className="px-4 text-xs text-gray-500 uppercase tracking-wider">Projetos</p>
          </div>
          <Link 
            href="/projects" 
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <FolderKanban className="w-5 h-5" />
            Projetos
          </Link>

          <div className="pt-4 pb-2">
            <p className="px-4 text-xs text-gray-500 uppercase tracking-wider">Financeiro</p>
          </div>
          <Link 
            href="/finance" 
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <DollarSign className="w-5 h-5" />
            Financeiro
          </Link>
        </nav>

        <div className="p-4 border-t border-white/10">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-white/10 hover:text-white transition-colors w-full"
          >
            <LogOut className="w-5 h-5" />
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
