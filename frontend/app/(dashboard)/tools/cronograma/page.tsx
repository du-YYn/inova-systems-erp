'use client';

/**
 * F1 · Mini-simulador do Game Plan (/tools/cronograma)
 *
 * Tela de validação do motor de cronograma (doc 07 §12): formulário dos
 * parâmetros + render do GamePlan retornado por
 * POST /projects/cronograma/simular/. Comparável lado a lado com o
 * simulador HTML v34. Sem ligação com Project (a tela ligada ao Project é
 * /projects/[id]/cronograma — F5). Render compartilhado em
 * components/cronograma/GamePlanView.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { GamePlanView, type GamePlan } from '@/components/cronograma/GamePlanView';
import api, { ApiError } from '@/lib/api';

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

export default function CronogramaPage() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [plan, setPlan] = useState<GamePlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

          {plan && <GamePlanView plan={plan} />}
        </div>
      </div>
    </div>
  );
}
