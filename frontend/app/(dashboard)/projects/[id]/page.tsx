'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, Circle, Clock, MessageSquare, Plus,
  Target, AlertTriangle, Layers, X, ExternalLink, Github
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface Project {
  id: number; name: string; description: string; status: string; progress: number;
  customer_name: string | null; start_date: string | null; end_date: string | null;
  budget_value: string | null; budget_hours: number | null; hourly_rate: string | null;
  total_logged: number; github_repo: string | null; figma_url: string | null;
  docs_url: string | null; notes: string; manager_name: string | null; team_names: string[];
  phases: Phase[]; milestones: Milestone[];
}
interface Phase {
  id: number; name: string; description: string; order: number;
  is_completed: boolean; start_date: string | null; end_date: string | null;
  tasks_count: number; completed_tasks_count: number;
}
interface Milestone {
  id: number; name: string; description: string; due_date: string | null;
  is_completed: boolean; order: number;
}
interface Task {
  id: number; title: string; description: string; task_type: string;
  status: string; priority: string; phase: number | null;
  assigned_to_name: string | null; estimated_hours: number | null;
  logged_hours: number | null; total_hours: number; due_date: string | null;
}
interface TimeEntry {
  id: number; task_title: string | null; user_name: string;
  hours: number; description: string; date: string; is_billable: boolean;
}
interface Comment {
  id: number; user_name: string; content: string; created_at: string;
}

/* ─── Constants ─────────────────────────────────────────────────────────── */
const taskStatusCols = [
  { key: 'todo', label: 'A Fazer', color: 'bg-gray-50 border-gray-200' },
  { key: 'in_progress', label: 'Em Andamento', color: 'bg-blue-50 border-blue-200' },
  { key: 'review', label: 'Revisão', color: 'bg-yellow-50 border-yellow-200' },
  { key: 'done', label: 'Concluído', color: 'bg-green-50 border-green-200' },
];
const priorityColors: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600', medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700', urgent: 'bg-red-100 text-red-700',
};
const priorityLabels: Record<string, string> = {
  low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente',
};
const formatCurrency = (v: string | number | null) =>
  v ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v)) : '—';
const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

