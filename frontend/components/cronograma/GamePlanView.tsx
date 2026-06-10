'use client';

/**
 * v32 F5 · Render compartilhado do Game Plan.
 *
 * Extraído da mini-tela /tools/cronograma (F1) para reuso na tela
 * /projects/[id]/cronograma (F5). Recebe o GamePlan serializado pelo
 * backend (serialize_game_plan) e renderiza: resumo, barra de fases,
 * avisos, fases + sub-passos, reuniões e feriados.
 */

import { useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CalendarOff,
  ChevronRight,
  Clock,
  Users,
} from 'lucide-react';

// ─── Types (espelham serialize_game_plan) ────────────────────────────────────

export interface SubPasso {
  kind: 'bloco' | 'marco' | 'rec';
  label: string;
  data: string;
  pos: 'ini' | 'mid' | 'fim' | null;
  single: boolean;
  ws: boolean;
}

export interface Fase {
  key: string;
  label: string;
  dias: number;
  pct: number;
  cum_prev: number;
  cum_end: number;
  inicio: string;
  fim: string;
  ajustavel: boolean;
  is_dev: boolean;
  is_end: boolean;
  sub_passos: SubPasso[];
}

export interface Reuniao {
  data_natural: string;
  data_marcada: string | null;
  gap: number;
  remarcada: boolean;
}

