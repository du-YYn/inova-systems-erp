'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Building2, User, MapPin, Loader2, CheckCircle2, AlertCircle,
  Search, FileText, Landmark,
} from 'lucide-react';
import { isValidCPF, isValidCNPJ, formatCPF, formatCNPJ, formatCEP, formatPhone } from '@/lib/validators';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// Resolve a URL base para chamadas à API do onboarding.
// No ERP (erp.inovasystemssolutions.com) usa a API direta.
// No subdomínio (cadastro.inovasystemssolutions.com) usa proxy Next.js para evitar CORS.
function getOnboardingUrl(token: string): string {
  if (typeof window !== 'undefined' && window.location.hostname === 'cadastro.inovasystemssolutions.com') {
    return `/api/onboarding/${token}`;
  }
  return `${API_URL}/sales/onboarding/public/${token}/`;
}

interface OnboardingData {
  public_token: string;
  status: string;
  prospect_company_name: string;
  company_legal_name: string;
  company_cnpj: string;
  company_street: string;
  company_number: string;
  company_complement: string;
  company_neighborhood: string;
  company_city: string;
  company_state: string;
  company_cep: string;
  rep_full_name: string;
  rep_marital_status: string;
  rep_profession: string;
  rep_cpf: string;
  rep_street: string;
  rep_number: string;
  rep_complement: string;
  rep_neighborhood: string;
  rep_city: string;
  rep_state: string;
  rep_cep: string;
  finance_contact_name: string;
  finance_contact_phone: string;
  finance_contact_email: string;
}

const MARITAL_OPTIONS = [
  { value: 'solteiro', label: 'Solteiro(a)' },
  { value: 'casado', label: 'Casado(a)' },
  { value: 'divorciado', label: 'Divorciado(a)' },
  { value: 'viuvo', label: 'Viúvo(a)' },
  { value: 'separado', label: 'Separado(a)' },
  { value: 'uniao_estavel', label: 'União Estável' },
];

const BR_STATES = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

type FormErrors = Partial<Record<keyof OnboardingData, string>>;

