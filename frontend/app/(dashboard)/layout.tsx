'use client';

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Building2,
  FolderKanban,
  LogOut,
  DollarSign,
  FileText,
  ScrollText,
  Settings,
  X,
  BarChart2,
  UserCircle,
} from 'lucide-react';
import { useState, useEffect } from 'react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<{ username: string; email: string } | null>(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const handleLogout = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
      await fetch(`${apiUrl}/accounts/logout/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      // ignora erros de rede no logout
    }
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/clientes', label: 'Clientes', icon: Building2 },
    { href: '/crm', label: 'CRM', icon: Users },
    { href: '/sales', label: 'Vendas', icon: FileText },
    { href: '/contratos', label: 'Contratos', icon: ScrollText },
    { href: '/projects', label: 'Projetos', icon: FolderKanban },
    { href: '/finance', label: 'Financeiro', icon: DollarSign },
    { href: '/relatorios', label: 'Relatórios', icon: BarChart2 },
    { href: '/usuarios', label: 'Usuários', icon: Settings },
    { href: '/perfil', label: 'Meu Perfil', icon: UserCircle },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 z-50 h-full w-72 bg-gradient-to-b from-slate-900 to-slate-800 text-white transition-transform duration-300 ease-in-out
        lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3 group cursor-pointer">
            <div>
              <h1 className="text-2xl font-bold text-[#A6864A] tracking-tighter group-hover:text-[#B8965A] transition-colors">Inova.</h1>
              <p className="text-[10px] font-light text-slate-400 tracking-[0.15em] -mt-1 uppercase">Systems Solutions</p>
            </div>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-4 space-y-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200
                  ${isActive 
                    ? 'bg-gradient-to-r from-[#A6864A]/20 to-[#A6864A]/10 text-[#A6864A] border-l-4 border-[#A6864A]' 
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                  }
                `}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-[#A6864A]' : ''}`} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-10 h-10 bg-gradient-to-br from-[#A6864A] to-[#8B6F3D] rounded-full flex items-center justify-center text-white font-bold">
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{user?.username || 'Usuário'}</p>
              <p className="text-xs text-slate-400 truncate">{user?.email || 'usuario@inova.com'}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 hover:bg-red-500/10 hover:text-red-400 transition-colors w-full"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Sair</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:ml-72">
        {/* Page content */}
        <main className="p-4 lg:p-8 bg-gray-200 min-h-screen">
          {children}
        </main>
      </div>
    </div>
  );
}
