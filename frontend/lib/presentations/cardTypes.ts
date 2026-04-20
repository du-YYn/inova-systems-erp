import {
  Brain, CheckCircle2, Cog, Database, Diamond, Plug, Sparkle, Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CardType } from "./types";

export interface CardTypeMeta {
  tipo: CardType;
  label: string;
  descricao: string;
  cor: string;
  icon: LucideIcon;
}

export const CARD_TYPES: CardTypeMeta[] = [
  { tipo: "trigger",       label: "Trigger / Entrada",    descricao: "Webhook, formulário, agendamento",  cor: "#22c55e", icon: Zap },
  { tipo: "processamento", label: "Processamento",        descricao: "Transformação, validação, lógica",  cor: "#3b82f6", icon: Cog },
  { tipo: "ia",            label: "IA / Agente",          descricao: "GPT, classificação, agente",        cor: "#a855f7", icon: Brain },
  { tipo: "banco",         label: "Banco de Dados",       descricao: "Postgres, Redis, Sheets",           cor: "#64748b", icon: Database },
  { tipo: "integracao",    label: "Integração Externa",   descricao: "API terceiros, Evolution API",      cor: "#f97316", icon: Plug },
  { tipo: "decisao",       label: "Decisão / Condição",   descricao: "if/else, branching",                cor: "#eab308", icon: Diamond },
  { tipo: "saida",         label: "Saída / Resultado",    descricao: "Notificação, lead qualificado",     cor: "#16a34a", icon: CheckCircle2 },
  { tipo: "customizado",   label: "Customizado",          descricao: "Texto livre, destaque narrativo",   cor: "#A6864A", icon: Sparkle },
];

export const CARD_TYPE_MAP: Record<CardType, CardTypeMeta> =
  CARD_TYPES.reduce((acc, m) => ({ ...acc, [m.tipo]: m }), {} as Record<CardType, CardTypeMeta>);

export function defaultCardData(tipo: CardType) {
  return {
    tipo,
    titulo: CARD_TYPE_MAP[tipo].label,
    descricao: "",
    bullets: [] as string[],
    cor_override: null as string | null,
    borda: "media" as const,
    logo_asset_id: null as string | null,
    logo_url: null as string | null,
  };
}