export default function OnboardingPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [companyName, setCompanyName] = useState('');
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [lookingUpCep, setLookingUpCep] = useState<'company' | 'rep' | null>(null);

  const [form, setForm] = useState<Omit<OnboardingData, 'public_token' | 'status' | 'prospect_company_name'>>({
    company_legal_name: '',
    company_cnpj: '',
    company_street: '',
    company_number: '',
    company_complement: '',
    company_neighborhood: '',
    company_city: '',
    company_state: '',
    company_cep: '',
    rep_full_name: '',
    rep_marital_status: '',
    rep_profession: '',
    rep_cpf: '',
    rep_street: '',
    rep_number: '',
    rep_complement: '',
    rep_neighborhood: '',
    rep_city: '',
    rep_state: '',
    rep_cep: '',
    finance_contact_name: '',
    finance_contact_phone: '',
    finance_contact_email: '',
  });

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch(getOnboardingUrl(token));
        if (res.status === 404) {
          setError('Formulário não encontrado.');
          setLoading(false);
          return;
        }
        if (!res.ok) {
          setError('Erro ao carregar formulário.');
          setLoading(false);
          return;
        }
        const data: OnboardingData = await res.json();
        setCompanyName(data.prospect_company_name || '');
        if (data.status !== 'pending') {
          setAlreadySubmitted(true);
          setLoading(false);
          return;
        }
        // Pre-fill existing data
        const { public_token, status, prospect_company_name, ...formFields } = data;
        setForm(prev => {
          const updated = { ...prev };
          for (const [key, value] of Object.entries(formFields)) {
            if (value && key in updated) {
              (updated as Record<string, string>)[key] = value;
            }
          }
          return updated;
        });
      } catch {
        setError('Erro de conexão. Tente novamente.');
      }
      setLoading(false);
    }
    loadData();
  }, [token]);

  const handleChange = (field: string, value: string) => {
    let formatted = value;
    if (field === 'company_cnpj') formatted = formatCNPJ(value);
    else if (field === 'rep_cpf') formatted = formatCPF(value);
    else if (field === 'company_cep' || field === 'rep_cep') formatted = formatCEP(value);
    else if (field === 'finance_contact_phone') formatted = formatPhone(value);

    setForm(prev => ({ ...prev, [field]: formatted }));
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const lookupCep = useCallback(async (type: 'company' | 'rep') => {
    const cepField = type === 'company' ? 'company_cep' : 'rep_cep';
    const cep = form[cepField].replace(/\D/g, '');
    if (cep.length !== 8) return;

    setLookingUpCep(type);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      if (data.erro) {
        setErrors(prev => ({ ...prev, [cepField]: 'CEP não encontrado.' }));
        setLookingUpCep(null);
        return;
      }
      const prefix = type === 'company' ? 'company_' : 'rep_';
      setForm(prev => ({
        ...prev,
        [`${prefix}street`]: data.logradouro || prev[`${prefix}street` as keyof typeof prev],
        [`${prefix}neighborhood`]: data.bairro || prev[`${prefix}neighborhood` as keyof typeof prev],
        [`${prefix}city`]: data.localidade || prev[`${prefix}city` as keyof typeof prev],
        [`${prefix}state`]: data.uf || prev[`${prefix}state` as keyof typeof prev],
      }));
    } catch {
      setErrors(prev => ({ ...prev, [cepField]: 'Erro ao buscar CEP.' }));
    }
    setLookingUpCep(null);
  }, [form]);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    // Company
    if (!form.company_legal_name.trim()) newErrors.company_legal_name = 'Razão Social é obrigatória.';
    if (!form.company_cnpj.trim()) newErrors.company_cnpj = 'CNPJ é obrigatório.';
    else if (!isValidCNPJ(form.company_cnpj)) newErrors.company_cnpj = 'CNPJ inválido.';
    if (!form.company_street.trim()) newErrors.company_street = 'Endereço é obrigatório.';
    if (!form.company_number.trim()) newErrors.company_number = 'Número é obrigatório.';
    if (!form.company_complement.trim()) newErrors.company_complement = 'Complemento é obrigatório.';
    if (!form.company_neighborhood.trim()) newErrors.company_neighborhood = 'Bairro é obrigatório.';
    if (!form.company_city.trim()) newErrors.company_city = 'Cidade é obrigatória.';
    if (!form.company_state.trim()) newErrors.company_state = 'Estado é obrigatório.';
    if (!form.company_cep.trim()) newErrors.company_cep = 'CEP é obrigatório.';
    // Representative
    if (!form.rep_full_name.trim()) newErrors.rep_full_name = 'Nome é obrigatório.';
    if (!form.rep_marital_status) newErrors.rep_marital_status = 'Estado civil é obrigatório.';
    if (!form.rep_profession.trim()) newErrors.rep_profession = 'Profissão é obrigatória.';
    if (!form.rep_cpf.trim()) newErrors.rep_cpf = 'CPF é obrigatório.';
    else if (!isValidCPF(form.rep_cpf)) newErrors.rep_cpf = 'CPF inválido.';
    if (!form.rep_street.trim()) newErrors.rep_street = 'Endereço é obrigatório.';
    if (!form.rep_number.trim()) newErrors.rep_number = 'Número é obrigatório.';
    if (!form.rep_complement.trim()) newErrors.rep_complement = 'Complemento é obrigatório.';
    if (!form.rep_neighborhood.trim()) newErrors.rep_neighborhood = 'Bairro é obrigatório.';
    if (!form.rep_city.trim()) newErrors.rep_city = 'Cidade é obrigatória.';
    if (!form.rep_state.trim()) newErrors.rep_state = 'Estado é obrigatório.';
    if (!form.rep_cep.trim()) newErrors.rep_cep = 'CEP é obrigatório.';
    // Finance
    if (!form.finance_contact_name.trim()) newErrors.finance_contact_name = 'Nome é obrigatório.';
    if (!form.finance_contact_phone.trim()) newErrors.finance_contact_phone = 'Telefone é obrigatório.';
    if (!form.finance_contact_email.trim()) newErrors.finance_contact_email = 'E-mail é obrigatório.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.finance_contact_email)) newErrors.finance_contact_email = 'E-mail inválido.';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      // Scroll to first error
      const firstError = document.querySelector('[data-error="true"]');
      firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(getOnboardingUrl(token), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSubmitted(true);
      } else if (data.error) {
        setError(data.error);
      } else {
        // Field-level errors from backend
        const backendErrors: FormErrors = {};
        for (const [key, value] of Object.entries(data)) {
          if (Array.isArray(value)) {
            backendErrors[key as keyof FormErrors] = value[0] as string;
          } else if (typeof value === 'string') {
            backendErrors[key as keyof FormErrors] = value;
          }
        }
        setErrors(backendErrors);
      }
    } catch {
      setError('Erro de conexão. Tente novamente.');
    }
    setSubmitting(false);
  };

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#A6864A] animate-spin" />
      </div>
    );
  }

  // ── Error state ──
  if (error && !Object.keys(errors).length) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="bg-[#111] border border-red-900/50 rounded-2xl p-8 max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-white text-xl font-semibold mb-2">Erro</h2>
          <p className="text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  // ── Already submitted ──
  if (alreadySubmitted) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="bg-[#111] border border-[#A6864A]/30 rounded-2xl p-8 max-w-md w-full text-center">
          <CheckCircle2 className="w-12 h-12 text-[#A6864A] mx-auto mb-4" />
          <h2 className="text-white text-xl font-semibold mb-2">Formulário já preenchido</h2>
          <p className="text-gray-400">
            Os dados de <span className="text-[#A6864A] font-medium">{companyName}</span> já foram enviados.
          </p>
        </div>
      </div>
    );
  }

  // ── Success state ──
  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <div className="bg-[#111] border border-[#A6864A]/30 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-[#A6864A]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10 text-[#A6864A]" />
          </div>
          <h2 className="text-white text-xl font-semibold mb-2">Dados enviados com sucesso!</h2>
          <p className="text-gray-400">
            Obrigado! Os dados de <span className="text-[#A6864A] font-medium">{companyName}</span> foram recebidos.
            Nossa equipe entrará em contato em breve.
          </p>
        </div>
      </div>
    );
  }

  // ── Form ──
  return (
    <div className="min-h-screen bg-[#0a0a0a] py-8 px-4">
      {/* Header */}
      <div className="max-w-3xl mx-auto mb-8 text-center">
        <h1 className="text-3xl font-bold text-[#A6864A] mb-1">Inova.</h1>
        <p className="text-gray-500 text-sm">Systems Solutions</p>
        <div className="mt-6">
          <div className="inline-flex items-center gap-2 bg-[#111] border border-[#A6864A]/20 rounded-full px-4 py-2">
            <FileText className="w-4 h-4 text-[#A6864A]" />
            <span className="text-gray-300 text-sm">
              Cadastro — <span className="text-[#A6864A] font-medium">{companyName}</span>
            </span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
        {/* ── Seção 1: Dados da Empresa ── */}
        <section className="bg-[#111] border border-[#1a1a1a] rounded-2xl overflow-hidden">
          <div className="border-b border-[#A6864A]/20 px-6 py-4 flex items-center gap-3">
            <div className="w-8 h-8 bg-[#A6864A]/10 rounded-lg flex items-center justify-center">
              <Building2 className="w-4 h-4 text-[#A6864A]" />
            </div>
            <div>
              <h2 className="text-white font-semibold">Dados da Empresa</h2>
              <p className="text-gray-500 text-xs">Contratante</p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <Field
              label="Razão Social"
              required
              value={form.company_legal_name}
              onChange={v => handleChange('company_legal_name', v)}
              error={errors.company_legal_name}
              placeholder="Nome oficial da empresa"
            />
            <Field
              label="CNPJ"
              required
              value={form.company_cnpj}
              onChange={v => handleChange('company_cnpj', v)}
              error={errors.company_cnpj}
              placeholder="00.000.000/0000-00"
              maxLength={18}
            />
            <div className="border-t border-[#1a1a1a] pt-4 mt-4">
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-gray-500" />
                <span className="text-gray-400 text-sm font-medium">Endereço da Empresa</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <Field
                    label="CEP"
                    required
                    value={form.company_cep}
                    onChange={v => handleChange('company_cep', v)}
                    onBlur={() => lookupCep('company')}
                    error={errors.company_cep}
                    placeholder="00000-000"
                    maxLength={9}
                    suffix={
                      <button
                        type="button"
                        onClick={() => lookupCep('company')}
                        disabled={lookingUpCep === 'company'}
                        className="text-[#A6864A] hover:text-[#c9a75e] transition-colors"
                        title="Buscar CEP"
                      >
                        {lookingUpCep === 'company' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Search className="w-4 h-4" />
                        )}
                      </button>
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-4">
                <div className="sm:col-span-3">
                  <Field
                    label="Rua / Avenida"
                    required
                    value={form.company_street}
                    onChange={v => handleChange('company_street', v)}
                    error={errors.company_street}
                  />
                </div>
                <Field
                  label="Número"
                  required
                  value={form.company_number}
                  onChange={v => handleChange('company_number', v)}
                  error={errors.company_number}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <Field
                  label="Complemento"
                  required
                  value={form.company_complement}
                  onChange={v => handleChange('company_complement', v)}
                  error={errors.company_complement}
                  placeholder="Sala, andar, bloco..."
                />
                <Field
                  label="Bairro"
                  required
                  value={form.company_neighborhood}
                  onChange={v => handleChange('company_neighborhood', v)}
                  error={errors.company_neighborhood}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                <div className="sm:col-span-2">
                  <Field
                    label="Cidade"
                    required
                    value={form.company_city}
                    onChange={v => handleChange('company_city', v)}
                    error={errors.company_city}
                  />
                </div>
                <SelectField
                  label="Estado"
                  required
                  value={form.company_state}
                  onChange={v => handleChange('company_state', v)}
                  error={errors.company_state}
                  options={BR_STATES.map(s => ({ value: s, label: s }))}
                  placeholder="UF"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Seção 2: Representante Legal ── */}
        <section className="bg-[#111] border border-[#1a1a1a] rounded-2xl overflow-hidden">
          <div className="border-b border-[#A6864A]/20 px-6 py-4 flex items-center gap-3">
            <div className="w-8 h-8 bg-[#A6864A]/10 rounded-lg flex items-center justify-center">
              <User className="w-4 h-4 text-[#A6864A]" />
            </div>
            <div>
              <h2 className="text-white font-semibold">Representante Legal</h2>
              <p className="text-gray-500 text-xs">Pessoa autorizada a assinar pelo contratante</p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <Field
              label="Nome Completo"
              required
              value={form.rep_full_name}
              onChange={v => handleChange('rep_full_name', v)}
              error={errors.rep_full_name}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SelectField
                label="Estado Civil"
                required
                value={form.rep_marital_status}
                onChange={v => handleChange('rep_marital_status', v)}
                error={errors.rep_marital_status}
                options={MARITAL_OPTIONS}
                placeholder="Selecione..."
              />
              <Field
                label="Profissão"
                required
                value={form.rep_profession}
                onChange={v => handleChange('rep_profession', v)}
                error={errors.rep_profession}
                placeholder="Ex: Empresário, Administrador"
              />
            </div>
            <Field
              label="CPF"
              required
              value={form.rep_cpf}
              onChange={v => handleChange('rep_cpf', v)}
              error={errors.rep_cpf}
              placeholder="000.000.000-00"
              maxLength={14}
            />
            <div className="border-t border-[#1a1a1a] pt-4 mt-4">
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-gray-500" />
                <span className="text-gray-400 text-sm font-medium">Endereço do Representante</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <Field
                    label="CEP"
                    required
                    value={form.rep_cep}
                    onChange={v => handleChange('rep_cep', v)}
                    onBlur={() => lookupCep('rep')}
                    error={errors.rep_cep}
                    placeholder="00000-000"
                    maxLength={9}
                    suffix={
                      <button
                        type="button"
                        onClick={() => lookupCep('rep')}
                        disabled={lookingUpCep === 'rep'}
                        className="text-[#A6864A] hover:text-[#c9a75e] transition-colors"
                        title="Buscar CEP"
                      >
                        {lookingUpCep === 'rep' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Search className="w-4 h-4" />
                        )}
                      </button>
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-4">
                <div className="sm:col-span-3">
                  <Field
                    label="Rua / Avenida"
                    required
                    value={form.rep_street}
                    onChange={v => handleChange('rep_street', v)}
                    error={errors.rep_street}
                  />
                </div>
                <Field
                  label="Número"
                  required
                  value={form.rep_number}
                  onChange={v => handleChange('rep_number', v)}
                  error={errors.rep_number}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <Field
                  label="Complemento"
                  required
                  value={form.rep_complement}
                  onChange={v => handleChange('rep_complement', v)}
                  error={errors.rep_complement}
                  placeholder="Apt, bloco..."
                />
                <Field
                  label="Bairro"
                  required
                  value={form.rep_neighborhood}
                  onChange={v => handleChange('rep_neighborhood', v)}
                  error={errors.rep_neighborhood}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                <div className="sm:col-span-2">
                  <Field
                    label="Cidade"
                    required
                    value={form.rep_city}
                    onChange={v => handleChange('rep_city', v)}
                    error={errors.rep_city}
                  />
                </div>
                <SelectField
                  label="Estado"
                  required
                  value={form.rep_state}
                  onChange={v => handleChange('rep_state', v)}
                  error={errors.rep_state}
                  options={BR_STATES.map(s => ({ value: s, label: s }))}
                  placeholder="UF"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Seção 3: Setor Financeiro ── */}
        <section className="bg-[#111] border border-[#1a1a1a] rounded-2xl overflow-hidden">
          <div className="border-b border-[#A6864A]/20 px-6 py-4 flex items-center gap-3">
            <div className="w-8 h-8 bg-[#A6864A]/10 rounded-lg flex items-center justify-center">
              <Landmark className="w-4 h-4 text-[#A6864A]" />
            </div>
            <div>
              <h2 className="text-white font-semibold">Setor Financeiro</h2>
              <p className="text-gray-500 text-xs">Contato para assuntos financeiros e faturamento</p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <Field
              label="Nome Completo"
              required
              value={form.finance_contact_name}
              onChange={v => handleChange('finance_contact_name', v)}
              error={errors.finance_contact_name}
              placeholder="Nome do responsável financeiro"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Telefone"
                required
                value={form.finance_contact_phone}
                onChange={v => handleChange('finance_contact_phone', v)}
                error={errors.finance_contact_phone}
                placeholder="(00) 00000-0000"
                maxLength={15}
              />
              <Field
                label="E-mail"
                required
                value={form.finance_contact_email}
                onChange={v => handleChange('finance_contact_email', v)}
                error={errors.finance_contact_email}
                placeholder="financeiro@empresa.com"
              />
            </div>
          </div>
        </section>

        {/* ── Submit ── */}
        {error && (
          <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-4 bg-gradient-to-r from-[#A6864A] to-[#c9a75e] text-white font-semibold rounded-xl hover:from-[#c9a75e] hover:to-[#A6864A] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Enviando...
            </>
          ) : (
            'Enviar Dados'
          )}
        </button>

        <p className="text-center text-gray-600 text-xs pb-4">
          Seus dados serão utilizados exclusivamente para a geração do contrato de prestação de serviços.
        </p>
      </form>
    </div>
  );
}