/* ─── Component ─────────────────────────────────────────────────────────── */
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'phases' | 'tasks' | 'hours' | 'comments'>('overview');

  // Modals
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showPhaseModal, setShowPhaseModal] = useState(false);
  const [showHoursModal, setShowHoursModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState('');
  const [savingComment, setSavingComment] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const [taskForm, setTaskForm] = useState({ title: '', description: '', task_type: 'feature', priority: 'medium', phase: '', estimated_hours: '', due_date: '' });
  const [phaseForm, setPhaseForm] = useState({ name: '', description: '', order: '1', start_date: '', end_date: '' });
  const [hoursForm, setHoursForm] = useState({ task: '', hours: '', description: '', date: today, is_billable: true });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
  const h = () => ({ 'Content-Type': 'application/json' });

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/projects/projects/${id}/`, { headers: h(), credentials: 'include' });
      if (!res.ok) { toast.error('Projeto não encontrado.'); router.push('/projects'); return; }
      setProject(await res.json());
    } catch { toast.error('Erro ao carregar projeto.'); }
  }, [id]);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/projects/tasks/?project=${id}&page_size=100`, { headers: h(), credentials: 'include' });
      if (res.ok) { const d = await res.json(); setTasks(d.results || d); }
    } catch { /* silent */ }
  }, [id]);

  const fetchTimeEntries = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/projects/time-entries/?project=${id}&page_size=100`, { headers: h(), credentials: 'include' });
      if (res.ok) { const d = await res.json(); setTimeEntries(d.results || d); }
    } catch { /* silent */ }
  }, [id]);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`${apiUrl}/projects/comments/?project=${id}&page_size=100`, { headers: h(), credentials: 'include' });
      if (res.ok) { const d = await res.json(); setComments(d.results || d); }
    } catch { /* silent */ }
  }, [id]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchProject(), fetchTasks(), fetchTimeEntries(), fetchComments()]);
      setLoading(false);
    };
    load();
  }, [fetchProject, fetchTasks, fetchTimeEntries, fetchComments]);

  const handleTogglePhase = async (phase: Phase) => {
    try {
      const res = await fetch(`${apiUrl}/projects/phases/${phase.id}/toggle_complete/`, {
        method: 'POST', headers: h(), credentials: 'include',
      });
      if (!res.ok) throw new Error();
      toast.success(phase.is_completed ? 'Fase reaberta.' : 'Fase concluída!');
      fetchProject();
    } catch { toast.error('Erro ao atualizar fase.'); }
  };

  const handleCreatePhase = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const body: Record<string, unknown> = { project: Number(id), name: phaseForm.name, order: Number(phaseForm.order) };
      if (phaseForm.description) body.description = phaseForm.description;
      if (phaseForm.start_date) body.start_date = phaseForm.start_date;
      if (phaseForm.end_date) body.end_date = phaseForm.end_date;
      const res = await fetch(`${apiUrl}/projects/phases/`, {
        method: 'POST', headers: h(), credentials: 'include', body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast.success('Fase criada!');
      setShowPhaseModal(false);
      setPhaseForm({ name: '', description: '', order: '1', start_date: '', end_date: '' });
      fetchProject();
    } catch { toast.error('Erro ao criar fase.'); }
    finally { setSaving(false); }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const body: Record<string, unknown> = {
        project: Number(id), title: taskForm.title,
        task_type: taskForm.task_type, priority: taskForm.priority,
      };
      if (taskForm.description) body.description = taskForm.description;
      if (taskForm.phase) body.phase = Number(taskForm.phase);
      if (taskForm.estimated_hours) body.estimated_hours = taskForm.estimated_hours;
      if (taskForm.due_date) body.due_date = taskForm.due_date;
      const res = await fetch(`${apiUrl}/projects/tasks/`, {
        method: 'POST', headers: h(), credentials: 'include', body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast.success('Tarefa criada!');
      setShowTaskModal(false);
      setTaskForm({ title: '', description: '', task_type: 'feature', priority: 'medium', phase: '', estimated_hours: '', due_date: '' });
      fetchTasks();
    } catch { toast.error('Erro ao criar tarefa.'); }
    finally { setSaving(false); }
  };

  const handleCompleteTask = async (task: Task) => {
    try {
      const res = await fetch(`${apiUrl}/projects/tasks/${task.id}/complete/`, {
        method: 'POST', headers: h(), credentials: 'include',
      });
      if (!res.ok) throw new Error();
      toast.success('Tarefa concluída!');
      fetchTasks(); fetchProject();
    } catch { toast.error('Erro ao concluir tarefa.'); }
  };

  const handleLogHours = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const body: Record<string, unknown> = {
        project: Number(id), hours: hoursForm.hours,
        description: hoursForm.description, date: hoursForm.date,
        is_billable: hoursForm.is_billable,
      };
      if (hoursForm.task) body.task = Number(hoursForm.task);
      const res = await fetch(`${apiUrl}/projects/time-entries/`, {
        method: 'POST', headers: h(), credentials: 'include', body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      toast.success('Horas lançadas!');
      setShowHoursModal(false);
      setHoursForm({ task: '', hours: '', description: '', date: today, is_billable: true });
      fetchTimeEntries(); fetchProject();
    } catch { toast.error('Erro ao lançar horas.'); }
    finally { setSaving(false); }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault(); if (!comment.trim()) return;
    setSavingComment(true);
    try {
      const res = await fetch(`${apiUrl}/projects/comments/`, {
        method: 'POST', headers: h(), credentials: 'include',
        body: JSON.stringify({ project: Number(id), content: comment }),
      });
      if (!res.ok) throw new Error();
      setComment('');
      fetchComments();
    } catch { toast.error('Erro ao adicionar comentário.'); }
    finally { setSavingComment(false); }
  };

  const totalHoursLogged = timeEntries.reduce((s, e) => s + e.hours, 0);
  const budgetUsed = project?.budget_hours ? (totalHoursLogged / project.budget_hours) * 100 : 0;

  const tabs = [
    { key: 'overview', label: 'Visão Geral' },
    { key: 'phases', label: `Fases (${project?.phases.length ?? 0})` },
    { key: 'tasks', label: `Tarefas (${tasks.length})` },
    { key: 'hours', label: `Horas (${totalHoursLogged.toFixed(1)}h)` },
    { key: 'comments', label: `Comentários (${comments.length})` },
  ] as const;

  if (loading) {
    return (
      <div className="p-8">
        <div className="h-8 bg-gray-200 rounded w-64 mb-6 animate-pulse" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <button onClick={() => router.push('/projects')} className="mt-1 p-1 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-text-primary">{project.name}</h1>
            <span className="px-2 py-1 bg-accent-gold/10 text-accent-gold text-sm rounded-full font-medium">
              {project.progress}% concluído
            </span>
          </div>
          {project.customer_name && (
            <p className="text-text-secondary mt-0.5">{project.customer_name}</p>
          )}
          <div className="w-full max-w-md bg-gray-200 rounded-full h-2 mt-3">
            <div className="bg-accent-gold h-2 rounded-full transition-all" style={{ width: `${project.progress}%` }} />
          </div>
        </div>
        <div className="flex gap-2">
          {project.github_repo && (
            <a href={project.github_repo} target="_blank" rel="noopener noreferrer"
              className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
              <Github className="w-4 h-4" />
            </a>
          )}
          {project.figma_url && (
            <a href={project.figma_url} target="_blank" rel="noopener noreferrer"
              className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-accent-gold text-accent-gold'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Visão Geral ── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {project.description && (
              <div className="bg-white rounded-lg border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">Descrição</h3>
                <p className="text-sm text-text-primary whitespace-pre-line">{project.description}</p>
              </div>
            )}
            <div className="bg-white rounded-lg border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">Orçamento de Horas</h3>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-text-secondary">Horas lançadas: <strong>{totalHoursLogged.toFixed(1)}h</strong></span>
                <span className="text-sm text-text-secondary">Orçado: <strong>{project.budget_hours || '—'}h</strong></span>
              </div>
              {project.budget_hours && (
                <>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className={`h-2 rounded-full transition-all ${budgetUsed > 90 ? 'bg-red-500' : budgetUsed > 70 ? 'bg-orange-400' : 'bg-accent-gold'}`}
                      style={{ width: `${Math.min(budgetUsed, 100)}%` }} />
                  </div>
                  <p className="text-xs text-text-secondary mt-1">{budgetUsed.toFixed(0)}% do orçamento utilizado</p>
                </>
              )}
            </div>
            {project.notes && (
              <div className="bg-white rounded-lg border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-2">Notas</h3>
                <p className="text-sm text-text-primary whitespace-pre-line">{project.notes}</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Detalhes</h3>
              <dl className="space-y-2 text-sm">
                {project.start_date && <div className="flex justify-between"><dt className="text-text-secondary">Início</dt><dd>{formatDate(project.start_date)}</dd></div>}
                {project.end_date && <div className="flex justify-between"><dt className="text-text-secondary">Prazo</dt><dd>{formatDate(project.end_date)}</dd></div>}
                {project.budget_value && <div className="flex justify-between"><dt className="text-text-secondary">Valor</dt><dd className="font-medium text-accent-gold">{formatCurrency(project.budget_value)}</dd></div>}
                {project.hourly_rate && <div className="flex justify-between"><dt className="text-text-secondary">Valor/h</dt><dd>{formatCurrency(project.hourly_rate)}</dd></div>}
                {project.manager_name && <div className="flex justify-between"><dt className="text-text-secondary">Gestor</dt><dd>{project.manager_name}</dd></div>}
              </dl>
            </div>
            {project.team_names.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Equipe</h3>
                <div className="space-y-2">
                  {project.team_names.map((name) => (
                    <div key={name} className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-accent-gold/20 rounded-full flex items-center justify-center text-xs font-bold text-accent-gold">
                        {name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm">{name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {project.milestones.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">Marcos</h3>
                <div className="space-y-2">
                  {project.milestones.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 text-sm">
                      {m.is_completed
                        ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                        : <Target className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      }
                      <span className={m.is_completed ? 'line-through text-text-secondary' : ''}>{m.name}</span>
                      {m.due_date && <span className="text-xs text-text-secondary ml-auto">{formatDate(m.due_date)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Fases ── */}
      {activeTab === 'phases' && (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setShowPhaseModal(true)}
              className="flex items-center gap-2 px-3 py-2 bg-accent-gold text-white text-sm rounded-lg hover:bg-accent-gold-dark transition-colors"
            >
              <Plus className="w-4 h-4" /> Nova Fase
            </button>
          </div>
          {project.phases.length === 0 ? (
            <div className="text-center py-16 text-text-secondary">
              <Layers className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Nenhuma fase criada</p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...project.phases].sort((a, b) => a.order - b.order).map((phase) => (
                <div key={phase.id} className={`bg-white rounded-lg border p-5 ${phase.is_completed ? 'border-green-200' : 'border-gray-100'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button onClick={() => handleTogglePhase(phase)} className="flex-shrink-0">
                        {phase.is_completed
                          ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                          : <Circle className="w-5 h-5 text-gray-300 hover:text-green-400 transition-colors" />
                        }
                      </button>
                      <div>
                        <p className={`font-medium ${phase.is_completed ? 'line-through text-text-secondary' : 'text-text-primary'}`}>
                          {phase.name}
                        </p>
                        {phase.description && <p className="text-sm text-text-secondary">{phase.description}</p>}
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-sm text-text-secondary">
                        {phase.completed_tasks_count}/{phase.tasks_count} tarefas
                      </p>
                      {(phase.start_date || phase.end_date) && (
                        <p className="text-xs text-text-secondary mt-0.5">
                          {formatDate(phase.start_date)} → {formatDate(phase.end_date)}
                        </p>
                      )}
                    </div>
                  </div>
                  {phase.tasks_count > 0 && (
                    <div className="mt-3 ml-8">
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className="bg-green-400 h-1.5 rounded-full transition-all"
                          style={{ width: `${phase.tasks_count > 0 ? (phase.completed_tasks_count / phase.tasks_count) * 100 : 0}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tarefas ── */}
      {activeTab === 'tasks' && (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setShowTaskModal(true)}
              className="flex items-center gap-2 px-3 py-2 bg-accent-gold text-white text-sm rounded-lg hover:bg-accent-gold-dark transition-colors"
            >
              <Plus className="w-4 h-4" /> Nova Tarefa
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {taskStatusCols.map((col) => {
              const colTasks = tasks.filter(t => t.status === col.key);
              return (
                <div key={col.key} className={`${col.color} border rounded-lg p-3`}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-text-primary">{col.label}</p>
                    <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 text-xs rounded-full">{colTasks.length}</span>
                  </div>
                  <div className="space-y-2">
                    {colTasks.length === 0 ? (
                      <p className="text-xs text-text-secondary text-center py-3">—</p>
                    ) : colTasks.map((task) => (
                      <div key={task.id} className="bg-white p-3 rounded-lg border border-gray-100 text-sm">
                        <p className="font-medium text-text-primary mb-1">{task.title}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${priorityColors[task.priority]}`}>
                            {priorityLabels[task.priority]}
                          </span>
                          {task.assigned_to_name && (
                            <span className="text-xs text-text-secondary">{task.assigned_to_name}</span>
                          )}
                        </div>
                        {task.estimated_hours && (
                          <p className="text-xs text-text-secondary mt-1">
                            {task.total_hours.toFixed(1)}h / {task.estimated_hours}h est.
                          </p>
                        )}
                        {task.status !== 'done' && (
                          <button
                            onClick={() => handleCompleteTask(task)}
                            className="mt-2 text-xs text-green-600 hover:text-green-700 font-medium"
                          >
                            ✓ Concluir
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Horas ── */}
      {activeTab === 'hours' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4 text-sm text-text-secondary">
              <span><strong className="text-text-primary">{totalHoursLogged.toFixed(1)}h</strong> lançadas</span>
              {project.budget_hours && <span>de <strong>{project.budget_hours}h</strong> orçadas</span>}
            </div>
            <button
              onClick={() => setShowHoursModal(true)}
              className="flex items-center gap-2 px-3 py-2 bg-accent-gold text-white text-sm rounded-lg hover:bg-accent-gold-dark transition-colors"
            >
              <Clock className="w-4 h-4" /> Lançar Horas
            </button>
          </div>
          {timeEntries.length === 0 ? (
            <div className="text-center py-16 text-text-secondary">
              <Clock className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Nenhuma hora lançada</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-5 py-3">Data</th>
                    <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-5 py-3">Usuário</th>
                    <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-5 py-3">Tarefa</th>
                    <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-5 py-3">Descrição</th>
                    <th className="text-right text-xs font-medium text-text-secondary uppercase tracking-wider px-5 py-3">Horas</th>
                    <th className="text-left text-xs font-medium text-text-secondary uppercase tracking-wider px-5 py-3">Faturável</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {timeEntries.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-sm text-text-secondary">{formatDate(e.date)}</td>
                      <td className="px-5 py-3 text-sm">{e.user_name}</td>
                      <td className="px-5 py-3 text-sm text-text-secondary">{e.task_title || '—'}</td>
                      <td className="px-5 py-3 text-sm">{e.description}</td>
                      <td className="px-5 py-3 text-sm font-medium text-right">{e.hours}h</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${e.is_billable ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {e.is_billable ? 'Sim' : 'Não'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Comentários ── */}
      {activeTab === 'comments' && (
        <div className="max-w-2xl">
          <form onSubmit={handleAddComment} className="mb-6">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Adicione um comentário..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold resize-none"
            />
            <div className="flex justify-end mt-2">
              <button
                type="submit" disabled={savingComment || !comment.trim()}
                className="px-4 py-2 bg-accent-gold text-white text-sm rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60"
              >
                <MessageSquare className="w-4 h-4 inline mr-1" />
                {savingComment ? 'Enviando...' : 'Comentar'}
              </button>
            </div>
          </form>
          {comments.length === 0 ? (
            <p className="text-text-secondary text-sm text-center py-8">Nenhum comentário ainda.</p>
          ) : (
            <div className="space-y-4">
              {comments.map((c) => (
                <div key={c.id} className="bg-white rounded-lg border border-gray-100 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 bg-accent-gold/20 rounded-full flex items-center justify-center text-xs font-bold text-accent-gold">
                      {c.user_name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium">{c.user_name}</span>
                    <span className="text-xs text-text-secondary ml-auto">
                      {new Date(c.created_at).toLocaleString('pt-BR')}
                    </span>
                  </div>
                  <p className="text-sm text-text-primary whitespace-pre-line">{c.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modal Nova Fase ── */}
      {showPhaseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold">Nova Fase</h2>
              <button onClick={() => setShowPhaseModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleCreatePhase} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Nome *</label>
                <input type="text" required value={phaseForm.name}
                  onChange={(e) => setPhaseForm({ ...phaseForm, name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Descrição</label>
                <input type="text" value={phaseForm.description}
                  onChange={(e) => setPhaseForm({ ...phaseForm, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Ordem</label>
                  <input type="number" min="1" value={phaseForm.order}
                    onChange={(e) => setPhaseForm({ ...phaseForm, order: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Início</label>
                  <input type="date" value={phaseForm.start_date}
                    onChange={(e) => setPhaseForm({ ...phaseForm, start_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Fim</label>
                  <input type="date" value={phaseForm.end_date}
                    onChange={(e) => setPhaseForm({ ...phaseForm, end_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
                </div>
              </div>
              <div className="flex gap-3 pt-3">
                <button type="button" onClick={() => setShowPhaseModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark disabled:opacity-60">
                  {saving ? 'Criando...' : 'Criar Fase'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Nova Tarefa ── */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold">Nova Tarefa</h2>
              <button onClick={() => setShowTaskModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Título *</label>
                <input type="text" required value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Descrição</label>
                <textarea rows={2} value={taskForm.description}
                  onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Tipo</label>
                  <select value={taskForm.task_type} onChange={(e) => setTaskForm({ ...taskForm, task_type: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold bg-white">
                    <option value="feature">Feature</option>
                    <option value="bug">Bug</option>
                    <option value="task">Tarefa</option>
                    <option value="improvement">Melhoria</option>
                    <option value="documentation">Documentação</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Prioridade</label>
                  <select value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold bg-white">
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </div>
              </div>
              {project.phases.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Fase</label>
                  <select value={taskForm.phase} onChange={(e) => setTaskForm({ ...taskForm, phase: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold bg-white">
                    <option value="">Sem fase</option>
                    {project.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Horas Est.</label>
                  <input type="number" step="0.5" value={taskForm.estimated_hours}
                    onChange={(e) => setTaskForm({ ...taskForm, estimated_hours: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Prazo</label>
                  <input type="date" value={taskForm.due_date}
                    onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
                </div>
              </div>
              <div className="flex gap-3 pt-3">
                <button type="button" onClick={() => setShowTaskModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark disabled:opacity-60">
                  {saving ? 'Criando...' : 'Criar Tarefa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Lançar Horas ── */}
      {showHoursModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold">Lançar Horas</h2>
              <button onClick={() => setShowHoursModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleLogHours} className="space-y-3">
              {tasks.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Tarefa</label>
                  <select value={hoursForm.task} onChange={(e) => setHoursForm({ ...hoursForm, task: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold bg-white">
                    <option value="">Sem tarefa específica</option>
                    {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Horas *</label>
                  <input type="number" step="0.25" min="0.25" required value={hoursForm.hours}
                    onChange={(e) => setHoursForm({ ...hoursForm, hours: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Data *</label>
                  <input type="date" required value={hoursForm.date}
                    onChange={(e) => setHoursForm({ ...hoursForm, date: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Descrição *</label>
                <input type="text" required value={hoursForm.description}
                  onChange={(e) => setHoursForm({ ...hoursForm, description: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={hoursForm.is_billable}
                  onChange={(e) => setHoursForm({ ...hoursForm, is_billable: e.target.checked })}
                  className="w-4 h-4 rounded text-accent-gold" />
                <span className="text-sm text-text-secondary">Horas faturáveis</span>
              </label>
              <div className="flex gap-3 pt-3">
                <button type="button" onClick={() => setShowHoursModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark disabled:opacity-60">
                  {saving ? 'Lançando...' : 'Lançar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
