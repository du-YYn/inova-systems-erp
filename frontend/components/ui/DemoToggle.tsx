'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useDemoMode } from './DemoContext';

export function DemoToggle() {
  const { isDemoMode, toggleDemoMode } = useDemoMode();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <button
      onClick={toggleDemoMode}
      aria-label={isDemoMode ? 'Desativar modo demonstração' : 'Ativar modo demonstração'}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all duration-200 ${
        isDemoMode
          ? 'bg-accent-gold/15 text-accent-gold border border-accent-gold/30'
          : 'hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400'
      }`}
    >
      {isDemoMode ? (
        <EyeOff className="w-4 h-4" />
      ) : (
        <Eye className="w-4 h-4" />
      )}
      {isDemoMode && (
        <span className="text-[10px] font-bold uppercase tracking-wider">Demo</span>
      )}
    </button>
  );
}
