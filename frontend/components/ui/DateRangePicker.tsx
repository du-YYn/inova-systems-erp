'use client';

import { Calendar, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type DateRange = {
  /** YYYY-MM-DD inclusivo. null = sem filtro de inicio. */
  start: string | null;
  /** YYYY-MM-DD inclusivo. null = sem filtro de fim. */
  end: string | null;
  /** Label do preset selecionado, ou 'custom'. Usado pra URL e UI. */
  preset: PresetKey;
};

export type PresetKey =
  | 'today'
  | 'last7'
  | 'last30'
  | 'mtd'
  | 'last_month'
  | 'ytd'
  | 'all'
  | 'custom';

const PRESET_LABELS: Record<PresetKey, string> = {
  today: 'Hoje',
  last7: 'Últimos 7 dias',
  last30: 'Últimos 30 dias',
  mtd: 'Mês corrente',
  last_month: 'Mês passado',
  ytd: 'Ano corrente',
  all: 'Tudo',
  custom: 'Personalizado',
};

const toISO = (d: Date) => d.toISOString().slice(0, 10);

export function presetToRange(preset: PresetKey): DateRange {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endISO = toISO(today);

  switch (preset) {
    case 'today':
      return { start: endISO, end: endISO, preset };
    case 'last7': {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      return { start: toISO(d), end: endISO, preset };
    }
    case 'last30': {
      const d = new Date(today);
      d.setDate(d.getDate() - 29);
      return { start: toISO(d), end: endISO, preset };
    }
    case 'mtd': {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: toISO(d), end: endISO, preset };
    }
    case 'last_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: toISO(start), end: toISO(end), preset };
    }
    case 'ytd': {
      const d = new Date(today.getFullYear(), 0, 1);
      return { start: toISO(d), end: endISO, preset };
    }
    case 'all':
      return { start: null, end: null, preset };
    case 'custom':
      return { start: null, end: null, preset };
  }
}

/** Decodifica `?range=last30` ou `?start=2026-05-01&end=2026-05-20` em DateRange. */
export function rangeFromSearchParams(params: URLSearchParams): DateRange {
  const range = params.get('range') as PresetKey | null;
  if (range && range !== 'custom' && PRESET_LABELS[range]) {
    return presetToRange(range);
  }
  const start = params.get('start_date');
  const end = params.get('end_date');
  if (start || end) {
    return { start, end, preset: 'custom' };
  }
  return presetToRange('last30');
}

/** Aplica a faixa atual na URL (sem reload). */
export function syncRangeToURL(range: DateRange) {
  const url = new URL(window.location.href);
  url.searchParams.delete('range');
  url.searchParams.delete('start_date');
  url.searchParams.delete('end_date');
  if (range.preset !== 'custom' && range.preset !== 'last30') {
    url.searchParams.set('range', range.preset);
  } else if (range.preset === 'custom') {
    if (range.start) url.searchParams.set('start_date', range.start);
    if (range.end) url.searchParams.set('end_date', range.end);
  }
  window.history.replaceState({}, '', url.toString());
}

interface Props {
  value: DateRange;
  onChange: (next: DateRange) => void;
  /** Lista de presets exibidos. Padrao: todos exceto 'custom' (custom abre via campos). */
  presets?: PresetKey[];
}

const DEFAULT_PRESETS: PresetKey[] = [
  'today', 'last7', 'last30', 'mtd', 'last_month', 'ytd', 'all',
];

export function DateRangePicker({ value, onChange, presets = DEFAULT_PRESETS }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const handlePreset = (preset: PresetKey) => {
    onChange(presetToRange(preset));
    setOpen(false);
  };

  const handleCustomStart = (start: string) => {
    onChange({ start: start || null, end: value.end, preset: 'custom' });
  };
  const handleCustomEnd = (end: string) => {
    onChange({ start: value.start, end: end || null, preset: 'custom' });
  };

  const label =
    value.preset === 'custom' && (value.start || value.end)
      ? `${value.start || '...'} → ${value.end || 'hoje'}`
      : PRESET_LABELS[value.preset];

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-accent-gold/60 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Calendar className="w-3.5 h-3.5 text-accent-gold" />
        <span>{label}</span>
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute right-0 mt-1.5 z-30 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-3"
        >
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {presets.map(p => {
              const active = value.preset === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePreset(p)}
                  className={[
                    'px-2 py-1.5 text-xs rounded-md text-left transition-colors',
                    active
                      ? 'bg-accent-gold text-white border border-accent-gold'
                      : 'bg-gray-50 dark:bg-gray-700/40 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border border-transparent',
                  ].join(' ')}
                >
                  {PRESET_LABELS[p]}
                </button>
              );
            })}
          </div>
          <div className="border-t border-gray-100 dark:border-gray-700 pt-2.5">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1.5">
              Personalizado
            </p>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={value.preset === 'custom' && value.start ? value.start : ''}
                onChange={e => handleCustomStart(e.target.value)}
                className="flex-1 px-2 py-1 text-xs bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded text-gray-700 dark:text-gray-200"
                aria-label="Data inicial"
              />
              <span className="text-gray-400 text-xs">→</span>
              <input
                type="date"
                value={value.preset === 'custom' && value.end ? value.end : ''}
                onChange={e => handleCustomEnd(e.target.value)}
                className="flex-1 px-2 py-1 text-xs bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded text-gray-700 dark:text-gray-200"
                aria-label="Data final"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
