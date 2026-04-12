'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, ScrollText, TrendingUp, CheckCircle, AlertTriangle, Trash2, X, Edit2, FileSignature, RefreshCw, Upload, Download } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { TableSkeleton, CardSkeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
import FocusTrap from '@/components/ui/FocusTrap';
import { Sensitive } from '@/components/ui/Sensitive';
import { MultiSelect } from '@/components/ui/MultiSelect';
import api, { ApiError } from '@/lib/api';

interface Contract {
  id: number;
  number: string;
  title: string;
  customer: number | null;
  customer_name: string;
  proposal_title: string;
  service_types: string[];
  contract_type: string;
  contract_file: string | null;
  billing_type: string;
  start_date: string | null;
  end_date: string | null;
  monthly_value: string | null;
  hourly_rate: string | null;
  total_hours_monthly: string | null;
  status: string;
  auto_renew: boolean;
  renewal_days: number;
  notes: string;
  terms: string;
  created_at: string;
  updated_at: string;
}

interface Customer { id: number; company_name: string; name: string; }
interface Prospect { id: number; company_name: string; contact_name: string; contact_email?: string; contact_phone?: string; status: string; }
interface DashboardStats {
  total_contracts: number;
  active_contracts: number;
  mrr: number;
  expiring_contracts: number;
}

const PAGE_SIZE = 10;

const statusColors: Record<string, string> = {
  draft:               'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200',
  pending_signature:   'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
  active:              'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  renewed:             'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300',
  cancelled:           'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
  expired:             'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
};
const statusLabels: Record<string, string> = {
  draft: 'Rascunho', pending_signature: 'Aguard. Assinatura',
  active: 'Ativo', renewed: 'Renovado',
  cancelled: 'Cancelado', expired: 'Expirado',
};
const contractTypeLabels: Record<string, string> = {
  software_dev: 'Desenvolvimento', automation: 'Automação',
  ai: 'Inteligência Artificial', consulting: 'Consultoria',
  maintenance: 'Manutenção', support: 'Suporte',
  saas: 'SaaS', mixed: 'Múltiplos Serviços',
};
const billingTypeLabels: Record<string, string> = {
  fixed: 'Valor Fixo', hourly: 'Por Hora', monthly: 'Mensal',
  milestone: 'Por Marco',
};

const formatCurrency = (v: string | number | null) =>
  v ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v)) : '—';
const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const SERVICE_TYPE_OPTIONS = [
  { value: 'software_dev', label: 'Desenvolvimento de Software' },
  { value: 'automation', label: 'Automação de Processos' },
  { value: 'ai', label: 'Inteligência Artificial' },
  { value: 'consulting', label: 'Consultoria Técnica' },
  { value: 'maintenance', label: 'Manutenção' },
  { value: 'support', label: 'Suporte' },
  { value: 'saas', label: 'SaaS/Assinatura' },
  { value: 'mixed', label: 'Múltiplos Serviços' },
];

const EMPTY_FORM = {
  title: '', customer: '', service_types: [] as string[], contract_type: '', billing_type: 'fixed',
  start_date: new Date().toISOString().split('T')[0], end_date: '',
  monthly_value: '', hourly_rate: '', total_hours_monthly: '',
  auto_renew: false, renewal_days: '30', notes: '', terms: '',
};

type FormData = typeof EMPTY_FORM;

