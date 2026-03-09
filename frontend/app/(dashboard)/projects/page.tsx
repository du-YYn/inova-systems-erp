'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Search, Circle, PlayCircle, CheckCircle2, Trash2, X
} from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface Project {
  id: number;
  name: string;
  description: string;
  customer_name: string | null;
  status: string;
  progress: number;
  start_date: string | null;
  end_date: string | null;
  budget_value: string | null;
  project_type: string;
}

interface Customer {
  id: number;
  company_name: string;
  name: string;
}

const planningStatuses = ['planning', 'kickoff', 'requirements'];
const executionStatuses = ['development', 'testing', 'deployment'];
const completedStatuses = ['completed'];

const statusColumns = [
  { key: 'planning', label: 'Planejamento', icon: Circle, color: 'bg-gray-50' },
  { key: 'execution', label: 'Em Execução', icon: PlayCircle, color: 'bg-blue-50' },
  { key: 'completed', label: 'Concluído', icon: CheckCircle2, color: 'bg-green-50' },
];

const formatCurrency = (value: string | number | null) => {
  if (!value) return null;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
};

const EMPTY_FORM = {
  name: '',
  description: '',
  project_type: 'custom_dev',
  billing_type: 'fixed',
  start_date: '',
  end_date: '',
  budget_value: '',
  budget_hours: '',
  customer: '',
  notes: '',
};

const KanbanSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
    {Array.from({ length: 3 }).map((_, col) => (
      <div key={col} className="bg-gray-50 rounded-lg p-4">
        <div className="h-5 bg-gray-200 rounded w-32 mb-4 animate-pulse" />
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-white p-4 rounded-lg border border-gray-200 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/2 mb-3" />
              <div className="h-2 bg-gray-200 rounded-full w-full" />
            </div>
          ))}
        </div>
      </div>
    ))}
  </div>
);