export interface GamePlan {
  prazo_total: number;
  modo: 'uteis' | 'corridos';
  unidade: string;
  data_onboarding: string;
  entrega: string;
  entrega_base: string;
  total_gap: number;
  capped: boolean;
  avisos: string[];
  fases: Fase[];
  reunioes: { val: Reuniao; apr: Reuniao; grad: Reuniao };
  feriados: { data: string; nome: string }[];
  reupd_info: {
    base: number;
    requested: number;
    available: number;
    used: number;
    total: number;
  } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const PHASE_COLORS: Record<string, string> = {
  doc: '#C9A227',
  val: '#9286D6',
  dev: '#F0D060',
  aud: '#56B97D',
  hom: '#46B7C9',
  ent: '#D4AF37',
};

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function weekday(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return WEEKDAYS[d.getDay()];
}

// ─── Componente ──────────────────────────────────────────────────────────────

export function GamePlanView({ plan }: { plan: GamePlan }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const toggleFase = (key: string) =>
    setOpen((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));

  const isOpen = (key: string) => open[key] ?? true;

  return (
    <>
      {/* Resumo */}
      <div className="card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" aria-hidden />
              {plan.prazo_total} {plan.unidade} · início{' '}
              {fmtDate(plan.data_onboarding)} ({weekday(plan.data_onboarding)})
            </p>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-1">
              {fmtDate(plan.entrega)}
              <span className="text-base font-medium text-gray-400 ml-2">
                {weekday(plan.entrega)} · entrega
              </span>
            </p>
            {plan.total_gap > 0 && (
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                Sem remarcações seria {fmtDate(plan.entrega_base)} (+
                {plan.total_gap} {plan.unidade}).
              </p>
            )}
          </div>
        </div>

        {/* Barra de fases */}
        <div
          className="flex h-8 rounded-lg overflow-hidden mt-4"
          role="img"
          aria-label="Distribuição do prazo por fase"
        >
          {plan.fases.map((fase) => (
            <div
              key={fase.key}
              className="flex items-center justify-center text-[11px] font-bold text-gray-900/80"
              style={{
                flexGrow: fase.dias,
                flexBasis: 0,
                backgroundColor: PHASE_COLORS[fase.key],
              }}
              title={`${fase.label}: ${fase.dias} ${plan.unidade}`}
            >
              {fase.dias / plan.prazo_total >= 0.07 ? fase.dias : ''}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
          {plan.fases.map((fase) => (
            <span
              key={fase.key}
              className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"
            >
              <i
                className="w-2.5 h-2.5 rounded-sm inline-block"
                style={{ backgroundColor: PHASE_COLORS[fase.key] }}
                aria-hidden
              />
              {fase.label} · {fase.dias} {plan.unidade}
            </span>
          ))}
        </div>
      </div>

      {/* Avisos */}
      {plan.avisos.length > 0 && (
        <div className="space-y-2">
          {plan.avisos.map((aviso) => (
            <div
              key={aviso}
              role="alert"
              className="card p-4 border-amber-300/60 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-900/20 flex gap-3 text-sm text-amber-800 dark:text-amber-200"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
              {aviso}
            </div>
          ))}
        </div>
      )}

      {/* Fases + sub-passos */}
      <div className="card divide-y divide-gray-100 dark:divide-gray-700/60">
        <div className="px-5 py-3 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <CalendarDays className="w-4 h-4 text-accent-gold" aria-hidden />
          Fases e sub-passos
        </div>
        {plan.fases.map((fase) => (
          <div key={fase.key}>
            <button
              type="button"
              onClick={() => toggleFase(fase.key)}
              aria-expanded={isOpen(fase.key)}
              className="w-full px-5 py-3 flex items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
            >
              <ChevronRight
                className={`w-4 h-4 text-gray-400 transition-transform ${
                  isOpen(fase.key) ? 'rotate-90' : ''
                }`}
                aria-hidden
              />
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: PHASE_COLORS[fase.key] }}
                aria-hidden
              />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {fase.label}
                </span>
                <span className="block text-xs text-gray-400">
                  {fase.dias} {plan.unidade} · {fase.pct}%
                  {fase.ajustavel ? ' · ajustável' : ''}
                </span>
              </span>
              <span className="text-right shrink-0">
                <span className="block text-sm font-medium text-gray-700 dark:text-gray-200 tabular-nums">
                  {fmtDate(fase.inicio)} → {fmtDate(fase.fim)}
                </span>
                <span className="block text-xs text-gray-400">
                  {weekday(fase.inicio)} → {weekday(fase.fim)}
                </span>
              </span>
            </button>
            {isOpen(fase.key) && (
              <ul className="pb-3 px-5">
                {fase.sub_passos.map((sub, index) => (
                  <li
                    key={`${sub.label}-${sub.data}-${index}`}
                    className="flex items-center gap-2.5 py-1 pl-9 text-sm"
                  >
                    <span
                      className={
                        sub.kind === 'marco'
                          ? 'text-accent-gold'
                          : sub.kind === 'rec'
                            ? 'text-sky-500'
                            : 'text-gray-300 dark:text-gray-600'
                      }
                      aria-hidden
                    >
                      {sub.kind === 'marco' ? '◆' : sub.kind === 'rec' ? '↻' : '▪'}
                    </span>
                    <span className="flex-1 min-w-0 text-gray-600 dark:text-gray-300 truncate">
                      {sub.label}
                    </span>
                    {sub.ws && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300 px-1.5 py-0.5 rounded-full">
                        fim de semana
                      </span>
                    )}
                    {!sub.single && sub.pos === 'ini' && (
                      <span className="text-[10px] text-gray-400 uppercase">início</span>
                    )}
                    {!sub.single && sub.pos === 'fim' && (
                      <span className="text-[10px] text-gray-400 uppercase">fim</span>
                    )}
                    <span className="text-gray-700 dark:text-gray-200 tabular-nums shrink-0">
                      {fmtDate(sub.data)}
                      <span className="text-xs text-gray-400 ml-1.5">
                        {weekday(sub.data)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* Reuniões */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-accent-gold" aria-hidden />
          Reuniões com o cliente
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(
            [
              ['val', 'Validação da documentação'],
              ['apr', 'Apresentação e liberação'],
              ['grad', 'Graduação / subida'],
            ] as const
          ).map(([key, label]) => {
            const meeting = plan.reunioes[key];
            return (
              <div
                key={key}
                className="rounded-xl border border-gray-100 dark:border-gray-700 p-3"
              >
                <p className="text-xs text-gray-400">{label}</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5 tabular-nums">
                  {fmtDate(meeting.data_natural)}
                  <span className="text-xs font-normal text-gray-400 ml-1">
                    {weekday(meeting.data_natural)}
                  </span>
                </p>
                {meeting.remarcada ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Remarcada: +{meeting.gap} {plan.unidade}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400 mt-1">Data calculada</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Feriados */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2 mb-3">
          <CalendarOff className="w-4 h-4 text-accent-gold" aria-hidden />
          {plan.modo === 'corridos' ? 'Contagem' : 'Feriados no período (pulados)'}
        </h2>
        {plan.modo === 'corridos' ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Modo dias corridos: o prazo conta todos os dias do
            calendário, sem pular fim de semana nem feriado.
          </p>
        ) : plan.feriados.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nenhum feriado entre o onboarding e a entrega.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {plan.feriados.map((feriado) => (
              <span
                key={feriado.data}
                className="inline-flex items-center gap-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2.5 py-1 rounded-full"
              >
                <b className="tabular-nums">{fmtDate(feriado.data)}</b>
                {feriado.nome}
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
