export type StatusApresentacao = "rascunho" | "publicada" | "arquivada";

export interface Usuario {
  id: number;
  email: string;
  nome: string;
  criado_em: string;
  ultimo_login: string | null;
}

export interface ApresentacaoListItem {
  id: string;
  nome: string;
  cliente_nome: string;
  status: StatusApresentacao;
  thumbnail_url: string;
  criado_em: string;
  atualizado_em: string;
  publicado_em: string | null;
  total_views: number;
  total_links: number;
}

export interface Apresentacao extends ApresentacaoListItem {
  canvas_json: Record<string, unknown>;
  timeline_json: Record<string, unknown>;
  config_json: Record<string, unknown>;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
