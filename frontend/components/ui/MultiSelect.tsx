'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Selecionar...',
  className = '',
  disabled = false,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const toggle = (optionValue: string) => {
    if (value.includes(optionValue)) {
      onChange(value.filter((v) => v !== optionValue));
    } else {
      onChange([...value, optionValue]);
    }
  };

  const remove = (optionValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter((v) => v !== optionValue));
  };

  const selectedOptions = options.filter((o) => value.includes(o.value));

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={`input-field w-full flex items-center gap-1.5 flex-wrap min-h-[38px] text-left bg-white dark:bg-gray-800 pr-8 ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        }`}
      >
        {selectedOptions.length === 0 ? (
          <span className="text-gray-400 dark:text-gray-500 text-sm">{placeholder}</span>
        ) : (
          selectedOptions.map((opt) => (
            <span
              key={opt.value}
              className="inline-flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-medium px-2 py-0.5 rounded-full"
            >
              {opt.label}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => remove(opt.value, e)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(value.filter(v => v !== opt.value)); } }}
                className="hover:text-indigo-900 dark:hover:text-indigo-100 cursor-pointer rounded-full"
                aria-label={`Remover ${opt.label}`}
              >
                <X className="w-3 h-3" />
              </span>
            </span>
          ))
        )}
        {/* Chevron */}
        <ChevronDown
          className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transition-transform duration-150 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1 max-h-60 overflow-y-auto">
          {options.map((opt) => {
            const selected = value.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                  selected
                    ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                {/* Checkbox visual */}
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                    selected
                      ? 'bg-indigo-600 border-indigo-600'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                >
                  {selected && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 10">
                      <path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
