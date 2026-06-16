'use client';

/**
 * Card do Cliente (Produção) — doc 10 (10-producao-card-acoes.md).
 *
 * Mostra TODAS as etapas do processo de Produção (trilha/rail) + o checklist de
 * ações por etapa (modelo ProjectEtapaAction), cada ação com a DATA prevista
 * vinda do motor de cronograma (data_prevista, read-only no backend).
 *
 * Comportamento (espelha card-cliente-exemplo.html):
 *  - Dev dá check numa ação → POST etapa-actions/<id>/toggle/ → ao concluir
 *    TODAS as ações da etapa atual, o card avança sozinho (POST set-etapa).
 *  - Gates respeitados pelo backend (set-etapa valida): Validação→Jurídico
 *    (handshake) e Desenvolvimento→Regra de Ouro (contrato + entrada + baseline).
 *    O "Aprovado para Desenvolvimento" é automático quando o Jurídico libera
 *    (a baseline assinada destrava o gate da Etapa 7).
 *
 * Também: botão "Solicitar Mudança" → popup (descrição + horas + valor + anexos)
 * → POST projects/<id>/solicitar-mudanca/ (endpoint de b3) → aba
 * "Solicitações de Mudança" mostra o status (Em análise → Aprovada/Recusada).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check, Lock, Zap, Calendar, Anchor, GitPullRequestArrow, Paperclip, X,
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import FocusTrap from '@/components/ui/FocusTrap';
import api from '@/lib/api';

// ── Tipos ──────────────────────────────────────────────────────────────────
interface EtapaAction {
  id: number;
  project: number;
  etapa: string;
  ordem: number;
  texto: string;
  feito: boolean;
  feito_em: string | null;
  feito_por_name: string | null;
  data_prevista: string | null;
}

interface ChangeRequest {
  id: number;
  title: string;
  description: string;
  impact_hours: string;
  impact_value: string;
  status: string; // pending | approved | rejected | implemented
  created_by_name: string;
  created_at: string;
}

interface ProjectCardData {
  id: number;
  name: string;
  customer_name: string | null;
  etapa_atual: string;
  situacao: string;
  tipo: string;
  budget_value: string | null;
  dia_zero: string | null;
  prazo_total: number;
  modo: string;
  contrato_assinado_at: string | null;
  entrada_paga_at: string | null;
}

interface Props {
  project: ProjectCardData;
  onEtapaChanged?: () => void; // avisa o pai para recarregar o projeto
}

// ── Metadados das etapas (doc 10 — kanban principal, na ORDEM canônica) ──────
// `key` = Project.ETAPA_CHOICES (NÃO renomear — produção com dados reais).
// `label` segue o doc 10 (Planejamento, Janela de teste, Re-Update, Homologação,
// Concluído, Implementado). `meeting`/`gate`/`handshake`/`anchor`/`deferred`
// controlam os adornos visuais. `deferred` = ações ainda a definir (doc 10).
interface EtapaMeta {
  key: string;
  num: string;
  label: string;
  meeting?: boolean;
  anchor?: boolean;
  gate?: boolean;      // Etapa 7: Regra de Ouro
  handshake?: string;  // texto do handshake com o Jurídico
  deferred?: boolean;  // ações a definir (sem checklist no doc 10)
}

const ETAPAS_META: EtapaMeta[] = [
  { key: 'agendar', num: '1', label: 'Agendar', anchor: true },
  { key: 'etapa_3_preparacao', num: '2', label: 'Planejamento' },
  { key: 'etapa_4_onboarding', num: '3', label: 'Onboarding', meeting: true },
  { key: 'etapa_5_documentacao', num: '4', label: 'Documentação' },
  {
    key: 'etapa_6_validacao_doc', num: '5', label: 'Validação da doc',
    meeting: true,
    handshake:
      'Ao aprovar, a baseline vai pro Jurídico assinar. Concluir esta etapa ' +
      'destrava o gate do Desenvolvimento (Aprovado para Desenvolvimento).',
  },
  { key: 'etapa_7_desenvolvimento', num: '6', label: 'Desenvolvimento', gate: true },
  { key: 'etapa_8_auditoria', num: '7', label: 'Auditoria interna' },
  {
    key: 'etapa_9_apresentacao', num: '8', label: 'Reunião de Apresentação',
    meeting: true, deferred: true,
  },
  { key: 'homologacao', num: '9', label: 'Janela de teste' },
  { key: 'registro_entrega', num: '10', label: 'Re-Update' },
  { key: 'etapa_10_graduacao', num: '11', label: 'Homologação' },
  { key: 'implementacao', num: '12', label: 'Concluído', deferred: true },
  { key: 'recorrencia', num: '13', label: 'Implementado', deferred: true },
];

const ETAPA_ORDER = ETAPAS_META.map((e) => e.key);
const indexOfEtapa = (key: string) => ETAPA_ORDER.indexOf(key);

// Próxima etapa no trilho (bifurcação tratada pelo backend; aqui é o avanço
// linear que o card propõe ao concluir as ações da etapa atual).
function nextEtapaKey(current: string, tipo: string): string | null {
  if (current === 'registro_entrega') {
    if (tipo === 'fechado') return 'etapa_10_graduacao';
    if (tipo === 'recorrente') return 'implementacao';
    return null; // sem tipo: o backend bloqueia; não auto-avança
  }
  if (current === 'etapa_10_graduacao' || current === 'implementacao') {
    return 'recorrencia';
  }
  const i = indexOfEtapa(current);
  if (i < 0 || i >= ETAPA_ORDER.length - 1) return null;
  return ETAPA_ORDER[i + 1];
}

const crStatusLabels: Record<string, { label: string; cls: string }> = {
  pending: {
    label: 'Em análise',
    cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  },
  approved: {
    label: 'Aprovada',
    cls: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  },
  implemented: {
    label: 'Aprovada',
    cls: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  },
  rejected: {
    label: 'Recusada',
    cls: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  },
};

const formatCurrency = (v: string | number | null) =>
  v == null
    ? null
    : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));

const formatDateShort = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : null;

const formatDateFull = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

export default function ClienteCard({ project, onEtapaChanged }: Props) {
  const toast = useToast();
  const [actions, setActions] = useState<EtapaAction[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [advancing, setAdvancing] = useState(false);

  // etapa selecionada na trilha (default: a etapa atual do projeto)
  const [selectedEtapa, setSelectedEtapa] = useState<string>(project.etapa_atual);

  // aba: trilha (etapas) | solicitações de mudança
  const [tab, setTab] = useState<'trilha' | 'mudancas'>('trilha');

  // popup Solicitar Mudança
  const [showCR, setShowCR] = useState(false);
  const [crForm, setCrForm] = useState({ title: '', description: '', impact_hours: '', impact_value: '' });
  const [crFiles, setCrFiles] = useState<File[]>([]);
  const [savingCR, setSavingCR] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [actData, crData] = await Promise.all([
        api
          .get<{ results?: EtapaAction[] }>('/projects/etapa-actions/', {
            project: String(project.id),
            page_size: '300',
          })
          .catch(() => ({ results: [] })),
        api
          .get<{ results?: ChangeRequest[] }>('/projects/change-requests/', {
            project: String(project.id),
            page_size: '100',
          })
          .catch(() => ({ results: [] })),
      ]);
      setActions((actData.results || actData) as EtapaAction[]);
      setChangeRequests((crData.results || crData) as ChangeRequest[]);
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // mantém a seleção alinhada à etapa atual quando o projeto muda de fora
  useEffect(() => {
    setSelectedEtapa(project.etapa_atual);
  }, [project.etapa_atual]);

  // ações agrupadas por etapa
  const actionsByEtapa = useMemo(() => {
    const map: Record<string, EtapaAction[]> = {};
    for (const a of actions) {
      (map[a.etapa] ||= []).push(a);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((x, y) => x.ordem - y.ordem || x.id - y.id);
    }
    return map;
  }, [actions]);

  const etapaIsDone = useCallback(
    (key: string) => {
      const list = actionsByEtapa[key];
      return !!list && list.length > 0 && list.every((a) => a.feito);
    },
    [actionsByEtapa],
  );

  // gate Regra de Ouro (Etapa 7): contrato + entrada + baseline assinada.
  // A baseline (3º critério) é a conclusão da Validação da doc (Etapa 6) — quando
  // o Jurídico assina. Aproximamos pela conclusão da Etapa 6 (handshake) já que
  // o backend é a fonte da verdade que valida no set-etapa.
  const gate = useMemo(() => {
    // Se o projeto JÁ está em Desenvolvimento (ou além), o backend já validou o
    // gate na entrada — não reexibir como travado. Caso contrário, aproximamos:
    // a baseline (3º critério) é a conclusão da Validação da doc (Etapa 6).
    const pastGate = indexOfEtapa(project.etapa_atual) >= indexOfEtapa('etapa_7_desenvolvimento');
    const contrato = pastGate || !!project.contrato_assinado_at;
    const entrada = pastGate || !!project.entrada_paga_at;
    const baseline = pastGate || etapaIsDone('etapa_6_validacao_doc');
    return {
      contrato,
      entrada,
      baseline,
      all: contrato && entrada && baseline,
    };
  }, [project.contrato_assinado_at, project.entrada_paga_at, project.etapa_atual, etapaIsDone]);

  const totalActions = actions.length;
  const doneActions = actions.filter((a) => a.feito).length;
  const doneEtapas = ETAPAS_META.filter((e) => etapaIsDone(e.key)).length;
  const progressPct = Math.round((doneEtapas / ETAPAS_META.length) * 100);

  // ── seed (cria o checklist padrão do doc 10) ──────────────────────────────
  const handleSeed = async () => {
    setSeeding(true);
    try {
      await api.post('/projects/etapa-actions/seed/', { project: project.id });
      toast.success('Checklist de ações criado.');
      await fetchData();
    } catch {
      toast.error('Não foi possível criar o checklist.');
    } finally {
      setSeeding(false);
    }
  };

  // ── avanço automático da etapa quando todas as ações estão feitas ─────────
  const tryAdvanceEtapa = useCallback(
    async (etapaKey: string) => {
      // só avança a etapa ATUAL do projeto
      if (etapaKey !== project.etapa_atual) return;
      const target = nextEtapaKey(project.etapa_atual, project.tipo);
      if (!target) return;
      setAdvancing(true);
      try {
        await api.post(`/projects/projects/${project.id}/set-etapa/`, { etapa: target });
        const meta = ETAPAS_META.find((e) => e.key === target);
        toast.success(`Etapa concluída — card avançou para "${meta?.label || target}".`);
        setSelectedEtapa(target);
        onEtapaChanged?.();
      } catch (err) {
        // gate bloqueou (Regra de Ouro / handshake Jurídico) — mensagem do backend
        const detail =
          (err as { data?: { etapa?: string } })?.data?.etapa ||
          'A etapa não pôde avançar (gate não satisfeito).';
        toast.warning(detail);
      } finally {
        setAdvancing(false);
      }
    },
    [project.etapa_atual, project.tipo, project.id, onEtapaChanged, toast],
  );

  // ── toggle de uma ação ────────────────────────────────────────────────────
  const handleToggle = async (action: EtapaAction) => {
    setTogglingId(action.id);
    // otimista
    setActions((prev) =>
      prev.map((a) => (a.id === action.id ? { ...a, feito: !a.feito } : a)),
    );
    try {
      const updated = await api.post<EtapaAction>(
        `/projects/etapa-actions/${action.id}/toggle/`,
        {},
      );
      setActions((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));

      // se a etapa ficou completa, tenta avançar o card
      const list = (actionsByEtapa[action.etapa] || []).map((a) =>
        a.id === updated.id ? updated : a,
      );
      if (list.length > 0 && list.every((a) => a.feito)) {
        await tryAdvanceEtapa(action.etapa);
      }
    } catch {
      // reverte o otimista
      setActions((prev) =>
        prev.map((a) => (a.id === action.id ? { ...a, feito: action.feito } : a)),
      );
      toast.error('Não foi possível atualizar a ação.');
    } finally {
      setTogglingId(null);
    }
  };

  // ── Solicitar Mudança ─────────────────────────────────────────────────────
  const submitCR = async () => {
    if (!crForm.title.trim() || !crForm.description.trim()) {
      toast.error('Informe um título e a descrição da mudança.');
      return;
    }
    setSavingCR(true);
    try {
      await api.post(`/projects/projects/${project.id}/solicitar-mudanca/`, {
        title: crForm.title.trim(),
        description: crForm.description.trim(),
        impact_hours: crForm.impact_hours || 0,
        impact_value: crForm.impact_value || 0,
        // anexos: nomes registrados na descrição (upload binário fica para a
        // fase de anexos do Aditivo no Jurídico — não há endpoint de upload aqui)
        attachments: crFiles.map((f) => f.name),
      });
      toast.success('Solicitação de Mudança enviada ao Jurídico.');
      setShowCR(false);
      setCrForm({ title: '', description: '', impact_hours: '', impact_value: '' });
      setCrFiles([]);
      setTab('mudancas');
      await fetchData();
    } catch {
      toast.error('Não foi possível abrir a Solicitação de Mudança.');
    } finally {
      setSavingCR(false);
    }
  };

  const selectedMeta = ETAPAS_META.find((e) => e.key === selectedEtapa);
  const selectedActions = actionsByEtapa[selectedEtapa] || [];
  const curIndex = indexOfEtapa(project.etapa_atual);

  // estado visual de cada etapa na trilha
  const etapaState = (meta: EtapaMeta): 'done' | 'current' | 'locked' | 'todo' => {
    if (etapaIsDone(meta.key)) return 'done';
    if (meta.gate && !gate.all) return 'locked';
    if (meta.key === project.etapa_atual) return 'current';
    return 'todo';
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Cabeçalho do card */}
      <div className="flex items-center gap-4 px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-b from-accent-gold/5 to-transparent">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-gold to-accent-gold-light flex items-center justify-center text-white font-bold text-base shrink-0">
          {initials(project.customer_name || project.name)}
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 truncate">
            {project.customer_name || project.name}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{project.name}</p>
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {project.tipo && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent-gold/10 text-accent-gold border border-accent-gold/30">
                {project.tipo === 'fechado' ? 'Fechado' : 'Recorrente'}
              </span>
            )}
            {project.situacao === 'ativo' && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
                ● Ativo
              </span>
            )}
            {formatCurrency(project.budget_value) && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                {formatCurrency(project.budget_value)}
              </span>
            )}
          </div>
        </div>
        <div className="ml-auto text-right shrink-0">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Dia 0 (Onboarding)
          </p>
          <p className="text-sm font-semibold text-accent-gold">
            {project.dia_zero ? formatDateFull(project.dia_zero) : 'a definir'}
          </p>
          <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mt-1">
            Prazo
          </p>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {project.prazo_total} dias {project.modo === 'uteis' ? 'úteis' : 'corridos'}
          </p>
        </div>
        <button
          onClick={() => {
            setCrForm({ title: '', description: '', impact_hours: '', impact_value: '' });
            setCrFiles([]);
            setShowCR(true);
          }}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors shrink-0"
        >
          <GitPullRequestArrow className="w-4 h-4" aria-hidden />
          Solicitar Mudança
        </button>
      </div>

      {/* Progresso */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[140px]">
          Etapas: <b className="text-gray-800 dark:text-gray-100">{doneEtapas}</b>/{ETAPAS_META.length}
          {' · '}ações <b className="text-gray-800 dark:text-gray-100">{doneActions}/{totalActions}</b>
        </span>
        <div className="flex-1 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-accent-gold to-accent-gold-light transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Abas internas */}
      <div className="flex gap-1 px-5 pt-3">
        <button
          onClick={() => setTab('trilha')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            tab === 'trilha'
              ? 'bg-accent-gold text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          Trilha de etapas
        </button>
        <button
          onClick={() => setTab('mudancas')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            tab === 'mudancas'
              ? 'bg-accent-gold text-white'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
        >
          Solicitações de Mudança ({changeRequests.length})
        </button>
      </div>

      {loading ? (
        <div className="p-5">
          <div className="h-64 rounded-xl bg-gray-100 dark:bg-gray-700/50 animate-pulse" />
        </div>
      ) : tab === 'trilha' ? (
        totalActions === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Este projeto ainda não tem o checklist de ações do processo.
            </p>
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="px-4 py-2 text-sm bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60"
            >
              {seeding ? 'Criando…' : 'Criar checklist de ações (doc 10)'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] min-h-[420px]">
            {/* Trilha (rail) */}
            <div className="border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700 p-3 overflow-y-auto max-h-[560px]">
              {ETAPAS_META.map((meta) => {
                const st = etapaState(meta);
                const list = actionsByEtapa[meta.key] || [];
                const isSel = meta.key === selectedEtapa;
                return (
                  <button
                    key={meta.key}
                    onClick={() => setSelectedEtapa(meta.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      isSel
                        ? 'bg-accent-gold/10 border border-accent-gold/30'
                        : 'border border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border-2 shrink-0 ${
                        st === 'done'
                          ? 'bg-green-500 border-green-500 text-white'
                          : st === 'current'
                            ? 'bg-accent-gold border-accent-gold text-white'
                            : st === 'locked'
                              ? 'border-red-400 text-red-500'
                              : 'border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500'
                      }`}
                    >
                      {st === 'done' ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : st === 'locked' ? (
                        <Lock className="w-3 h-3" />
                      ) : (
                        meta.num
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-gray-800 dark:text-gray-100 leading-tight flex items-center gap-1">
                        {meta.meeting && <Calendar className="w-3 h-3 text-gray-400" aria-hidden />}
                        {meta.label}
                      </span>
                    </span>
                    {list.length > 0 && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
                        {list.filter((a) => a.feito).length}/{list.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Detalhe da etapa selecionada */}
            <div className="p-5 overflow-y-auto max-h-[560px]">
              <h4 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                {selectedMeta?.meeting && <Calendar className="w-4 h-4 text-accent-gold" aria-hidden />}
                {selectedMeta?.anchor && <Anchor className="w-4 h-4 text-accent-gold" aria-hidden />}
                {selectedMeta?.label}
              </h4>

              {/* Gate Regra de Ouro (Etapa 7) */}
              {selectedMeta?.gate && (
                <div className="mt-3 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3">
                  <p className="text-xs font-semibold text-red-700 dark:text-red-300 flex items-center gap-1.5 mb-2">
                    <Lock className="w-3.5 h-3.5" /> Gate Regra de Ouro — Dev só começa com os 3 critérios
                  </p>
                  {[
                    { ok: gate.contrato, label: 'Contrato assinado' },
                    { ok: gate.entrada, label: 'Entrada paga' },
                    { ok: gate.baseline, label: 'Documentação (baseline) assinada pelo Jurídico' },
                  ].map((c) => (
                    <div
                      key={c.label}
                      className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200 py-0.5"
                    >
                      <span
                        className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                          c.ok
                            ? 'bg-green-500 text-white'
                            : 'bg-red-200 dark:bg-red-900/50 text-red-600 dark:text-red-300'
                        }`}
                      >
                        {c.ok ? '✓' : '✗'}
                      </span>
                      {c.label}
                    </div>
                  ))}
                  {!gate.all && (
                    <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">
                      Conclua a etapa <b>Validação da doc</b> (e confirme contrato + entrada) para
                      liberar o Desenvolvimento.
                    </p>
                  )}
                </div>
              )}

              {/* Handshake Jurídico */}
              {selectedMeta?.handshake && (
                <div className="mt-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5 mb-1">
                    <Zap className="w-3.5 h-3.5" /> Handshake com o Jurídico
                  </p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-200">{selectedMeta.handshake}</p>
                </div>
              )}

              {/* Checklist de ações */}
              {selectedMeta?.deferred && selectedActions.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  Ações desta etapa ainda a definir com o time.
                </div>
              ) : selectedActions.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  Nenhuma ação cadastrada para esta etapa.
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {selectedActions.map((a) => {
                    const blocked = !!selectedMeta?.gate && !gate.all && !a.feito;
                    return (
                      <button
                        key={a.id}
                        disabled={togglingId === a.id || advancing}
                        onClick={() => {
                          if (blocked) {
                            toast.warning('Trava: conclua a Validação da doc primeiro.');
                            return;
                          }
                          handleToggle(a);
                        }}
                        className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors disabled:opacity-60 ${
                          a.feito
                            ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-accent-gold/40'
                        }`}
                      >
                        <span
                          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                            a.feito
                              ? 'bg-green-500 border-green-500'
                              : 'border-gray-300 dark:border-gray-600'
                          }`}
                        >
                          {a.feito && <Check className="w-3 h-3 text-white" />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span
                            className={`block text-[13px] leading-snug ${
                              a.feito
                                ? 'text-gray-400 dark:text-gray-500 line-through'
                                : 'text-gray-800 dark:text-gray-100'
                            }`}
                          >
                            {a.texto}
                          </span>
                          {a.feito && a.feito_por_name && (
                            <span className="block text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                              por {a.feito_por_name}
                            </span>
                          )}
                        </span>
                        {a.data_prevista && (
                          <span className="text-[10px] font-medium text-accent-gold bg-accent-gold/10 border border-accent-gold/20 px-2 py-0.5 rounded shrink-0 whitespace-nowrap">
                            {formatDateShort(a.data_prevista)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {etapaIsDone(selectedEtapa) && (
                    <div className="rounded-xl border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs font-medium px-3 py-2.5 flex items-center gap-2">
                      <Check className="w-4 h-4" /> Etapa concluída — o card avança sozinho para a próxima.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      ) : (
        // Aba: Solicitações de Mudança
        <div className="p-5 space-y-3">
          {changeRequests.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Nenhuma Solicitação de Mudança aberta. Use o botão{' '}
              <b>Solicitar Mudança</b> no topo do card.
            </div>
          ) : (
            changeRequests.map((cr) => {
              const st = crStatusLabels[cr.status] || crStatusLabels.pending;
              return (
                <div
                  key={cr.id}
                  className="rounded-xl border border-gray-200 dark:border-gray-700 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="font-medium text-gray-800 dark:text-gray-100">{cr.title}</h4>
                      {cr.description && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 whitespace-pre-wrap">
                          {cr.description}
                        </p>
                      )}
                      <div className="flex gap-4 text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                        <span>+{cr.impact_hours}h</span>
                        <span>+{formatCurrency(cr.impact_value)}</span>
                        {cr.created_by_name && <span>por {cr.created_by_name}</span>}
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 text-xs font-medium rounded-full shrink-0 ${st.cls}`}
                    >
                      {st.label}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Popup: Solicitar Mudança (doc 10 §B) */}
      {showCR && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <FocusTrap onClose={() => setShowCR(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl">
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                <h2 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                  <GitPullRequestArrow className="w-5 h-5 text-violet-600" aria-hidden />
                  Solicitar Mudança
                </h2>
                <button onClick={() => setShowCR(false)} aria-label="Fechar">
                  <X className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Abre a solicitação (Aditivo) e envia ao Jurídico. O projeto continua em
                  Desenvolvimento; o status aparece na aba “Solicitações de Mudança”.
                </p>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Título *</label>
                  <input
                    className="input-field mt-1"
                    value={crForm.title}
                    onChange={(e) => setCrForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                    Descrição da mudança *
                  </label>
                  <textarea
                    rows={3}
                    className="input-field mt-1"
                    value={crForm.description}
                    onChange={(e) => setCrForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                      Horas estimadas
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      className="input-field mt-1"
                      value={crForm.impact_hours}
                      onChange={(e) => setCrForm((f) => ({ ...f, impact_hours: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                      Valor (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="input-field mt-1"
                      value={crForm.impact_value}
                      onChange={(e) => setCrForm((f) => ({ ...f, impact_value: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" aria-hidden /> Anexos
                  </label>
                  <input
                    type="file"
                    multiple
                    className="mt-1 block w-full text-xs text-gray-600 dark:text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-accent-gold/10 file:text-accent-gold hover:file:bg-accent-gold/20"
                    onChange={(e) => setCrFiles(Array.from(e.target.files || []))}
                  />
                  {crFiles.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {crFiles.map((f) => (
                        <li
                          key={f.name}
                          className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5"
                        >
                          <Paperclip className="w-3 h-3" aria-hidden /> {f.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end">
                <button
                  onClick={() => setShowCR(false)}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  onClick={submitCR}
                  disabled={savingCR}
                  className="px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-60"
                >
                  {savingCR ? 'Enviando…' : 'Enviar ao Jurídico'}
                </button>
              </div>
            </div>
          </FocusTrap>
        </div>
      )}
    </div>
  );
}