// ── Field Component ──
function Field({
  label, required, value, onChange, onBlur, error, placeholder, maxLength, suffix,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  error?: string;
  placeholder?: string;
  maxLength?: number;
  suffix?: React.ReactNode;
}) {
  return (
    <div data-error={!!error}>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">
        {label}
        {required && <span className="text-[#A6864A] ml-0.5">*</span>}
      </label>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          maxLength={maxLength}
          className={`w-full bg-[#0a0a0a] border-2 rounded-xl px-4 py-3 text-white placeholder-gray-600 transition-all duration-200 outline-none ${
            error
              ? 'border-red-500 focus:border-red-400'
              : 'border-[#222] focus:border-[#A6864A] focus:shadow-lg focus:shadow-[#A6864A]/10'
          } ${suffix ? 'pr-10' : ''}`}
        />
        {suffix && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {suffix}
          </div>
        )}
      </div>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}


// ── Select Field Component ──
function SelectField({
  label, required, value, onChange, error, options, placeholder,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <div data-error={!!error}>
      <label className="block text-sm font-medium text-gray-300 mb-1.5">
        {label}
        {required && <span className="text-[#A6864A] ml-0.5">*</span>}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full bg-[#0a0a0a] border-2 rounded-xl px-4 py-3 text-white transition-all duration-200 outline-none appearance-none ${
          error
            ? 'border-red-500 focus:border-red-400'
            : 'border-[#222] focus:border-[#A6864A] focus:shadow-lg focus:shadow-[#A6864A]/10'
        } ${!value ? 'text-gray-600' : ''}`}
      >
        <option value="" className="text-gray-600">{placeholder || 'Selecione...'}</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value} className="text-white bg-[#111]">
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}
