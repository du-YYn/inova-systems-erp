// Mapeamento de service_interest do Prospect → proposal_type da Proposta
const SERVICE_TO_PROPOSAL_TYPE: Record<string, string> = {
  software_dev:  'software_dev',
  mobile:        'software_dev',
  site:          'software_dev',
  e_commerce:    'software_dev',
  landing_page:  'software_dev',
  erp:           'software_dev',
  integration:   'software_dev',
  automation:    'automation',
  ai:            'ai',
  consulting:    'consulting',
  support:       'support',
};

// Label curta do serviço para compor o título
const SERVICE_SHORT_LABEL: Record<string, string> = {
  software_dev:  'Sistema Web',
  mobile:        'Aplicativo Mobile',
  site:          'Site Institucional',
  e_commerce:    'E-commerce',
  landing_page:  'Landing Page',
  erp:           'ERP',
  integration:   'Integração de Sistemas',
  automation:    'Automação',
  ai:            'Inteligência Artificial',
  consulting:    'Consultoria',
  support:       'Suporte',
};

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

interface ProspectLike {
  company_name: string;
  service_interest: string[];
  estimated_value?: number;
  description?: string;
  meeting_transcript?: string;
  usage_type?: string;
}

export interface ProposalDefaults {
  title: string;
  proposal_type: string;
  billing_type: string;
  total_value: string;
  valid_until: string;
  notes: string;
}

export function buildProposalDefaults(prospect: ProspectLike): ProposalDefaults {
  const interests = Array.isArray(prospect.service_interest) ? prospect.service_interest : [];

  // proposal_type: 1 serviço → mapear; 2+ → mixed
  const proposal_type =
    interests.length === 1
      ? (SERVICE_TO_PROPOSAL_TYPE[interests[0]] ?? 'software_dev')
      : interests.length > 1
      ? 'mixed'
      : 'software_dev';

  // title: "Proposta {Serviço} – {Empresa}" ou multi-serviços
  const serviceLabel =
    interests.length === 1
      ? (SERVICE_SHORT_LABEL[interests[0]] ?? 'Solução')
      : interests.length > 1
      ? interests.slice(0, 2).map(s => SERVICE_SHORT_LABEL[s] ?? s).join(' + ')
      : 'Solução';
  const title = `Proposta ${serviceLabel} – ${prospect.company_name}`;

  // total_value: usar estimated_value do prospect
  const total_value = prospect.estimated_value ? String(prospect.estimated_value) : '';

  // valid_until: hoje + 30 dias
  const valid_until = formatDate(addDays(new Date(), 30));

  // notes: meeting_transcript > description > vazio
  const notes = prospect.meeting_transcript || prospect.description || '';

  // billing_type: heurística por usage_type (default fixed)
  const billing_type =
    prospect.usage_type === 'commercial' ? 'monthly' : 'fixed';

  return { title, proposal_type, billing_type, total_value, valid_until, notes };
}
