'use client';

/**
 * F1 · Mini-simulador do Game Plan (/tools/cronograma)
 *
 * Tela de validação do motor de cronograma (doc 07 §12): formulário dos
 * parâmetros + render do GamePlan retornado por
 * POST /projects/cronograma/simular/. Comparável lado a lado com o
 * simulador HTML v34. Sem ligação com Project (vem na F5).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CalendarOff,
  ChevronRight,
  Clock,
  Loader2,
  RefreshCw,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import api, { ApiError } from '@/lib/api';

// ─── Types (espelham serialize_game_plan) ────────────────────────────────────

interface SubPasso {
  kind: 'bloco' | 'marco' | 'rec';
  label: string;
  data: string;
  pos: 'ini' | 'mid' | 'fim' | null;
  single: boolean;
  ws: boolean;
}

interface Fase {
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

interface Reuniao {
  data_natural: string;
  data_marcada: string | null;
  gap: number;
  remarcada: boolean;
}

interface GamePlan {
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

interface FormState {
  prazo_total: number;
  modo: 'uteis' | 'corridos';
  data_onboarding: string;
  pct_doc: number;
  pct_dev: number;
  pct_aud: number;
  peso_val: number;
  peso_hom: number;
  peso_ent: number;
  reupd_fds: number;
  considerar_carnaval: boolean;
  considerar_corpus: boolean;
  data_reuniao_validacao: string;
  data_reuniao_apresentacao: string;
  data_reuniao_graduacao: string;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const PHASE_COLORS: Record<string, string> = {
  doc: '#C9A227',
  val: '#9286D6',
  dev: '#F0D060',
  aud: '#56B97D',
  hom: '#46B7C9',
  ent: '#D4AF37',
};

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function todayISO(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const DEFAULT_FORM: FormState = {
  prazo_total: 45,
  modo: 'uteis',
  data_onboarding: todayISO(),
  pct_doc: 15,
  pct_dev: 50,
  pct_aud: 8,
  peso_val: 5,
  peso_hom: 17,
  peso_ent: 5,
  reupd_fds: 0,
  considerar_carnaval: true,
  considerar_corpus: true,
  data_reuniao_validacao: '',
  data_reuniao_apresentacao: '',
  data_reuniao_graduacao: '',
};

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function weekday(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return WEEKDAYS[d.getDay()];
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default function CronogramaPage() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [plan, setPlan] = useState<GamePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const requestSeq = useRef(0);

  const simulate = useCallback(async (state: FormState) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const body = {
        ...state,
        data_reuniao_validacao: state.data_reuniao_validacao || null,
        data_reuniao_apresentacao: state.data_reuniao_apresentacao || null,
        data_reuniao_graduacao: state.data_reuniao_graduacao || null,
      };
      const result = await api.post<GamePlan>('/projects/cronograma/simular/', body);
      if (seq === requestSeq.current) setPlan(result);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      if (err instanceof ApiError) {
        setError(err.message || 'Parâmetros inválidos.');
      } else {
        setError('Não foi possível simular o cronograma. Tente novamente.');
      }
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    simulate(DEFAULT_FORM);
  }, [simulate]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleFase = (key: string) =>
    setOpen((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));

  const isOpen = (key: string) => open[key] ?? true;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Simulador de Cronograma
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Game Plan do projeto: distribui o prazo nas 6 fases, data sub-passos
          e calcula a entrega. Sem efeito em projetos — só simulação.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
        {/* ── Formulário ── */}
        <form
          className="card p-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            simulate(form);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cr-prazo" className="label-input">Prazo total</label>
              <input
                id="cr-prazo"
                type="number"
                min={5}
                max={400}
                value={form.prazo_total}
                onChange={(e) => set('prazo_total', Number(e.target.value))}
                className="input-field"
              />
            </div>
            <div>
              <label htmlFor="cr-modo" className="label-input">Contagem</label>
              <select
                id="cr-modo"
                value={form.modo}
                onChange={(e) => set('modo', e.target.value as FormState['modo'])}
                className="input-field"
              >
                <option value="uteis">Dias úteis</option>
                <option value="corridos">Dias corridos</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="cr-onb" className="label-input">Onboarding (Dia 0)</label>
            <input
              id="cr-onb"
              type="date"
              value={form.data_onboarding}
              onChange={(e) => set('data_onboarding', e.target.value)}
              className="input-field"
              required
            />
          </div>

          {(
            [
              ['pct_doc', 'Documentação', 0, 40],
              ['pct_dev', 'Desenvolvimento', 20, 80],
              ['pct_aud', 'Auditoria', 0, 30],
            ] as const
          ).map(([key, label, min, max]) => (
            <div key={key}>
              <label htmlFor={`cr-${key}`} className="label-input">
                {label} · {form[key]}%
              </label>
              <input
                id={`cr-${key}`}
                type="range"
                min={min}
                max={max}
                value={form[key]}
                onChange={(e) => set(key, Number(e.target.value))}
                className="w-full accent-accent-gold"
              />
            </div>
          ))}

          <fieldset>
            <legend className="label-input">
              Pesos das fases automáticas (validação / homologação / entrega)
            </legend>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  ['peso_val', 'Validação'],
                  ['peso_hom', 'Homologação'],
                  ['peso_ent', 'Entrega'],
                ] as const
              ).map(([key, label]) => (
                <input
                  key={key}
                  type="number"
                  min={1}
                  max={60}
                  aria-label={`Peso ${label}`}
                  value={form[key]}
                  onChange={(e) => set(key, Number(e.target.value))}
                  className="input-field"
                />
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="cr-reupd" className="label-input">
              Re-update em fim de semana · {form.reupd_fds}{' '}
              {form.reupd_fds === 1 ? 'dia' : 'dias'}
            </label>
            <input
              id="cr-reupd"
              type="range"
              min={0}
              max={8}
              value={form.reupd_fds}
              onChange={(e) => set('reupd_fds', Number(e.target.value))}
              className="w-full accent-accent-gold"
              disabled={form.modo === 'corridos'}
            />
            {form.modo === 'corridos' && (
              <p className="text-xs text-gray-400 mt-1">
                Só se aplica em dias úteis.
              </p>
            )}
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={form.considerar_carnaval}
                onChange={(e) => set('considerar_carnaval', e.target.checked)}
                className="rounded accent-accent-gold"
              />
              Carnaval
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={form.considerar_corpus}
                onChange={(e) => set('considerar_corpus', e.target.checked)}
                className="rounded accent-accent-gold"
              />
              Corpus Christi
            </label>
          </div>

          <fieldset className="space-y-3 border-t border-gray-100 dark:border-gray-700 pt-4">
            <legend className="label-input flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" aria-hidden />
              Remarcação das reuniões (opcional)
            </legend>
            {(
              [
                ['data_reuniao_validacao', 'Reunião de validação'],
                ['data_reuniao_apresentacao', 'Apresentação e liberação'],
                ['data_reuniao_graduacao', 'Graduação / subida'],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label htmlFor={`cr-${key}`} className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                  {label}
                </label>
                <input
                  id={`cr-${key}`}
                  type="date"
                  value={form[key]}
                  onChange={(e) => set(key, e.target.value)}
                  className="input-field"
                />
              </div>
            ))}
          </fieldset>

          <Button type="submit" loading={loading} className="w-full">
            <RefreshCw className="w-4 h-4" aria-hidden />
            Simular
          </Button>

          {error && (
            <p role="alert" className="text-sm text-red-500">{error}</p>
          )}
        </form>

        {/* ── Resultado ── */}
        <div className="space-y-6">
          {!plan && loading && (
            <div className="card p-10 flex items-center justify-center text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" aria-hidden />
              Calculando…
            </div>
          )}

          {plan && (
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
          )}
        </div>
      </div>
    </div>
  );
}
