'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, BarChart2, Clock, CheckCircle2, AlertTriangle,
  Plus, Edit2, Trash2, Timer, GitBranch, Layers, RefreshCw,
  Circle, PlayCircle, Eye, ChevronRight, X, Users, Calendar,
  DollarSign, TrendingUp, Server, Zap
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import FocusTrap from '@/components/ui/FocusTrap';
import api from '@/lib/api';
import { Sensitive } from '@/components/ui/Sensitive';
import { useDemoMode } from '@/components/ui/DemoContext';

// Types
interface Project {
  id: number; name: string; description: string; customer_name: string | null;
  status: string; progress: number; start_date: string; end_date: string | null;
  deadline: string | null; budget_value: string; budget_hours: string;
  hourly_rate: string; project_type: string; billing_type: string;
  manager_name: string | null; team_names: string[]; github_repo: string;
  figma_url: string; docs_url: string; notes: string; total_hours: string;
  total_logged: string;
}

interface Task {
  id: number; title: string; description: string; task_type: string;
  status: string; priority: string; estimated_hours: string; logged_hours: string;
  due_date: string | null; assigned_to_name: string | null; phase: number | null;
  sprint: number | null;
}

interface TimeEntry {
  id: number; user_name: string; hours: string; description: string;
  date: string; is_billable: boolean; task_title: string | null; project_name: string;
}

interface Phase {
  id: number; name: string; description: string; order: number;
  is_completed: boolean; start_date: string | null; end_date: string | null;
  tasks_count: number; completed_tasks_count: number;
}

interface Milestone {
  id: number; name: string; description: string; due_date: string;
  is_completed: boolean; order: number;
}

interface Sprint {
  id: number; name: string; goal: string; start_date: string;
  end_date: string; status: string; tasks_count: number; completed_tasks: number;
}

interface ChangeRequest {
  id: number; title: string; description: string; impact_hours: string;
  impact_value: string; status: string; created_by_name: string; created_at: string;
}

interface Environment {
  id: number; name: string; url: string; current_version: string;
  last_deploy_at: string | null; status: string; last_deploy_by_name: string | null;
}

interface Profitability {
  revenue: number; labor_cost: number; direct_expenses: number;
  total_cost: number; gross_margin: number; margin_pct: number;
  total_hours: number; billable_hours: number; budget_value: number;
  budget_hours: number; budget_variance: number;
}

const statusColors: Record<string, string> = {
  planning: 'bg-gray-100 dark:bg-gray-700 text-gray-700',
  kickoff: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700',
  requirements: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700',
  development: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700',
  testing: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700',
  deployment: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700',
  completed: 'bg-green-100 dark:bg-green-900/40 text-green-700',
  on_hold: 'bg-red-100 dark:bg-red-900/40 text-red-700',
  cancelled: 'bg-gray-200 dark:bg-gray-600 text-gray-500',
};

const priorityColors: Record<string, string> = {
  low: 'bg-gray-100 dark:bg-gray-700 text-gray-600',
  medium: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700',
  high: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700',
  urgent: 'bg-red-100 dark:bg-red-900/40 text-red-700',
};

const taskTypeColors: Record<string, string> = {
  task: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600',
  bug: 'bg-red-50 dark:bg-red-900/30 text-red-600',
  feature: 'bg-green-50 dark:bg-green-900/30 text-green-600',
  research: 'bg-purple-50 dark:bg-purple-900/30 text-purple-600',
  meeting: 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600',
};

const formatCurrency = (v: number | string) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v));

const formatDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '-';

