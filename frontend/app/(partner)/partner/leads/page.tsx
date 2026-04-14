'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Send, X, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { formatPhone } from '@/lib/validators';

interface Lead {
  id: number;
  company_name: string;
  status: string;
  status_label: string;
  estimated_value: number;
  created_at: string;
}

const SERVICE_OPTIONS = [
  { value: 'software_dev', label: 'Sistema Web' },
  { value: 'mobile', label: 'Aplicativo Mobile' },
  { value: 'site', label: 'Site Institucional' },
  { value: 'e_commerce', label: 'E-commerce' },
  { value: 'landing_page', label: 'Landing Page' },
  { value: 'automation', label: 'Automação' },
  { value: 'ai', label: 'Inteligência Artificial' },
  { value: 'erp', label: 'ERP / Gestão' },
  { value: 'integration', label: 'Integração' },
  { value: 'consulting', label: 'Consultoria' },
  { value: 'support', label: 'Suporte' },
];

const STATUS_COLORS: Record<string, string> = {
  'Em análise': 'bg-blue-900/30 text-blue-400 border-blue-800/30',
  'Em negociação': 'bg-yellow-900/30 text-yellow-400 border-yellow-800/30',
  'Fechado': 'bg-green-900/30 text-green-400 border-green-800/30',
  'Concluído': 'bg-emerald-900/30 text-emerald-400 border-emerald-800/30',
  'Não fechou': 'bg-red-900/30 text-red-400 border-red-800/30',
  'Acompanhamento': 'bg-orange-900/30 text-orange-400 border-orange-800/30',
};

export default function PartnerLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    company_name: '', contact_name: '', contact_email: '',
    contact_phone: '', description: '', service_interest: '' as string,
  });

  const fetchLeads = useCallback(async () => {
    try {
      const data = await api.get<Lead[]>('/sales/partner/leads/');
      setLeads(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company_name.trim() || !form.contact_name.trim() || !form.contact_email.trim()) return;
    setSaving(true);
    try {
      await api.post('/sales/partner/leads/', {
        ...form,
        service_interest: form.service_interest ? [form.service_interest] : [],
      });
      setShowModal(false);
      setForm({ company_name: '', contact_name: '', contact_email: '', contact_phone: '', description: '', service_interest: '' });
      fetchLeads();
    } catch { /* ignore */ }
    setSaving(false);
  };

  const daysSince = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    return Math.floor(diff / 86400000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-[#A6864A] animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-100">Indicações</h2>
          <p className="text-sm text-gray-500 mt-0.5">{leads.length} lead{leads.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Botão Nova Indicação — full width no mobile */}
      <button
        onClick={() => setShowModal(true)}
        className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3.5 bg-gradient-to-r from-[#A6864A] to-[#c9a75e] text-white font-semibold rounded-xl mb-6 active:scale-[0.97] transition-transform"
      >
        <Plus className="w-5 h-5" />
        Nova Indicação
      </button>

      {/* Lista de leads */}
      {leads.length === 0 ? (
        <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-8 text-center">
          <Send className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 font-medium">Nenhuma indicação ainda</p>
          <p className="text-gray-600 text-sm mt-1">Clique em &ldquo;Nova Indicação&rdquo; para começar</p>
        </div>
      ) : (
        <div className="space-y-2">
          {leads.map(lead => (
            <div key={lead.id} className="bg-[#111] border border-[#1a1a1a] rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-gray-200">{lead.company_name}</p>
                <span className="text-xs text-gray-600">{daysSince(lead.created_at)}d</span>
              </div>
              <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_COLORS[lead.status_label] || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                {lead.status_label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Modal Nova Indicação — full screen no mobile */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
          <div className="bg-[#111] w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#111] border-b border-[#1a1a1a] px-5 py-4 flex items-center justify-between z-10">
              <h3 className="text-lg font-bold text-gray-100">Nova Indicação</h3>
              <button onClick={() => setShowModal(false)} className="p-2 text-gray-500 hover:text-gray-300 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Empresa *</label>
                <input
                  type="text" required value={form.company_name}
                  onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                  placeholder="Nome da empresa"
                  className="w-full bg-[#0a0a0a] border-2 border-[#222] rounded-xl px-4 py-3.5 text-base text-white placeholder-gray-600 focus:border-[#A6864A] focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Nome do contato *</label>
                <input
                  type="text" required value={form.contact_name}
                  onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                  placeholder="Nome completo"
                  className="w-full bg-[#0a0a0a] border-2 border-[#222] rounded-xl px-4 py-3.5 text-base text-white placeholder-gray-600 focus:border-[#A6864A] focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">E-mail *</label>
                <input
                  type="email" required value={form.contact_email}
                  inputMode="email"
                  onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))}
                  placeholder="email@empresa.com"
                  className="w-full bg-[#0a0a0a] border-2 border-[#222] rounded-xl px-4 py-3.5 text-base text-white placeholder-gray-600 focus:border-[#A6864A] focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">WhatsApp</label>
                <input
                  type="tel" value={form.contact_phone} inputMode="tel"
                  onChange={e => setForm(f => ({ ...f, contact_phone: formatPhone(e.target.value) }))}
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                  className="w-full bg-[#0a0a0a] border-2 border-[#222] rounded-xl px-4 py-3.5 text-base text-white placeholder-gray-600 focus:border-[#A6864A] focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Serviço de interesse</label>
                <select
                  value={form.service_interest}
                  onChange={e => setForm(f => ({ ...f, service_interest: e.target.value }))}
                  className="w-full bg-[#0a0a0a] border-2 border-[#222] rounded-xl px-4 py-3.5 text-base text-white focus:border-[#A6864A] focus:outline-none transition-colors appearance-none"
                >
                  <option value="">Selecione...</option>
                  {SERVICE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Descrição</label>
                <textarea
                  rows={3} value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Descreva brevemente a necessidade do cliente..."
                  className="w-full bg-[#0a0a0a] border-2 border-[#222] rounded-xl px-4 py-3.5 text-base text-white placeholder-gray-600 focus:border-[#A6864A] focus:outline-none transition-colors resize-none"
                />
              </div>
              <button
                type="submit" disabled={saving}
                className="w-full py-4 bg-gradient-to-r from-[#A6864A] to-[#c9a75e] text-white font-semibold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                {saving ? 'Enviando...' : 'Enviar Indicação'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
