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
  ShieldCheck,
  X,
  BarChart2,
  UserCircle,
  Menu,
  Bell,
  ChevronRight,
  Headphones,
  Target,
  BellRing,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '@/lib/api';

interface Notif {
  id: number;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  notification_type: string;
}

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
    title: 'GERAL',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'COMERCIAL',
    items: [
      { href: '/crm',       label: 'CRM',        icon: Target        },
      { href: '/sales',     label: 'Vendas',     icon: FileText      },
      { href: '/clientes',  label: 'Clientes',  icon: Building2     },
      { href: '/contratos', label: 'Contratos',  icon: ScrollText    },
    ],
  },
  {
    title: 'OPERACIONAL',
    items: [
      { href: '/projects',  label: 'Projetos',   icon: FolderKanban  },
      { href: '/suporte',   label: 'Suporte',    icon: Headphones    },
    ],
  },
  {
    title: 'FINANCEIRO',
    items: [
      { href: '/finance',    label: 'Financeiro',  icon: DollarSign  },
    ],
  },
  {
    title: 'ANÁLISE',
    items: [
      { href: '/relatorios', label: 'Relatórios',  icon: BarChart2   },
    ],
  },
  {
    title: 'ADMINISTRAÇÃO',
    items: [
      { href: '/usuarios',    label: 'Usuários',      icon: ShieldCheck },
      { href: '/notificacoes', label: 'Notificações', icon: BellRing    },
      { href: '/perfil',      label: 'Meu Perfil',    icon: UserCircle  },
    ],
  },
];

// Flat map for breadcrumb lookup
const allNavItems = navSections.flatMap((s) => s.items);

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<{ username: string; email: string } | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notif[]>([]);


  useEffect(() => {
    try {
      const userData = localStorage.getItem('user');
      if (userData) {
        const parsed = JSON.parse(userData);
        if (parsed && typeof parsed.username === 'string') {
          setUser(parsed);
        }
      }
    } catch {
      localStorage.removeItem('user');
    }
  }, []);

  const fetchUnreadCount = async () => {
    try {
      const data = await api.get<{ unread_count: number }>('/notifications/notifications/unread_count/');
      setUnreadCount(data.unread_count ?? 0);
    } catch {
      // silently ignore
    }
  };

  const fetchNotifications = async () => {
    try {
      const data = await api.get<{ results: Notif[] }>('/notifications/notifications/', { page_size: '10' });
      setNotifications(data.results ?? []);
    } catch {
      // silently ignore
    }
  };

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!notifOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#notif-dropdown') && !target.closest('#notif-bell')) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notifOpen]);

  const handleBellClick = () => {
    const opening = !notifOpen;
    setNotifOpen(opening);
    if (opening) fetchNotifications();
  };

  const handleMarkRead = async (id: number) => {
    try {
      await api.patch(`/notifications/notifications/${id}/mark_read/`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // silently ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/notifications/mark_all_read/');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      // silently ignore
    }
  };

  const relativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return `${mins}min atrás`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h atrás`;
    return `${Math.floor(hrs / 24)}d atrás`;
  };

  const handleLogout = async () => {
    try {
      await api.post('/accounts/logout/');
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
    <div className="min-h-screen bg-[#ECECEC]">
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
              aria-label="Abrir menu"
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

            {/* Right actions — notification bell */}
            <div className="relative">
              <button
                id="notif-bell"
                onClick={handleBellClick}
                aria-label="Notificações"
                className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Bell className="w-4.5 h-4.5 text-gray-500" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div
                  id="notif-dropdown"
                  className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <span className="text-sm font-semibold text-gray-800">Notificações</span>
                    <button
                      onClick={handleMarkAllRead}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                    >
                      Marcar todas como lidas
                    </button>
                  </div>

                  {/* List */}
                  <ul className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                    {notifications.length === 0 ? (
                      <li className="px-4 py-6 text-center text-sm text-gray-400">
                        Nenhuma notificação
                      </li>
                    ) : (
                      notifications.map((notif) => (
                        <li
                          key={notif.id}
                          onClick={() => !notif.is_read && handleMarkRead(notif.id)}
                          className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                            !notif.is_read ? 'bg-blue-50/40' : ''
                          }`}
                        >
                          {/* Blue dot for unread */}
                          <span
                            className={`mt-1.5 flex-shrink-0 w-2 h-2 rounded-full ${
                              notif.is_read ? 'bg-transparent' : 'bg-blue-500'
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">
                              {notif.title}
                            </p>
                            <p className="text-xs text-gray-500 truncate mt-0.5">
                              {notif.message}
                            </p>
                            <p className="text-[10px] text-gray-400 mt-1">
                              {relativeTime(notif.created_at)}
                            </p>
                          </div>
                        </li>
                      ))
                    )}
                  </ul>

                  {/* Footer */}
                  <div className="border-t border-gray-100 px-4 py-2.5">
                    <Link
                      href="/notificacoes"
                      onClick={() => setNotifOpen(false)}
                      className="block text-center text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      Ver todas
                    </Link>
                  </div>
                </div>
              )}
            </div>

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
        <main className="flex-1 p-4 lg:p-8 bg-[#ECECEC]">
          {children}
        </main>
      </div>
    </div>
  );
}