export default function ProjectDetailPage() {
  const { isDemoMode } = useDemoMode();
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [profitability, setProfitability] = useState<Profitability | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  // Task modal state
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskForm, setTaskForm] = useState({
    title: '', description: '', task_type: 'task', priority: 'medium',
    estimated_hours: '', due_date: '', status: 'todo',
  });

  // Time entry modal
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [timeForm, setTimeForm] = useState({
    hours: '', description: '', date: new Date().toISOString().split('T')[0], is_billable: true, task: '',
  });

  // Change request modal
  const [showCRModal, setShowCRModal] = useState(false);
  const [crForm, setCrForm] = useState({ title: '', description: '', impact_hours: '', impact_value: '' });

  const [confirmDelete, setConfirmDelete] = useState<{ open: boolean; taskId: number | null }>({ open: false, taskId: null });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const pid = projectId;
      const [projData, tasksData, entriesData, phasesData, milestonesData, sprintsData, crData, envData] = await Promise.all([
        api.get<Project>(`/projects/projects/${pid}/`).catch(() => null),
        api.get<{ results?: Task[] }>('/projects/tasks/', { project: pid, page_size: '200' }).catch(() => ({ results: [] })),
        api.get<{ results?: TimeEntry[] }>('/projects/time-entries/', { project: pid, page_size: '100' }).catch(() => ({ results: [] })),
        api.get<{ results?: Phase[] }>('/projects/phases/', { project: pid }).catch(() => ({ results: [] })),
        api.get<{ results?: Milestone[] }>('/projects/milestones/', { project: pid }).catch(() => ({ results: [] })),
        api.get<{ results?: Sprint[] }>('/projects/sprints/', { project: pid }).catch(() => ({ results: [] })),
        api.get<{ results?: ChangeRequest[] }>('/projects/change-requests/', { project: pid }).catch(() => ({ results: [] })),
        api.get<{ results?: Environment[] }>('/projects/environments/', { project: pid }).catch(() => ({ results: [] })),
      ]);

      if (projData) setProject(projData);
      setTasks((tasksData.results || tasksData) as Task[]);
      setTimeEntries((entriesData.results || entriesData) as TimeEntry[]);
      setPhases((phasesData.results || phasesData) as Phase[]);
      setMilestones((milestonesData.results || milestonesData) as Milestone[]);
      setSprints((sprintsData.results || sprintsData) as Sprint[]);
      setChangeRequests((crData.results || crData) as ChangeRequest[]);
      setEnvironments((envData.results || envData) as Environment[]);
    } catch {
      toast.error('Erro ao carregar dados do projeto');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchProfitability = useCallback(async () => {
    try {
      const data = await api.get<Profitability>(`/projects/projects/${projectId}/profitability/`);
      setProfitability(data);
    } catch { /* silent */ }
  }, [projectId]);

  useEffect(() => {
    fetchAll();
    fetchProfitability();
  }, [fetchAll, fetchProfitability]);

  const openTaskModal = (task?: Task) => {
    if (task) {
      setEditingTask(task);
      setTaskForm({
        title: task.title, description: task.description, task_type: task.task_type,
        priority: task.priority, estimated_hours: task.estimated_hours, due_date: task.due_date || '',
        status: task.status,
      });
    } else {
      setEditingTask(null);
      setTaskForm({ title: '', description: '', task_type: 'task', priority: 'medium', estimated_hours: '', due_date: '', status: 'todo' });
    }
    setShowTaskModal(true);
  };

  const saveTask = async () => {
    if (!taskForm.title.trim()) { toast.error('Título obrigatório'); return; }
    const body = { ...taskForm, project: Number(projectId), estimated_hours: taskForm.estimated_hours || '0' };
    try {
      if (editingTask) {
        await api.patch(`/projects/tasks/${editingTask.id}/`, body);
      } else {
        await api.post('/projects/tasks/', body);
      }
      toast.success(editingTask ? 'Tarefa atualizada' : 'Tarefa criada');
      setShowTaskModal(false);
      fetchAll();
    } catch {
      toast.error('Erro ao salvar tarefa');
    }
  };

  const deleteTask = async (id: number) => {
    try {
      await api.delete(`/projects/tasks/${id}/`);
      toast.success('Tarefa removida'); fetchAll();
    } catch { toast.error('Erro ao remover'); }
    setConfirmDelete({ open: false, taskId: null });
  };

  const completeTask = async (id: number) => {
    try { await api.post(`/projects/tasks/${id}/complete/`); } catch { /* silent */ }
    fetchAll();
  };

  const saveTimeEntry = async () => {
    if (!timeForm.hours || Number(timeForm.hours) <= 0) { toast.error('Informe as horas'); return; }
    const body = { ...timeForm, project: Number(projectId), task: timeForm.task ? Number(timeForm.task) : null };
    try {
      await api.post('/projects/time-entries/', body);
      toast.success('Horas apontadas!'); setShowTimeModal(false); fetchAll();
    } catch { toast.error('Erro ao apontar horas'); }
  };

  const saveChangeRequest = async () => {
    if (!crForm.title.trim()) { toast.error('Título obrigatório'); return; }
    const body = { ...crForm, project: Number(projectId) };
    try {
      await api.post('/projects/change-requests/', body);
      toast.success('Change request criado'); setShowCRModal(false); fetchAll();
    } catch { toast.error('Erro ao criar change request'); }
  };

  const updateTaskStatus = async (taskId: number, newStatus: string) => {
    try { await api.patch(`/projects/tasks/${taskId}/`, { status: newStatus }); } catch { /* silent */ }
    fetchAll();
  };

  if (loading) return (
    <div className="space-y-4">
      <div className="h-8 bg-gray-200 dark:bg-gray-600 rounded w-64 animate-pulse" />
      <div className="h-48 bg-white dark:bg-gray-800 rounded-xl animate-pulse" />
    </div>
  );

  if (!project) return (
    <div className="text-center py-20 text-gray-500 dark:text-gray-400">Projeto não encontrado.</div>
  );

  const totalLoggedHours = timeEntries.reduce((s, e) => s + Number(e.hours), 0);
  const tasksByStatus = {
    todo: tasks.filter(t => t.status === 'todo'),
    in_progress: tasks.filter(t => t.status === 'in_progress'),
    review: tasks.filter(t => t.status === 'review'),
    done: tasks.filter(t => t.status === 'done'),
  };

  const tabs = [
    { key: 'overview', label: 'Visão Geral', icon: BarChart2 },
    { key: 'tasks', label: `Tarefas (${tasks.length})`, icon: CheckCircle2 },
    { key: 'phases', label: `Fases & Marcos`, icon: Layers },
    { key: 'hours', label: `Horas (${totalLoggedHours.toFixed(1)}h)`, icon: Clock },
    { key: 'sprints', label: `Sprints (${sprints.length})`, icon: Zap },
    { key: 'changes', label: `Mudanças (${changeRequests.length})`, icon: GitBranch },
    { key: 'environments', label: `Ambientes (${environments.length})`, icon: Server },
  ];

  const kanbanCols = [
    { key: 'todo', label: 'A Fazer', color: 'border-t-gray-400', bgHeader: 'bg-gray-50 dark:bg-gray-700/50' },
    { key: 'in_progress', label: 'Em Andamento', color: 'border-t-blue-500', bgHeader: 'bg-blue-50 dark:bg-blue-900/30' },
    { key: 'review', label: 'Em Revisão', color: 'border-t-yellow-500', bgHeader: 'bg-yellow-50 dark:bg-yellow-900/30' },
    { key: 'done', label: 'Concluído', color: 'border-t-green-500', bgHeader: 'bg-green-50 dark:bg-green-900/30' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => router.push('/projects')} className="p-2 rounded-lg hover:bg-white transition-colors mt-0.5" aria-label="Voltar">
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100"><Sensitive>{project.name}</Sensitive></h1>
            <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${statusColors[project.status] || 'bg-gray-100 dark:bg-gray-700 text-gray-700'}`}>
              {project.status}
            </span>
          </div>
          {project.customer_name && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5"><Sensitive>{project.customer_name}</Sensitive></p>}
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Progresso geral</span>
          <span className="text-sm font-bold text-accent-gold">{project.progress}%</span>
        </div>
        <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-accent-gold to-accent-gold-light rounded-full transition-all"
            style={{ width: `${project.progress}%` }} />
        </div>
        <div className="flex gap-6 mt-3 text-xs text-gray-500 dark:text-gray-400">
          <span>Início: {formatDate(project.start_date)}</span>
          {project.deadline && <span className="text-orange-600">Prazo: {formatDate(project.deadline)}</span>}
          <span>Time: <Sensitive>{project.team_names?.join(', ') || '-'}</Sensitive></span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto bg-white dark:bg-gray-800 rounded-xl p-1 shadow-sm border border-gray-200 dark:border-gray-700">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                activeTab === tab.key ? 'bg-accent-gold text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Detalhes */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Detalhes do Projeto</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500 dark:text-gray-400">Tipo</span><p className="font-medium">{project.project_type}</p></div>
              <div><span className="text-gray-500 dark:text-gray-400">Faturamento</span><p className="font-medium">{project.billing_type}</p></div>
              <div><span className="text-gray-500 dark:text-gray-400">Orçamento</span><p className="font-medium"><Sensitive>{formatCurrency(project.budget_value)}</Sensitive></p></div>
              <div><span className="text-gray-500 dark:text-gray-400">Horas Budget</span><p className="font-medium"><Sensitive>{project.budget_hours}h</Sensitive></p></div>
              <div><span className="text-gray-500 dark:text-gray-400">Horas Logadas</span><p className="font-medium"><Sensitive>{totalLoggedHours.toFixed(1)}h</Sensitive></p></div>
              <div><span className="text-gray-500 dark:text-gray-400">Gerente</span><p className="font-medium"><Sensitive>{project.manager_name || '-'}</Sensitive></p></div>
            </div>
            {project.description && (
              <div><p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Descrição</p><p className="text-sm text-gray-700 dark:text-gray-200">{project.description}</p></div>
            )}
            <div className="flex gap-3 pt-2">
              {project.github_repo && <a href={project.github_repo} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">GitHub</a>}
              {project.figma_url && <a href={project.figma_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">Figma</a>}
              {project.docs_url && <a href={project.docs_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">Docs</a>}
            </div>
          </div>

          {/* Rentabilidade */}
          {profitability && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700 space-y-4">
              <h2 className="font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-accent-gold" /> Rentabilidade
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Receita</span>
                  <span className="font-semibold text-green-600"><Sensitive>{formatCurrency(profitability.revenue)}</Sensitive></span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Custo de mão de obra</span>
                  <span className="font-medium text-red-500">- <Sensitive>{formatCurrency(profitability.labor_cost)}</Sensitive></span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Despesas diretas</span>
                  <span className="font-medium text-red-500">- <Sensitive>{formatCurrency(profitability.direct_expenses)}</Sensitive></span>
                </div>
                <div className="border-t pt-2 flex justify-between">
                  <span className="font-semibold">Margem Bruta</span>
                  <span className={`font-bold ${profitability.gross_margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    <Sensitive>{formatCurrency(profitability.gross_margin)} ({profitability.margin_pct}%)</Sensitive>
                  </span>
                </div>
              </div>
              <div className={`p-3 rounded-lg text-sm ${profitability.margin_pct >= 30 ? 'bg-green-50 dark:bg-green-900/30 text-green-700' : profitability.margin_pct >= 10 ? 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700' : 'bg-red-50 dark:bg-red-900/30 text-red-700'}`}>
                {profitability.margin_pct >= 30 ? '✓ Margem saudável' : profitability.margin_pct >= 10 ? '⚠ Margem baixa — atenção' : '✗ Projeto no vermelho'}
              </div>
            </div>
          )}

          {/* Resumo tarefas */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">Resumo de Tarefas</h2>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'A Fazer', count: tasksByStatus.todo.length, color: 'text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50' },
                { label: 'Em Andamento', count: tasksByStatus.in_progress.length, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' },
                { label: 'Em Revisão', count: tasksByStatus.review.length, color: 'text-yellow-700 bg-yellow-50 dark:bg-yellow-900/30' },
                { label: 'Concluído', count: tasksByStatus.done.length, color: 'text-green-600 bg-green-50 dark:bg-green-900/30' },
              ].map(s => (
                <div key={s.label} className={`rounded-lg p-3 ${s.color} text-center`}>
                  <div className="text-2xl font-bold">{s.count}</div>
                  <div className="text-xs mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Tasks (Kanban) */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Tarefas</h2>
            <button onClick={() => openTaskModal()} className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg text-sm font-medium hover:bg-accent-gold-dark">
              <Plus className="w-4 h-4" /> Nova Tarefa
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {kanbanCols.map(col => (
              <div key={col.key} className={`bg-white dark:bg-gray-800 rounded-xl border-t-4 ${col.color} shadow-sm`}>
                <div className={`px-3 py-2.5 rounded-t-lg flex items-center justify-between`}>
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{col.label}</span>
                  <span className="text-xs bg-white dark:bg-gray-800 text-gray-600 px-2 py-0.5 rounded-full border">
                    {tasksByStatus[col.key as keyof typeof tasksByStatus].length}
                  </span>
                </div>
                <div className="p-2 space-y-2 min-h-[200px]">
                  {tasksByStatus[col.key as keyof typeof tasksByStatus].map(task => (
                    <div key={task.id} className="bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3 group">
                      <div className="flex items-start justify-between gap-1">
                        <div className="flex-1 min-w-0">
                          <div className="flex gap-1.5 flex-wrap mb-1">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${taskTypeColors[task.task_type]}`}>{task.task_type}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${priorityColors[task.priority]}`}>{task.priority}</span>
                          </div>
                          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 leading-tight">{task.title}</p>
                          {task.assigned_to_name && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"><Sensitive>{task.assigned_to_name}</Sensitive></p>}
                          {task.due_date && <p className="text-xs text-gray-400 dark:text-gray-500">{formatDate(task.due_date)}</p>}
                        </div>
                      </div>
                      <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openTaskModal(task)} className="p-1 rounded hover:bg-white text-gray-500 dark:text-gray-400 hover:text-blue-600" aria-label="Editar">
                          <Edit2 className="w-3 h-3" />
                        </button>
                        {task.status !== 'done' && (
                          <button onClick={() => completeTask(task.id)} className="p-1 rounded hover:bg-white text-gray-500 dark:text-gray-400 hover:text-green-600" aria-label="Concluir tarefa">
                            <CheckCircle2 className="w-3 h-3" />
                          </button>
                        )}
                        <button onClick={() => setConfirmDelete({ open: true, taskId: task.id })} className="p-1 rounded hover:bg-white text-gray-500 dark:text-gray-400 hover:text-red-600" aria-label="Excluir">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Fases & Marcos */}
      {activeTab === 'phases' && (
        <div className="space-y-4">
          {phases.map(phase => {
            const phaseMilestones = milestones.filter(() => true); // todos por ora
            return (
              <div key={phase.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${phase.is_completed ? 'bg-green-50 dark:bg-green-900/300' : 'bg-gray-300'}`}>
                    {phase.is_completed && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100">{phase.name}</h3>
                    {phase.description && <p className="text-xs text-gray-500 dark:text-gray-400">{phase.description}</p>}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {phase.completed_tasks_count}/{phase.tasks_count} tarefas
                  </div>
                </div>
                {/* mini progress */}
                {phase.tasks_count > 0 && (
                  <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-accent-gold rounded-full"
                      style={{ width: `${(phase.completed_tasks_count / phase.tasks_count) * 100}%` }} />
                  </div>
                )}
              </div>
            );
          })}
          {phases.length === 0 && <div className="text-center py-12 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 rounded-xl">Nenhuma fase cadastrada.</div>}

          <h2 className="font-semibold text-gray-800 dark:text-gray-100 mt-6">Marcos</h2>
          <div className="space-y-2">
            {milestones.map(m => (
              <div key={m.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700 flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full flex-shrink-0 ${m.is_completed ? 'bg-green-50 dark:bg-green-900/300' : 'bg-orange-400'}`} />
                <div className="flex-1">
                  <p className="font-medium text-gray-800 dark:text-gray-100">{m.name}</p>
                  {m.description && <p className="text-xs text-gray-500 dark:text-gray-400">{m.description}</p>}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{formatDate(m.due_date)}</div>
                {m.is_completed && <span className="text-xs bg-green-100 dark:bg-green-900/40 text-green-700 px-2 py-0.5 rounded-full">Concluído</span>}
              </div>
            ))}
            {milestones.length === 0 && <div className="text-center py-6 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 rounded-xl">Nenhum marco cadastrado.</div>}
          </div>
        </div>
      )}

      {/* Tab: Horas */}
      {activeTab === 'hours' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="font-semibold text-gray-800 dark:text-gray-100">Apontamentos de Horas</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">{totalLoggedHours.toFixed(1)}h logadas de {project.budget_hours}h orçadas</p>
            </div>
            <button onClick={() => { setShowTimeModal(true); setTimeForm({ hours: '', description: '', date: new Date().toISOString().split('T')[0], is_billable: true, task: '' }); }}
              className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg text-sm font-medium hover:bg-accent-gold-dark">
              <Plus className="w-4 h-4" /> Apontar Horas
            </button>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Colaborador</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Horas</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Descrição</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Faturável</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {timeEntries.map(entry => (
                  <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100"><Sensitive>{entry.user_name}</Sensitive></td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{formatDate(entry.date)}</td>
                    <td className="px-4 py-3 font-semibold text-accent-gold">{entry.hours}h</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-xs truncate">{entry.description || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${entry.is_billable ? 'bg-green-100 dark:bg-green-900/40 text-green-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>
                        {entry.is_billable ? 'Sim' : 'Não'}
                      </span>
                    </td>
                  </tr>
                ))}
                {timeEntries.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-gray-400 dark:text-gray-500">Nenhum apontamento ainda</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Sprints */}
      {activeTab === 'sprints' && (
        <div className="space-y-3">
          {sprints.map(sprint => (
            <div key={sprint.id} className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800 dark:text-gray-100">{sprint.name}</h3>
                  {sprint.goal && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{sprint.goal}</p>}
                  <div className="flex gap-4 text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                    <span>{formatDate(sprint.start_date)} → {formatDate(sprint.end_date)}</span>
                    <span>{sprint.completed_tasks}/{sprint.tasks_count} tarefas</span>
                  </div>
                </div>
                <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                  sprint.status === 'active' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700' :
                  sprint.status === 'done' ? 'bg-green-100 dark:bg-green-900/40 text-green-700' :
                  'bg-gray-100 dark:bg-gray-700 text-gray-600'
                }`}>{sprint.status}</span>
              </div>
              {sprint.tasks_count > 0 && (
                <div className="mt-3">
                  <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-accent-gold rounded-full" style={{ width: `${(sprint.completed_tasks / sprint.tasks_count) * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
          ))}
          {sprints.length === 0 && <div className="text-center py-12 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 rounded-xl">Nenhum sprint criado.</div>}
        </div>
      )}

      {/* Tab: Change Requests */}
      {activeTab === 'changes' && (
        <div className="space-y-4">
          <div className="flex justify-between">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100">Mudanças de Escopo</h2>
            <button onClick={() => { setShowCRModal(true); setCrForm({ title: '', description: '', impact_hours: '', impact_value: '' }); }}
              className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg text-sm font-medium hover:bg-accent-gold-dark">
              <Plus className="w-4 h-4" /> Nova Mudança
            </button>
          </div>
          {changeRequests.map(cr => (
            <div key={cr.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium text-gray-800 dark:text-gray-100">{cr.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{cr.description}</p>
                  <div className="flex gap-4 text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                    <span>+<Sensitive>{cr.impact_hours}h</Sensitive></span>
                    <span>+<Sensitive>{formatCurrency(cr.impact_value)}</Sensitive></span>
                    <span>por <Sensitive>{cr.created_by_name}</Sensitive></span>
                  </div>
                </div>
                <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                  cr.status === 'approved' ? 'bg-green-100 dark:bg-green-900/40 text-green-700' :
                  cr.status === 'rejected' ? 'bg-red-100 dark:bg-red-900/40 text-red-700' :
                  'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700'
                }`}>{cr.status}</span>
              </div>
            </div>
          ))}
          {changeRequests.length === 0 && <div className="text-center py-12 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 rounded-xl">Nenhuma mudança de escopo registrada.</div>}
        </div>
      )}

      {/* Tab: Environments */}
      {activeTab === 'environments' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {environments.map(env => (
            <div key={env.id} className={`bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border-l-4 ${
              env.status === 'operational' ? 'border-l-green-500' :
              env.status === 'degraded' ? 'border-l-yellow-500' :
              env.status === 'down' ? 'border-l-red-500' : 'border-l-gray-400'
            } border border-gray-200 dark:border-gray-700`}>
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-gray-800 dark:text-gray-100 capitalize">{env.name}</h3>
                <span className={`px-2 py-0.5 text-xs rounded-full ${
                  env.status === 'operational' ? 'bg-green-100 dark:bg-green-900/40 text-green-700' :
                  env.status === 'degraded' ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700' :
                  'bg-red-100 dark:bg-red-900/40 text-red-700'
                }`}>{env.status}</span>
              </div>
              {env.current_version && <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Versão: <span className="font-mono font-medium">{env.current_version}</span></p>}
              {env.url && <a href={env.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline truncate block mb-1">{env.url}</a>}
              {env.last_deploy_at && <p className="text-xs text-gray-400 dark:text-gray-500">Último deploy: {new Date(env.last_deploy_at).toLocaleString('pt-BR')}</p>}
              {env.last_deploy_by_name && <p className="text-xs text-gray-400 dark:text-gray-500">por {env.last_deploy_by_name}</p>}
            </div>
          ))}
          {environments.length === 0 && <div className="col-span-3 text-center py-12 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 rounded-xl">Nenhum ambiente cadastrado.</div>}
        </div>
      )}

      {/* Modal: Task */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <FocusTrap onClose={() => setShowTaskModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-gray-800 dark:text-gray-100">{editingTask ? 'Editar Tarefa' : 'Nova Tarefa'}</h2>
              <button onClick={() => setShowTaskModal(false)} aria-label="Fechar"><X className="w-5 h-5 text-gray-400 dark:text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Título *</label>
                <input className={`input-field mt-1 ${isDemoMode ? 'sensitive-blur' : ''}`} value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Tipo</label>
                  <select className="input-field mt-1" value={taskForm.task_type} onChange={e => setTaskForm(f => ({ ...f, task_type: e.target.value }))}>
                    {['task', 'bug', 'feature', 'research', 'meeting'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Prioridade</label>
                  <select className="input-field mt-1" value={taskForm.priority} onChange={e => setTaskForm(f => ({ ...f, priority: e.target.value }))}>
                    {['low', 'medium', 'high', 'urgent'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              {editingTask && (
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Status</label>
                  <select className="input-field mt-1" value={taskForm.status} onChange={e => setTaskForm(f => ({ ...f, status: e.target.value }))}>
                    {['todo', 'in_progress', 'review', 'done'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Horas Estimadas</label>
                  <input type="number" step="0.5" className="input-field mt-1" value={taskForm.estimated_hours}
                    onChange={e => setTaskForm(f => ({ ...f, estimated_hours: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Prazo</label>
                  <input type="date" className="input-field mt-1" value={taskForm.due_date}
                    onChange={e => setTaskForm(f => ({ ...f, due_date: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Descrição</label>
                <textarea rows={3} className={`input-field mt-1 ${isDemoMode ? 'sensitive-blur' : ''}`} value={taskForm.description}
                  onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <div className="p-5 border-t flex gap-3 justify-end">
              <button onClick={() => setShowTaskModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancelar</button>
              <button onClick={saveTask} className="px-4 py-2 text-sm bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark">
                {editingTask ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
          </FocusTrap>
        </div>
      )}

      {/* Modal: Time Entry */}
      {showTimeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <FocusTrap onClose={() => setShowTimeModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-gray-800 dark:text-gray-100">Apontar Horas</h2>
              <button onClick={() => setShowTimeModal(false)} aria-label="Fechar"><X className="w-5 h-5 text-gray-400 dark:text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Horas *</label>
                  <input type="number" step="0.5" min="0.5" className={`input-field mt-1 ${isDemoMode ? 'sensitive-blur' : ''}`} value={timeForm.hours}
                    onChange={e => setTimeForm(f => ({ ...f, hours: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Data</label>
                  <input type="date" className="input-field mt-1" value={timeForm.date}
                    onChange={e => setTimeForm(f => ({ ...f, date: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Tarefa (opcional)</label>
                <select className="input-field mt-1" value={timeForm.task}
                  onChange={e => setTimeForm(f => ({ ...f, task: e.target.value }))}>
                  <option value="">Nenhuma</option>
                  {tasks.filter(t => t.status !== 'done').map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Descrição</label>
                <textarea rows={3} className={`input-field mt-1 ${isDemoMode ? 'sensitive-blur' : ''}`} value={timeForm.description}
                  onChange={e => setTimeForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={timeForm.is_billable}
                  onChange={e => setTimeForm(f => ({ ...f, is_billable: e.target.checked }))} />
                Horas faturáveis
              </label>
            </div>
            <div className="p-5 border-t flex gap-3 justify-end">
              <button onClick={() => setShowTimeModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancelar</button>
              <button onClick={saveTimeEntry} className="px-4 py-2 text-sm bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark">Apontar</button>
            </div>
          </div>
          </FocusTrap>
        </div>
      )}

      {/* Modal: Change Request */}
      {showCRModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <FocusTrap onClose={() => setShowCRModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="font-semibold text-gray-800 dark:text-gray-100">Nova Mudança de Escopo</h2>
              <button onClick={() => setShowCRModal(false)} aria-label="Fechar"><X className="w-5 h-5 text-gray-400 dark:text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Título *</label>
                <input className={`input-field mt-1 ${isDemoMode ? 'sensitive-blur' : ''}`} value={crForm.title} onChange={e => setCrForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Descrição</label>
                <textarea rows={3} className={`input-field mt-1 ${isDemoMode ? 'sensitive-blur' : ''}`} value={crForm.description}
                  onChange={e => setCrForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Impacto em Horas</label>
                  <input type="number" step="0.5" className={`input-field mt-1 ${isDemoMode ? 'sensitive-blur' : ''}`} value={crForm.impact_hours}
                    onChange={e => setCrForm(f => ({ ...f, impact_hours: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Impacto em Valor (R$)</label>
                  <input type="number" step="0.01" className={`input-field mt-1 ${isDemoMode ? 'sensitive-blur' : ''}`} value={crForm.impact_value}
                    onChange={e => setCrForm(f => ({ ...f, impact_value: e.target.value }))} />
                </div>
              </div>
            </div>
            <div className="p-5 border-t flex gap-3 justify-end">
              <button onClick={() => setShowCRModal(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancelar</button>
              <button onClick={saveChangeRequest} className="px-4 py-2 text-sm bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark">Criar</button>
            </div>
          </div>
          </FocusTrap>
        </div>
      )}

      {/* Confirm Delete */}
      <ConfirmDialog
        open={confirmDelete.open}
        title="Remover Tarefa"
        description="Tem certeza que deseja remover esta tarefa?"
        onConfirm={() => confirmDelete.taskId && deleteTask(confirmDelete.taskId)}
        onCancel={() => setConfirmDelete({ open: false, taskId: null })}
        danger
      />
    </div>
  );
}
