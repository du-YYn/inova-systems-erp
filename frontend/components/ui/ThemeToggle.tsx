'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setDark(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  if (!mounted) return null;

  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Ativar modo claro' : 'Ativar modo escuro'}
      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
    >
      {dark ? (
        <Sun className="w-4 h-4 text-gray-500 dark:text-gray-400" />
      ) : (
        <Moon className="w-4 h-4 text-gray-500" />
      )}
    </button>
  );
}
