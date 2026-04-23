'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Send, DollarSign, UserCircle, LogOut } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '@/lib/api';

const NAV_ITEMS = [
  { href: '/partner/dashboard', label: 'Início', icon: LayoutDashboard },
  { href: '/partner/leads', label: 'Indicações', icon: Send },
  { href: '/partner/commissions', label: 'Comissões', icon: DollarSign },
  { href: '/partner/perfil', label: 'Perfil', icon: UserCircle },
];

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<{ username: string; first_name: string; role?: string } | null>(null);

  useEffect(() => {
    try {
      const data = localStorage.getItem('user');
      if (data) setUser(JSON.parse(data));
    } catch { /* ignore */ }
  }, []);

  const handleLogout = async () => {
    // O backend (/accounts/logout/) limpa os cookies httpOnly via Set-Cookie.
    // Tentar deletar cookies httpOnly via document.cookie é no-op no browser.
    try { await api.post('/accounts/logout/'); } catch { /* ignore */ }
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-100">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-[#111] border-b border-[#1a1a1a] px-4 py-3 lg:px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-[#A6864A]">Inova.</h1>
            <span className="text-xs text-gray-500 hidden sm:inline">Portal do Parceiro</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">
              Olá, <span className="text-gray-200 font-medium">{user?.first_name || user?.username || '...'}</span>
            </span>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-500 hover:text-red-400 transition-colors rounded-lg"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Sidebar (desktop only) ── */}
      <aside className="hidden lg:flex fixed left-0 top-[57px] bottom-0 w-56 bg-[#111] border-r border-[#1a1a1a] flex-col p-4 gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? 'bg-[#A6864A]/10 text-[#A6864A]'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a1a1a]'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </aside>

      {/* ── Main content ── */}
      <main className="lg:ml-56 pb-20 lg:pb-6">
        <div className="max-w-5xl mx-auto p-4 lg:p-6">
          {children}
        </div>
      </main>

      {/* ── Bottom nav (mobile only) ── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#111] border-t border-[#1a1a1a] safe-area-bottom">
        <div className="flex items-center justify-around py-2">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors min-w-[60px] ${
                  active ? 'text-[#A6864A]' : 'text-gray-500'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