function ContractForm({
  form, setForm, customers, prospects,
  showQuickCreate, setShowQuickCreate, quickCreateName, setQuickCreateName,
  creatingCustomer, onQuickCreate, isEdit,
}: {
  form: FormData; setForm: (f: FormData) => void;
  customers: Customer[]; prospects: Prospect[];
  showQuickCreate: boolean; setShowQuickCreate: (v: boolean) => void;
  quickCreateName: string; setQuickCreateName: (v: string) => void;
  creatingCustomer: boolean; onQuickCreate: () => void;
  isEdit: boolean;
}) {
  const lbl = 'block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1';

  const validateDates = () => {
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      return 'Data de término deve ser após o início.';
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Título */}
      <div>
        <label className={lbl}>Título *</label>
        <input type="text" required value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="w-full input-field" />
      </div>

      {/* Cliente */}
      <div>
        <label className={lbl}>Cliente *</label>
        {!showQuickCreate ? (
          <>
            <select value={form.customer}
              onChange={(e) => setForm({ ...form, customer: e.target.value })}
              className="w-full input-field bg-white dark:bg-gray-800">
              <option value="">
                {customers.length === 0
                  ? 'Nenhum cliente — feche um lead ou cadastre abaixo'
                  : 'Selecione um cliente'}
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name || c.name}</option>
              ))}
              {false && prospects.length > 0 && (
                <optgroup label="Do Funil (CRM)">
                  {prospects.map((p) => (
                    <option key={p.id} value={`prospect_${p.id}`}>{p.company_name || p.contact_name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {!isEdit && (
              <button type="button"
                onClick={() => { setShowQuickCreate(true); setForm({ ...form, customer: '' }); }}
                className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-accent-gold/50 text-accent-gold hover:bg-accent-gold/5 rounded-lg text-sm transition-colors">
                <Plus className="w-4 h-4" /> Cadastrar novo cliente
              </button>
            )}
          </>
        ) : (
          <div className="border border-accent-gold/30 bg-accent-gold/5 rounded-xl p-3 space-y-2">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Nome da empresa / cliente *</p>
            <div className="flex gap-2">
              <input type="text" placeholder="Ex: Empresa Ltda" value={quickCreateName}
                onChange={(e) => setQuickCreateName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), onQuickCreate())}
                className="flex-1 input-field" autoFocus />
              <button type="button" onClick={onQuickCreate}
                disabled={creatingCustomer || quickCreateName.trim().length < 2}
                className="px-4 py-2 bg-accent-gold hover:bg-accent-gold-dark text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 shrink-0">
                {creatingCustomer ? '...' : 'Criar'}
              </button>
            </div>
            <button type="button"
              onClick={() => { setShowQuickCreate(false); setQuickCreateName(''); }}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
              ← Voltar para seleção
            </button>
          </div>
        )}
      </div>

      {/* Tipo de Serviço (múltipla seleção) */}
      <div>
        <label className={lbl}>Tipo de Serviço (múltipla seleção)</label>
        <MultiSelect
          options={SERVICE_TYPE_OPTIONS}
          value={form.service_types}
          onChange={(v) => setForm({ ...form, service_types: v })}
          placeholder="Selecione os serviços..."
        />
      </div>

      {/* Cobrança */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={lbl}>Cobrança</label>
          <select value={form.billing_type}
            onChange={(e) => setForm({ ...form, billing_type: e.target.value })}
            className="w-full input-field bg-white dark:bg-gray-800">
            {Object.entries(billingTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {/* Datas */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={lbl}>Início *</label>
          <input type="date" required value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            className="w-full input-field" />
        </div>
        <div>
          <label className={lbl}>Término</label>
          <input type="date" value={form.end_date}
            min={form.start_date || undefined}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            className="w-full input-field" />
          {(() => { const e = validateDates(); return e ? <p className="text-xs text-red-500 dark:text-red-400 mt-1">{e}</p> : null; })()}
        </div>
      </div>

      {/* Valores */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={lbl}>Valor Mensal (R$)</label>
          <input type="number" step="0.01" min="0" value={form.monthly_value}
            onChange={(e) => setForm({ ...form, monthly_value: e.target.value })}
            className="w-full input-field" />
        </div>
        <div>
          <label className={lbl}>Valor/Hora (R$)</label>
          <input type="number" step="0.01" min="0" value={form.hourly_rate}
            onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
            className="w-full input-field" />
        </div>
      </div>
      {form.billing_type === 'hourly' && (
        <div>
          <label className={lbl}>Horas Mensais Contratadas</label>
          <input type="number" step="0.5" min="0" value={form.total_hours_monthly}
            onChange={(e) => setForm({ ...form, total_hours_monthly: e.target.value })}
            className="w-full input-field" placeholder="Ex: 40" />
        </div>
      )}

      {/* Renovação */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.auto_renew}
            onChange={(e) => setForm({ ...form, auto_renew: e.target.checked })}
            className="w-4 h-4 rounded text-accent-gold" />
          <span className="text-sm text-gray-500 dark:text-gray-400">Renovação automática</span>
        </label>
        {form.auto_renew && (
          <div className="flex items-center gap-2">
            <input type="number" min="1" max="365" value={form.renewal_days}
              onChange={(e) => setForm({ ...form, renewal_days: e.target.value })}
              className="w-20 input-field text-sm" />
            <span className="text-sm text-gray-500 dark:text-gray-400">dias antes</span>
          </div>
        )}
      </div>

      {/* Observações */}
      <div>
        <label className={lbl}>Observações</label>
        <textarea value={form.notes} rows={2}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className="w-full input-field resize-none" placeholder="Anotações internas sobre o contrato..." />
      </div>

      {/* Termos */}
      <div>
        <label className={lbl}>Termos / Cláusulas</label>
        <textarea value={form.terms} rows={3}
          onChange={(e) => setForm({ ...form, terms: e.target.value })}
          className="w-full input-field resize-none" placeholder="Cláusulas especiais, SLA, penalidades..." />
      </div>
    </div>
  );
}

export default function ContratosTab() {
  const toast = useToast();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Create modal
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState<FormData>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickCreateName, setQuickCreateName] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  // Edit modal
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [editForm, setEditForm] = useState<FormData>({ ...EMPTY_FORM });
  const [updating, setUpdating] = useState(false);

  // Onboarding data linked to contract
  const [onboardingData, setOnboardingData] = useState<Record<string, string> | null>(null);
  const [onboardingExpanded, setOnboardingExpanded] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Contract | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Cancel confirmation
  const [cancelTarget, setCancelTarget] = useState<Contract | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), page_size: String(PAGE_SIZE) };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;

      const contractsData = await api.get<{ results: Contract[]; count: number }>('/sales/contracts/', params);
      const cList = contractsData.results || contractsData;
      setContracts(Array.isArray(cList) ? cList : []);
      setTotal(contractsData.count ?? (Array.isArray(cList) ? cList.length : 0));
    } catch (err) {
      console.error('[ContratosTab] contracts error:', err);
    } finally {
      setLoading(false);
    }

    // Dashboard stats — falha silenciosa, não trava a tab
    try {
      const statsData = await api.get<DashboardStats>('/sales/contracts/dashboard/');
      if (statsData && !(statsData as unknown as Record<string, unknown>).detail) setStats(statsData);
    } catch {
      console.error('[ContratosTab] dashboard stats error');
    }

    // Customers — falha silenciosa
    try {
      const customersData = await api.get<{ results: Customer[]; count: number } | Customer[]>('/sales/customers/', { page_size: '200' });
      const kList = (customersData as { results: Customer[] }).results ?? customersData;
      setCustomers(Array.isArray(kList) ? kList : []);
    } catch {
      console.error('[ContratosTab] customers fetch error');
    }

    // Prospects — falha silenciosa
    try {
      const prospectsData = await api.get<{ results: Prospect[]; count: number } | Prospect[]>('/sales/prospects/', { page_size: '200' });
      const pList = (prospectsData as { results: Prospect[] }).results ?? prospectsData;
      setProspects(Array.isArray(pList) ? pList : []);
    } catch {
      console.error('[ContratosTab] prospects fetch error');
    }
  }, [page, search, filterStatus]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ── Quick create customer ────────────────────────────────────────────────
  const handleQuickCreateCustomer = async (setForm: (f: FormData) => void, currentForm: FormData) => {
    const name = quickCreateName.trim();
    if (name.length < 2) { toast.error('Nome deve ter pelo menos 2 caracteres.'); return; }
    setCreatingCustomer(true);
    try {
      const newCustomer = await api.post<Customer>('/sales/customers/', { company_name: name });
      setCustomers(prev => [...prev, newCustomer]);
      setForm({ ...currentForm, customer: String(newCustomer.id) });
      setShowQuickCreate(false);
      setQuickCreateName('');
      toast.success('Cliente criado!');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao criar cliente.');
    } finally {
      setCreatingCustomer(false);
    }
  };

  // ── Build body from form ─────────────────────────────────────────────────
  const buildBody = (f: FormData, customerId: number | null) => {
    const body: Record<string, unknown> = {
      title: f.title,
      service_types: f.service_types,
      contract_type: f.service_types[0] || '',
      billing_type: f.billing_type,
      auto_renew: f.auto_renew,
      renewal_days: Number(f.renewal_days) || 30,
      notes: f.notes,
      terms: f.terms,
    };
    if (customerId) body.customer = customerId;
    if (f.start_date) body.start_date = f.start_date;
    if (f.end_date) body.end_date = f.end_date;
    if (f.monthly_value) body.monthly_value = f.monthly_value;
    if (f.hourly_rate) body.hourly_rate = f.hourly_rate;
    if (f.total_hours_monthly) body.total_hours_monthly = f.total_hours_monthly;
    return body;
  };

  // ── Resolve customer (may be prospect_xxx) ───────────────────────────────
  const resolveCustomerId = async (customerValue: string): Promise<number | null> => {
    if (!customerValue) return null;
    if (customerValue.startsWith('prospect_')) {
      const prospectId = Number(customerValue.replace('prospect_', ''));
      const prospect = prospects.find(p => p.id === prospectId);
      if (!prospect) throw new Error('Lead não encontrado. Recarregue a página e tente novamente.');
      // Avoid creating duplicate customers
      const existing = customers.find(
        c => c.company_name?.toLowerCase() === prospect.company_name?.toLowerCase()
      );
      if (existing) return existing.id;
      const payload: Record<string, string> = {
        company_name: prospect.company_name,
        name: prospect.contact_name,
      };
      if (prospect.contact_email) payload.email = prospect.contact_email;
      if (prospect.contact_phone) payload.phone = prospect.contact_phone;
      const newCustomer = await api.post<Customer>('/sales/customers/', payload);
      setCustomers(prev => [...prev, newCustomer]);
      return newCustomer.id;
    }
    return Number(customerValue);
  };

  // ── Create ───────────────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customer) { toast.error('Selecione ou cadastre um cliente.'); return; }
    if (formData.end_date && formData.start_date && formData.end_date < formData.start_date) {
      toast.error('Data de término deve ser após o início.'); return;
    }
    setSaving(true);
    try {
      const customerId = await resolveCustomerId(formData.customer);
      await api.post('/sales/contracts/', buildBody(formData, customerId));
      toast.success('Contrato criado com sucesso!');
      setShowModal(false);
      setFormData({ ...EMPTY_FORM });
      setShowQuickCreate(false);
      setQuickCreateName('');
      fetchData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao criar contrato.');
    } finally {
      setSaving(false);
    }
  };

  // ── Open edit ────────────────────────────────────────────────────────────
  const openEdit = (c: Contract) => {
    setShowQuickCreate(false);
    setQuickCreateName('');
    setEditForm({
      title: c.title,
      customer: c.customer ? String(c.customer) : '',
      service_types: c.service_types || [],
      contract_type: c.contract_type || '',
      billing_type: c.billing_type,
      start_date: c.start_date || '',
      end_date: c.end_date || '',
      monthly_value: c.monthly_value || '',
      hourly_rate: c.hourly_rate || '',
      total_hours_monthly: c.total_hours_monthly || '',
      auto_renew: c.auto_renew,
      renewal_days: String(c.renewal_days || 30),
      notes: c.notes || '',
      terms: c.terms || '',
    });
    setEditingContract(c);
    // Fetch onboarding data linked to this contract
    setOnboardingData(null);
    setOnboardingExpanded(false);
    api.get<Record<string, string>>(`/sales/contracts/${c.id}/onboarding-data/`).then(data => {
      setOnboardingData(data);
    }).catch(() => { /* no onboarding linked */ });
  };

  // ── Update ───────────────────────────────────────────────────────────────
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContract) return;
    if (!editForm.customer) { toast.error('Selecione um cliente.'); return; }
    if (editForm.end_date && editForm.start_date && editForm.end_date < editForm.start_date) {
      toast.error('Data de término deve ser após o início.'); return;
    }
    setUpdating(true);
    try {
      const customerId = await resolveCustomerId(editForm.customer);
      await api.patch(`/sales/contracts/${editingContract.id}/`, buildBody(editForm, customerId));
      toast.success('Contrato atualizado!');
      setEditingContract(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao atualizar contrato.');
    } finally {
      setUpdating(false);
    }
  };

  // ── Status actions ───────────────────────────────────────────────────────
  const handleStatusAction = async (contract: Contract, action: 'submit' | 'activate' | 'renew') => {
    const labels: Record<string, string> = {
      submit: 'enviado para assinatura', activate: 'ativado', renew: 'renovado',
    };
    try {
      await api.post(`/sales/contracts/${contract.id}/${action}/`);
      toast.success(action === 'renew' ? 'Contrato renovado! Novo rascunho criado.' : `Contrato ${labels[action]}!`);
      fetchData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao atualizar status.');
    }
  };

  const handleCancelConfirmed = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await api.post(`/sales/contracts/${cancelTarget.id}/cancel/`);
      toast.success('Contrato cancelado.');
      setCancelTarget(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao cancelar contrato.');
    } finally {
      setCancelling(false);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/sales/contracts/${deleteTarget.id}/`);
      toast.success(`Contrato "${deleteTarget.number}" removido.`);
      setDeleteTarget(null);
      fetchData();
    } catch {
      toast.error('Erro ao remover contrato.');
    } finally {
      setDeleting(false);
    }
  };

  const statusTabs = [
    ['', 'Todos'], ['draft', 'Rascunho'], ['pending_signature', 'Aguard. Assinatura'],
    ['active', 'Ativos'], ['renewed', 'Renovados'], ['expired', 'Expirados'], ['cancelled', 'Cancelados'],
  ];

  // ── Shared modal form props ──────────────────────────────────────────────
  const formProps = (form: FormData, setForm: (f: FormData) => void, isEdit: boolean) => ({
    form, setForm, customers, prospects,
    showQuickCreate, setShowQuickCreate, quickCreateName, setQuickCreateName,
    creatingCustomer, onQuickCreate: () => handleQuickCreateCustomer(setForm, form), isEdit,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div />
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors">
          <Plus className="w-5 h-5" /> Novo Contrato
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {loading || !stats ? Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />) : (
          <>
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <ScrollText className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">Total</p>
              </div>
              <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100"><Sensitive>{stats.total_contracts}</Sensitive></p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">Ativos</p>
              </div>
              <p className="text-2xl font-semibold text-green-600"><Sensitive>{stats.active_contracts}</Sensitive></p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-accent-gold" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">MRR</p>
              </div>
              <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100"><Sensitive>{formatCurrency(stats.mrr)}</Sensitive></p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-5 rounded-lg border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-orange-400" />
                <p className="text-gray-500 dark:text-gray-400 text-sm">Vencendo (30d)</p>
              </div>
              <p className={`text-2xl font-semibold ${stats.expiring_contracts > 0 ? 'text-orange-500' : 'text-gray-900 dark:text-gray-100'}`}>
                <Sensitive>{stats.expiring_contracts}</Sensitive>
              </p>
            </div>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
          <input type="text" placeholder="Buscar contrato..." value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-gold/30 focus:border-accent-gold text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {statusTabs.map(([val, label]) => (
            <button key={val} onClick={() => { setFilterStatus(val); setPage(1); }}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                filterStatus === val
                  ? 'bg-accent-gold text-white'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? <TableSkeleton rows={5} cols={7} /> : contracts.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            <ScrollText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Nenhum contrato encontrado</p>
          </div>
        ) : (
          <table className="w-full table-premium">
            <thead>
              <tr>
                <th className="text-left">Contrato</th>
                <th className="text-left">Cliente</th>
                <th className="text-left">Tipo / Cobrança</th>
                <th className="text-left">Valor</th>
                <th className="text-left">Vigência</th>
                <th className="text-left">Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id}>
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100"><Sensitive>{c.title}</Sensitive></p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-mono"><Sensitive>{c.number}</Sensitive></p>
                    {c.proposal_title && <p className="text-xs text-gray-500 dark:text-gray-400">Prop: <Sensitive>{c.proposal_title}</Sensitive></p>}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-900 dark:text-gray-100"><Sensitive>{c.customer_name || '—'}</Sensitive></p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {(c.service_types || []).length > 0
                        ? c.service_types.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-accent-gold/10 text-accent-gold font-medium">{contractTypeLabels[t] || t}</span>)
                        : <p className="text-sm text-gray-900 dark:text-gray-100">{contractTypeLabels[c.contract_type] || c.contract_type}</p>
                      }
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{billingTypeLabels[c.billing_type] || c.billing_type}</p>
                  </td>
                  <td className="px-6 py-4">
                    {c.monthly_value && <p className="text-sm font-medium text-gray-900 dark:text-gray-100"><Sensitive>{formatCurrency(c.monthly_value)}</Sensitive>/mês</p>}
                    {c.hourly_rate && <p className="text-xs text-gray-500 dark:text-gray-400"><Sensitive>{formatCurrency(c.hourly_rate)}</Sensitive>/h</p>}
                    {!c.monthly_value && !c.hourly_rate && <p className="text-sm text-gray-500 dark:text-gray-400">—</p>}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(c.start_date)} →</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(c.end_date)}</p>
                    {c.auto_renew && <span className="text-xs text-green-600 dark:text-green-400">↻ Auto</span>}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${statusColors[c.status] || statusColors.draft}`}>
                      {c.status === 'active' && <span className="dot-pulse bg-green-500" />}
                      {statusLabels[c.status] || c.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 justify-end">
                      {/* Draft → Enviar para assinatura */}
                      {c.status === 'draft' && (
                        <button onClick={() => handleStatusAction(c, 'submit')}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800/30 rounded hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors">
                          <FileSignature className="w-3 h-3" /> Assinar
                        </button>
                      )}
                      {/* Pending → Ativar */}
                      {c.status === 'pending_signature' && (
                        <button onClick={() => handleStatusAction(c, 'activate')}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800/30 rounded hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors">
                          <CheckCircle className="w-3 h-3" /> Ativar
                        </button>
                      )}
                      {/* Active/Pending → Cancelar (com confirmação) */}
                      {(c.status === 'active' || c.status === 'pending_signature') && (
                        <button onClick={() => setCancelTarget(c)}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/30 rounded hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors">
                          <X className="w-3 h-3" /> Cancelar
                        </button>
                      )}
                      {/* Active/Expired → Renovar */}
                      {(c.status === 'expired' || c.status === 'active') && (
                        <button onClick={() => handleStatusAction(c, 'renew')}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/30 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                          <RefreshCw className="w-3 h-3" /> Renovar
                        </button>
                      )}
                      {/* PDF Upload/Download */}
                      {c.contract_file ? (
                        <a href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/sales/contracts/${c.id}/download/`}
                          target="_blank" rel="noopener noreferrer"
                          className="p-1.5 text-green-500 hover:text-green-600 transition-colors" title="Baixar PDF">
                          <Download className="w-4 h-4" />
                        </a>
                      ) : (
                        <label className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-blue-500 transition-colors cursor-pointer" title="Anexar PDF">
                          <Upload className="w-4 h-4" />
                          <input type="file" accept=".pdf" className="hidden" onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try { await api.upload(`/sales/contracts/${c.id}/upload/`, file); toast.success('PDF anexado!'); fetchData(); }
                            catch { toast.error('Erro ao anexar PDF.'); }
                            e.target.value = '';
                          }} />
                        </label>
                      )}
                      {/* Edit */}
                      <button onClick={() => openEdit(c)}
                        className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-accent-gold transition-colors"
                        aria-label="Editar">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {/* Delete — protegido para status críticos */}
                      {!['active', 'pending_signature', 'renewed'].includes(c.status) && (
                        <button onClick={() => setDeleteTarget(c)}
                          className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors"
                          aria-label="Excluir">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && totalPages > 1 && (
        <div className="mt-4">
          <Pagination page={page} totalPages={totalPages} totalItems={total} pageSize={PAGE_SIZE} onChange={setPage} />
        </div>
      )}

      {/* ── Create Modal ─────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <FocusTrap onClose={() => { setShowModal(false); setShowQuickCreate(false); setQuickCreateName(''); }}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto shadow-modal animate-modal-in">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Novo Contrato</h2>
                <button onClick={() => { setShowModal(false); setShowQuickCreate(false); setQuickCreateName(''); }}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" aria-label="Fechar">
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
              <form onSubmit={handleCreate}>
                <ContractForm {...formProps(formData, setFormData, false)} />
                <div className="flex gap-3 pt-6 mt-2">
                  <button type="button" onClick={() => { setShowModal(false); setShowQuickCreate(false); setQuickCreateName(''); }}
                    className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    Cancelar
                  </button>
                  <button type="submit" disabled={saving}
                    className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60">
                    {saving ? 'Salvando...' : 'Criar Contrato'}
                  </button>
                </div>
              </form>
            </div>
          </FocusTrap>
        </div>
      )}

      {/* ── Edit Modal ───────────────────────────────────────────────────── */}
      {editingContract && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <FocusTrap onClose={() => { setEditingContract(null); setShowQuickCreate(false); setQuickCreateName(''); }}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto shadow-modal animate-modal-in">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Editar Contrato</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">{editingContract.number}</p>
                </div>
                <button onClick={() => { setEditingContract(null); setShowQuickCreate(false); setQuickCreateName(''); }}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" aria-label="Fechar">
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              </div>
              <form onSubmit={handleUpdate}>
                <ContractForm {...formProps(editForm, setEditForm, true)} />

                {/* Onboarding data section */}
                {onboardingData && (
                  <div className="mt-4 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOnboardingExpanded(v => !v)}
                      className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <span>Dados do Cadastro (Onboarding)</span>
                      <span className={`transform transition-transform ${onboardingExpanded ? 'rotate-180' : ''}`}>▾</span>
                    </button>
                    {onboardingExpanded && (
                      <div className="px-4 pb-4 text-xs space-y-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                        <div>
                          <p className="font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Empresa</p>
                          <p className="text-gray-900 dark:text-gray-200">{onboardingData.company_legal_name} — CNPJ: {onboardingData.company_cnpj}</p>
                          <p className="text-gray-600 dark:text-gray-400 mt-0.5">
                            {onboardingData.company_street}, {onboardingData.company_number}
                            {onboardingData.company_complement ? ` - ${onboardingData.company_complement}` : ''},
                            {' '}{onboardingData.company_neighborhood}, {onboardingData.company_city}/{onboardingData.company_state} — CEP {onboardingData.company_cep}
                          </p>
                        </div>
                        <div>
                          <p className="font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Representante Legal</p>
                          <p className="text-gray-900 dark:text-gray-200">{onboardingData.rep_full_name} — CPF: {onboardingData.rep_cpf}</p>
                          <p className="text-gray-600 dark:text-gray-400 mt-0.5">{onboardingData.rep_profession} — {onboardingData.rep_marital_status}</p>
                          <p className="text-gray-600 dark:text-gray-400 mt-0.5">
                            {onboardingData.rep_street}, {onboardingData.rep_number}
                            {onboardingData.rep_complement ? ` - ${onboardingData.rep_complement}` : ''},
                            {' '}{onboardingData.rep_neighborhood}, {onboardingData.rep_city}/{onboardingData.rep_state} — CEP {onboardingData.rep_cep}
                          </p>
                        </div>
                        {onboardingData.finance_contact_name && (
                          <div>
                            <p className="font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Setor Financeiro</p>
                            <p className="text-gray-900 dark:text-gray-200">{onboardingData.finance_contact_name}</p>
                            <p className="text-gray-600 dark:text-gray-400 mt-0.5">{onboardingData.finance_contact_phone} — {onboardingData.finance_contact_email}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-3 pt-6 mt-2">
                  <button type="button" onClick={() => { setEditingContract(null); setShowQuickCreate(false); setQuickCreateName(''); }}
                    className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    Cancelar
                  </button>
                  <button type="submit" disabled={updating}
                    className="flex-1 px-4 py-2 bg-accent-gold text-white rounded-lg hover:bg-accent-gold-dark transition-colors disabled:opacity-60">
                    {updating ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>
              </form>
            </div>
          </FocusTrap>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remover Contrato"
        description={`Tem certeza que deseja remover o contrato "${deleteTarget?.number} — ${deleteTarget?.title}"?`}
        confirmLabel={deleting ? 'Removendo...' : 'Remover'}
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        title="Cancelar Contrato"
        description={`Tem certeza que deseja cancelar o contrato "${cancelTarget?.number} — ${cancelTarget?.title}"? Esta ação não pode ser desfeita.`}
        confirmLabel={cancelling ? 'Cancelando...' : 'Confirmar cancelamento'}
        danger
        onConfirm={handleCancelConfirmed}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