export default function ProjectsPage() {
  const toast = useToast();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
  const getHeaders = () => ({ 'Content-Type': 'application/json' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [projectsRes, customersRes] = await Promise.all([
        fetch(`${apiUrl}/projects/projects/`, { headers: getHeaders(), credentials: 'include' }),
        fetch(`${apiUrl}/sales/customers/`, { headers: getHeaders(), credentials: 'include' }),
      ]);
      if (!projectsRes.ok || !customersRes.ok) throw new Error('Unauthorized');
      const projectsData = await projectsRes.json();
      const customersData = await customersRes.json();
      const pList = projectsData.results || projectsData;
      const cList = customersData.results || customersData;
      setProjects(Array.isArray(pList) ? pList : []);
      setCustomers(Array.isArray(cList) ? cList : []);
    } catch {
      toast.error('Erro ao carregar projetos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredProjects = projects.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.customer_name?.toLowerCase().includes(search.toLowerCase())
  );

  const getProjectsByColumn = (columnKey: string) => {
    const map: Record<string, string[]> = {
      planning: planningStatuses,
      execution: executionStatuses,
      completed: completedStatuses,
    };
    return filteredProjects.filter(p => map[columnKey]?.includes(p.status));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: formData.name,
        description: formData.description,
        project_type: formData.project_type,
        billing_type: formData.billing_type,
        notes: formData.notes,
      };
      if (formData.customer) body.customer = Number(formData.customer);
      if (formData.start_date) body.start_date = formData.start_date;
      if (formData.end_date) body.end_date = formData.end_date;
      if (formData.budget_value) body.budget_value = formData.budget_value;
      if (formData.budget_hours) body.budget_hours = formData.budget_hours;

      const res = await fetch(`${apiUrl}/projects/projects/`, {
        method: 'POST',
        headers: getHeaders(),
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const newProject = await res.json();
      setProjects(prev => [newProject, ...prev]);
      toast.success('Projeto criado com sucesso!');
      setShowModal(false);
      setFormData({ ...EMPTY_FORM });
    } catch {
      toast.error('Erro ao criar projeto. Verifique os dados e tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${apiUrl}/projects/projects/${deleteTarget.id}/`, {
        method: 'DELETE',
        headers: getHeaders(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error();
      setProjects(prev => prev.filter(p => p.id !== deleteTarget.id));
      toast.success(`Projeto "${deleteTarget.name}" removido.`);
      setDeleteTarget(null);
    } catch {
      toast.error('Erro ao remover projeto.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projetos</h1>
          <p className="text-gray-500 mt-1">Gerencie seus projetos e tarefas</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors"
        >
          <Plus className="w-5 h-5" />
          Novo Projeto
        </button>
      </div>

      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar projetos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
          />
        </div>
      </div>

      {loading ? (
        <KanbanSkeleton />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {statusColumns.map((column) => {
            const columnProjects = getProjectsByColumn(column.key);
            return (
              <div key={column.key} className={`${column.color} rounded-lg p-4`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <column.icon className="w-5 h-5 text-gray-500" />
                    <h3 className="font-medium text-gray-900">{column.label}</h3>
                  </div>
                  <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-sm rounded-full">
                    {columnProjects.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {columnProjects.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">Nenhum projeto</p>
                  ) : (
                    columnProjects.map((project) => (
                      <div
                        key={project.id}
                        className="bg-white p-4 rounded-lg border border-gray-200 hover:border-accent-gold transition-colors group cursor-pointer"
                        onClick={() => router.push(`/projects/${project.id}`)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-medium text-gray-900 mb-1 flex-1">{project.name}</h4>
                          <button
                            onClick={() => setDeleteTarget(project)}
                            className="p-1 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                            title="Remover projeto"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        {project.customer_name && (
                          <p className="text-sm text-gray-500 mb-3">{project.customer_name}</p>
                        )}

                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-gray-500">
                            {project.start_date && new Date(project.start_date).toLocaleDateString('pt-BR')}
                            {project.end_date && ` - ${new Date(project.end_date).toLocaleDateString('pt-BR')}`}
                          </span>
                          {project.budget_value && (
                            <span className="text-sm font-medium text-accent-gold">
                              {formatCurrency(project.budget_value)}
                            </span>
                          )}
                        </div>

                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-accent-gold h-1.5 rounded-full transition-all"
                            style={{ width: `${project.progress}%` }}
                          />
                        </div>
                        <p className="text-xs text-gray-500 mt-1 text-right">{project.progress}%</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto shadow-modal animate-modal-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Novo Projeto</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Nome *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input-field"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Descrição</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cliente</label>
                <select
                  value={formData.customer}
                  onChange={(e) => setFormData({ ...formData, customer: e.target.value })}
                  className="input-field bg-white"
                >
                  <option value="">Selecione um cliente</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name || c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Tipo</label>
                  <select
                    value={formData.project_type}
                    onChange={(e) => setFormData({ ...formData, project_type: e.target.value })}
                    className="input-field bg-white"
                  >
                    <option value="custom_dev">Desenvolvimento</option>
                    <option value="saas">SaaS</option>
                    <option value="maintenance">Manutenção</option>
                    <option value="support">Suporte</option>
                    <option value="consulting">Consultoria</option>
                    <option value="internal">Interno</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cobrança</label>
                  <select
                    value={formData.billing_type}
                    onChange={(e) => setFormData({ ...formData, billing_type: e.target.value })}
                    className="input-field bg-white"
                  >
                    <option value="fixed">Valor Fixo</option>
                    <option value="hourly">Por Hora</option>
                    <option value="monthly">Mensal</option>
                    <option value="milestone">Por Marco</option>
                    <option value="not_billed">Não Faturado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Início</label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Prazo</label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.budget_value}
                    onChange={(e) => setFormData({ ...formData, budget_value: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Horas Orçadas</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.budget_hours}
                    onChange={(e) => setFormData({ ...formData, budget_hours: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60"
                >
                  {saving ? 'Salvando...' : 'Criar Projeto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Remover Projeto"
        description={`Tem certeza que deseja remover o projeto "${deleteTarget?.name}"? Esta ação não pode ser desfeita.`}
        confirmLabel={deleting ? 'Removendo...' : 'Remover'}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
