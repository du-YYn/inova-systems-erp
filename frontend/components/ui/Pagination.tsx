'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, totalPages, totalItems, pageSize, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  const pages = buildPageList(page, totalPages);

  return (
    <nav role="navigation" aria-label="Paginação" className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
      <p className="text-sm text-gray-500">
        Mostrando <span className="font-medium">{from}–{to}</span> de{' '}
        <span className="font-medium">{totalItems}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          aria-label="Página anterior"
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-ring"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="px-2 text-gray-400 text-sm" aria-hidden="true">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(Number(p))}
              aria-label={`Página ${p}`}
              aria-current={p === page ? 'page' : undefined}
              className={`w-8 h-8 rounded text-sm font-medium transition-colors focus-ring ${
                p === page
                  ? 'bg-accent-gold text-white'
                  : 'hover:bg-gray-100 text-gray-600'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          aria-label="Próxima página"
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-ring"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </nav>
  );
}

function buildPageList(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '...')[] = [1];
  if (current > 3) pages.push('...');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    pages.push(p);
  }
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}
