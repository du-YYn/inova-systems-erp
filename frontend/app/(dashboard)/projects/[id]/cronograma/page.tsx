'use client';

/**
 * v32 F5 · Game Plan do projeto (/projects/[id]/cronograma)
 *
 * Form dos parâmetros (persistidos no Project via PATCH) + geração do
 * cronograma persistente (POST /projects/{id}/cronograma/ → ScheduleVersion
 * + 6 ProjectPhase datadas) + histórico de versões. Render do plano
 * compartilhado com /tools/cronograma (GamePlanView).
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, CalendarDays, History, Loader2, Sparkles, Users,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { GamePlanView, fmtDate, type GamePlan } from '@/components/cronograma/GamePlanView';
import api, { ApiError } from '@/lib/api';

interface ProjectData {
  id: number;
  name: string;
  customer_name: string | null;
  etapa_atual: string;
  dia_zero: string | null;
  prazo_total: number;
  modo: 'uteis' | 'corridos';
  pct_doc: number;
  pct_dev: number;
  pct_aud: number;
  peso_val: number;
  peso_hom: number;
  peso_ent: number;
  reupd_fds: number;
  considerar_carnaval: boolean;
  considerar_corpus: boolean;
  data_reuniao_validacao: string | null;
  data_reuniao_apresentacao: string | null;
  data_reuniao_graduacao: string | null;
}

interface ScheduleVersionData {
  id: number;
  project: number;
  params: Record<string, unknown> & { data_onboarding?: string };
  game_plan: GamePlan;
  created_by_name: string | null;
  created_at: string;
}

interface FormState {
  prazo_total: number;
  modo: 'uteis' | 'corridos';
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

const formFromProject = (p: ProjectData): FormState => ({
  prazo_total: p.prazo_total,
  modo: p.modo,
  pct_doc: p.pct_doc,
  pct_dev: p.pct_dev,
  pct_aud: p.pct_aud,
  peso_val: p.peso_val,
  peso_hom: p.peso_hom,
  peso_ent: p.peso_ent,
  reupd_fds: p.reupd_fds,
  considerar_carnaval: p.considerar_carnaval,
  considerar_corpus: p.considerar_corpus,
  data_reuniao_validacao: p.data_reuniao_validacao || '',
  data_reuniao_apresentacao: p.data_reuniao_apresentacao || '',
  data_reuniao_graduacao: p.data_reuniao_graduacao || '',
});

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

export default function ProjectCronogramaPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectData | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [dataOnboarding, setDataOnboarding] = useState('');
  const [versions, setVersions] = useState<ScheduleVersionData[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<ScheduleVersionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [projectData, versionsData] = await Promise.all([
        api.get<ProjectData>(`/projects/projects/${projectId}/`),
        api.get<ScheduleVersionData[]>(`/projects/projects/${projectId}/cronograma/`),
      ]);
      setProject(projectData);
      setForm(formFromProject(projectData));
      if (projectData.dia_zero) setDataOnboarding(projectData.dia_zero);
      const list = Array.isArray(versionsData) ? versionsData : [];
      setVersions(list);
      setSelectedVersion(list[0] ?? null);
    } catch {
      toast.error('Erro ao carregar o cronograma do projeto.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !project) return;
    setGenerating(true);
    setError(null);
    try {
      // 1) Persiste os parâmetros no Project (fonte da verdade do motor)
      await api.patch(`/projects/projects/${project.id}/`, {
        ...form,
        data_reuniao_validacao: form.data_reuniao_validacao || null,
        data_reuniao_apresentacao: form.data_reuniao_apresentacao || null,
        data_reuniao_graduacao: form.data_reuniao_graduacao || null,
      });
      // 2) Gera + persiste ScheduleVersion e ProjectPhases
      const body: Record<string, unknown> = {};
      if (!project.dia_zero && dataOnboarding) body.data_onboarding = dataOnboarding;
      await api.post(`/projects/projects/${project.id}/cronograma/`, body);
      toast.success('Cronograma gerado e fases do projeto atualizadas!');
      await fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as Record<string, unknown> | null;
        const detail =
          (data && typeof data.error === 'string' && data.error) ||
          err.message || 'Não foi possível gerar o cronograma.';
        setError(detail);
      } else {
        setError('Não foi possível gerar o cronograma. Tente novamente.');
      }
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="card p-10 flex items-center justify-center text-gray-400 max-w-3xl mx-auto mt-10">
        <Loader2 className="w-6 h-6 animate-spin mr-2" aria-hidden />
        Carregando cronograma…
      </div>
    );
  }

  if (!project || !form) {
    return (
      <div className="card p-10 text-center text-gray-500 max-w-3xl mx-auto mt-10">
        Projeto não encontrado.
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button
            onClick={() => router.push(`/projects/${project.id}`)}
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-accent-gold transition-colors mb-2"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden />
            Voltar ao projeto
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-accent-gold" aria-hidden />
            Game Plan · {project.name}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {project.dia_zero
              ? `Dia 0: ${fmtDate(project.dia_zero)}`
              : 'Dia 0 ainda não definido (Etapa 4) — informe a data do onboarding para simular.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
        {/* ── Parâmetros ── */}
        <div className="space-y-6">
          <form className="card p-5 space-y-4" onSubmit={handleGenerate}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pc-prazo" className="label-input">Prazo total</label>
                <input
                  id="pc-prazo"
                  type="number"
                  min={5}
                  max={400}
                  value={form.prazo_total}
                  onChange={(e) => set('prazo_total', Number(e.target.value))}
                  className="input-field"
                />
              </div>
              <div>
                <label htmlFor="pc-modo" className="label-input">Contagem</label>
                <select
                  id="pc-modo"
                  value={form.modo}
                  onChange={(e) => set('modo', e.target.value as FormState['modo'])}
                  className="input-field"
                >
                  <option value="uteis">Dias úteis</option>
                  <option value="corridos">Dias corridos</option>
                </select>
              </div>
            </div>

            {!project.dia_zero && (
              <div>
                <label htmlFor="pc-onb" className="label-input">Onboarding (Dia 0)</label>
                <input
                  id="pc-onb"
                  type="date"
                  value={dataOnboarding}
                  onChange={(e) => setDataOnboarding(e.target.value)}
                  className="input-field"
                  required
                />
              </div>
            )}

            {(
              [
                ['pct_doc', 'Documentação', 0, 40],
                ['pct_dev', 'Desenvolvimento', 20, 80],
                ['pct_aud', 'Auditoria', 0, 30],
              ] as const
            ).map(([key, label, min, max]) => (
              <div key={key}>
                <label htmlFor={`pc-${key}`} className="label-input">
                  {label} · {form[key]}%
                </label>
                <input
                  id={`pc-${key}`}
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
                Pesos (validação / homologação / entrega)
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
              <label htmlFor="pc-reupd" className="label-input">
                Re-update em fim de semana · {form.reupd_fds}{' '}
                {form.reupd_fds === 1 ? 'dia' : 'dias'}
              </label>
              <input
                id="pc-reupd"
                type="range"
                min={0}
                max={8}
                value={form.reupd_fds}
                onChange={(e) => set('reupd_fds', Number(e.target.value))}
                className="w-full accent-accent-gold"
                disabled={form.modo === 'corridos'}
              />
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
                  <label htmlFor={`pc-${key}`} className="text-xs text-gray-500 dark:text-gray-400 block mb-1">
                    {label}
                  </label>
                  <input
                    id={`pc-${key}`}
                    type="date"
                    value={form[key]}
                    onChange={(e) => set(key, e.target.value)}
                    className="input-field"
                  />
                </div>
              ))}
            </fieldset>

            <Button type="submit" loading={generating} className="w-full">
              <Sparkles className="w-4 h-4" aria-hidden />
              Salvar parâmetros e gerar cronograma
            </Button>
            <p className="text-xs text-gray-400">
              Gera uma nova versão do Game Plan e atualiza as 6 fases datadas
              do projeto.
            </p>

            {error && (
              <p role="alert" className="text-sm text-red-500">{error}</p>
            )}
          </form>

          {/* ── Histórico de versões ── */}
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-accent-gold" aria-hidden />
              Histórico de versões ({versions.length})
            </h2>
            {versions.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Nenhum cronograma gerado ainda.
              </p>
            ) : (
              <ul className="space-y-2">
                {versions.map((version, index) => (
                  <li key={version.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedVersion(version)}
                      aria-pressed={selectedVersion?.id === version.id}
                      className={`w-full text-left rounded-lg border p-3 transition-colors ${
                        selectedVersion?.id === version.id
                          ? 'border-accent-gold bg-accent-gold/5'
                          : 'border-gray-100 dark:border-gray-700 hover:border-accent-gold/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          v{versions.length - index}
                          {index === 0 && (
                            <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent-gold">
                              atual
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-gray-400 tabular-nums">
                          {fmtDateTime(version.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Entrega {fmtDate(version.game_plan.entrega)} ·{' '}
                        {version.game_plan.prazo_total} {version.game_plan.unidade}
                        {version.created_by_name ? ` · ${version.created_by_name}` : ''}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ── Plano selecionado ── */}
        <div className="space-y-6">
          {selectedVersion ? (
            <GamePlanView plan={selectedVersion.game_plan} />
          ) : (
            <div className="card p-10 text-center text-gray-500 dark:text-gray-400">
              Nenhuma versão gerada — preencha os parâmetros e clique em
              &quot;Salvar parâmetros e gerar cronograma&quot;.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
