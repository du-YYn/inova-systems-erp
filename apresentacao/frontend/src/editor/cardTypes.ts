import {
  Brain,
  CheckCircle2,
  Cog,
  Database,
  Diamond,
  Plug,
  Sparkle,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type CardTipo =
  | "trigger"
  | "processamento"
  | "ia"
  | "banco"
  | "integracao"
  | "decisao"
  | "saida"
  | "customizado";

export interface CardTipoMeta {
  tipo: CardTipo;
  label: string;
  descricao: string;
  cor: string;
  icon: LucideIcon;
}

export const CARD_TIPOS: CardTipoMeta[] = [
  { tipo: "trigger",       label: "Trigger / Entrada",    descricao: "Webhook, formulário, agendamento",  cor: "#22c55e", icon: Zap },
  { tipo: "processamento", label: "Processamento",        descricao: "Transformação, validação, lógica",  cor: "#3b82f6", icon: Cog },
  { tipo: "ia",            label: "IA / Agente",          descricao: "GPT, classificação, agente",        cor: "#a855f7", icon: Brain },
  { tipo: "banco",         label: "Banco de Dados",       descricao: "Postgres, Redis, Sheets",           cor: "#64748b", icon: Database },
  { tipo: "integracao",    label: "Integração Externa",   descricao: "API terceiros, Evolution API",      cor: "#f97316", icon: Plug },
  { tipo: "decisao",       label: "Decisão / Condição",   descricao: "if/else, branching",                cor: "#eab308", icon: Diamond },
  { tipo: "saida",         label: "Saída / Resultado",    descricao: "Notificação, lead qualificado",     cor: "#16a34a", icon: CheckCircle2 },
  { tipo: "customizado",   label: "Customizado",          descricao: "Texto livre, destaque narrativo",   cor: "#D4AF37", icon: Sparkle },
];

export const CARD_TIPO_MAP: Record<CardTipo, CardTipoMeta> =
  CARD_TIPOS.reduce((acc, m) => ({ ...acc, [m.tipo]: m }), {} as Record<CardTipo, CardTipoMeta>);
