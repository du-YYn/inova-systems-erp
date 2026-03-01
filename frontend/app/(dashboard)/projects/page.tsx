'use client';

import { useEffect, useState } from 'react';
import { 
  Plus, 
  Search, 
  MoreVertical,
  Clock,
  CheckCircle2,
  Circle,
  PlayCircle,
  X
} from 'lucide-react';

interface Project {
  id: number;
  name: string;
  description: string;
  customer_name: string | null;
  status: string;
  progress: number;
  start_date: string;
  end_date: string | null;
  value: number;
}

const statusColumns = [
  { key: 'planning', label: 'Planejamento', icon: Circle, color: 'bg-gray-100' },
  { key: 'execution', label: 'Em Execução', icon: PlayCircle, color: 'bg-blue-100' },
  { key: 'completed', label: 'Concluído', icon: CheckCircle2, color: 'bg-green-100' },
];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    customer: null,
    status: 'planning',
    progress: 0,
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    value: 0
  });

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const token = localStorage.getItem('token');
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
        
        const res = await fetch(`${apiUrl}/projects/projects/`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        
        const data = await res.json();
        setProjects(data.results || data);
      } catch (error) {
        console.error('Error fetching projects:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const filteredProjects = projects.filter(project => 
    project.name?.toLowerCase().includes(search.toLowerCase()) ||
    project.customer_name?.toLowerCase().includes(search.toLowerCase())
  );

  const getProjectsByStatus = (status: string) => {
    return filteredProjects.filter(p => p.status === status);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
      
      const res = await fetch(`${apiUrl}/projects/projects/`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      
      if (res.ok) {
        const newProject = await res.json();
        setProjects([newProject, ...projects]);
        setShowModal(false);
        setFormData({
          name: '',
          description: '',
          customer: null,
          status: 'planning',
          progress: 0,
          start_date: new Date().toISOString().split('T')[0],
          end_date: '',
          value: 0
        });
      }
    } catch (error) {
      console.error('Error creating project:', error);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Projetos</h1>
          <p className="text-text-secondary mt-1">Gerencie seus projetos e tarefas</p>
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
        <div className="flex items-center justify-center h-64">
          <p className="text-text-secondary">Carregando projetos...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {statusColumns.map((column) => {
            const columnProjects = getProjectsByStatus(column.key);
            return (
              <div key={column.key} className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <column.icon className="w-5 h-5 text-text-secondary" />
                    <h3 className="font-medium text-text-primary">{column.label}</h3>
                  </div>
                  <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-sm rounded-full">
                    {columnProjects.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {columnProjects.length === 0 ? (
                    <p className="text-sm text-text-secondary text-center py-4">
                      Nenhum projeto
                    </p>
                  ) : (
                    columnProjects.map((project) => (
                      <div 
                        key={project.id} 
                        className="bg-white p-4 rounded-lg border border-gray-200 hover:border-accent-gold transition-colors cursor-pointer"
                      >
                        <h4 className="font-medium text-text-primary mb-1">{project.name}</h4>
                        {project.customer_name && (
                          <p className="text-sm text-text-secondary mb-3">{project.customer_name}</p>
                        )}
                        
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-text-secondary">
                            {project.start_date && new Date(project.start_date).toLocaleDateString('pt-BR')}
                            {project.end_date && ` - ${new Date(project.end_date).toLocaleDateString('pt-BR')}`}
                          </span>
                          <span className="text-sm font-medium text-accent-gold">
                            {formatCurrency(project.value)}
                          </span>
                        </div>
                        
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div 
                            className="bg-accent-gold h-1.5 rounded-full transition-all" 
                            style={{ width: `${project.progress}%` }}
                          />
                        </div>
                        <p className="text-xs text-text-secondary mt-1 text-right">{project.progress}%</p>
                      </div>
                    ))
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-text-primary">Novo Projeto</h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Nome do Projeto</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Descrição</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Data de Início</label>
                <input
                  type="date"
                  required
                  value={formData.start_date}
                  onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Data de Término</label>
                <input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({...formData, end_date: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Valor</label>
                <input
                  type="number"
                  value={formData.value}
                  onChange={(e) => setFormData({...formData, value: parseFloat(e.target.value) || 0})}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold"
                />
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
                  className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors"
                >
                  Criar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
