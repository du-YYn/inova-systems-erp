'use client';

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
  Menu,
  Bell,
  ChevronRight,
} from 'lucide-react';
import { useState, useEffect } from 'react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: 'MENU',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'OPERAÇÕES',
    items: [
      { href: '/clientes',  label: 'Clientes',  icon: Building2     },
      { href: '/crm',       label: 'CRM',        icon: Users         },
      { href: '/sales',     label: 'Vendas',     icon: FileText      },
      { href: '/contratos', label: 'Contratos',  icon: ScrollText    },
      { href: '/projects',  label: 'Projetos',   icon: FolderKanban  },
      { href: '/finance',   label: 'Financeiro', icon: DollarSign    },
    ],
  },
  {
    title: 'ANÁLISE',
    items: [
      { href: '/relatorios', label: 'Relatórios', icon: BarChart2 },
    ],
  },
  {
    title: 'CONTA',
    items: [
      { href: '/perfil',   label: 'Meu Perfil', icon: UserCircle },
      { href: '/usuarios', label: 'Usuários',   icon: Settings   },
    ],
  },
];

// Flat map for breadcrumb lookup
const allNavItems = navSections.flatMap((s) => s.items);

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<{ username: string; email: string } | null>(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) setUser(JSON.parse(userData));
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

  const currentPage = allNavItems.find(
    (item) => pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href)),
  );

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-white/8">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold text-[#A6864A] tracking-tighter leading-none">
              Inova.
            </h1>
            <p className="text-[9px] font-medium text-slate-500 tracking-[0.18em] mt-0.5 uppercase">
              Systems Solutions
            </p>
          </div>
        </div>
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden p-1.5 hover:bg-white/8 rounded-lg transition-colors"
        >
          <X className="w-4 h-4 text-slate-400" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {navSections.map((section) => (
          <div key={section.title}>
            <p className="px-3 mb-1.5 text-[10px] font-semibold text-slate-600 tracking-widest uppercase">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                      transition-all duration-150
                      ${
                        isActive
                          ? 'bg-[#A6864A]/15 text-[#C4A67C]'
                          : 'text-slate-400 hover:bg-white/6 hover:text-slate-200'
                      }
                    `}
                  >
                    <Icon
                      className={`w-4 h-4 flex-shrink-0 ${
                        isActive ? 'text-[#A6864A]' : 'text-slate-500'
                      }`}
                    />
                    <span className="flex-1">{item.label}</span>
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#A6864A] flex-shrink-0" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer */}
      <div className="px-3 pb-4 border-t border-white/8 pt-3">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/6 transition-colors cursor-pointer group mb-1">
          <div className="w-8 h-8 bg-gradient-to-br from-[#A6864A] to-[#6B5032] rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {user?.username?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate leading-tight">
              {user?.username || 'Usuário'}
            </p>
            <p className="text-[11px] text-slate-500 truncate leading-tight">
              {user?.email || ''}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-all duration-150 w-full text-sm font-medium"
        >
          <LogOut className="w-4 h-4" />
          <span>Sair</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-72
          bg-[#0F1117] flex flex-col
          shadow-sidebar
          transition-transform duration-300 ease-in-out
          lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <SidebarContent />
      </aside>

      {/* Main area */}
      <div className="lg:ml-72 flex flex-col min-h-screen">
        {/* Topbar */}
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-100 shadow-topbar">
          <div className="flex items-center h-14 px-4 lg:px-6 gap-4">
            {/* Mobile menu */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Menu className="w-5 h-5 text-gray-600" />
            </button>

            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-sm min-w-0">
              <span className="text-gray-400 hidden sm:block">Inova ERP</span>
              {currentPage && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 hidden sm:block" />
                  <span className="font-semibold text-gray-800 truncate">{currentPage.label}</span>
                </>
              )}
            </div>

            <div className="flex-1" />

            {/* Right actions */}
            <button className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <Bell className="w-4.5 h-4.5 text-gray-500" />
            </button>

            {/* Avatar */}
            <Link
              href="/perfil"
              className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <div className="w-7 h-7 bg-gradient-to-br from-[#A6864A] to-[#6B5032] rounded-full flex items-center justify-center text-white text-xs font-bold">
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </div>
              <span className="text-sm font-medium text-gray-700 hidden sm:block">
                {user?.username || 'Usuário'}
              </span>
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
