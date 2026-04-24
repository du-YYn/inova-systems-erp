import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

const publicApi = axios.create({ baseURL: BASE_URL });

export interface PublicMeta {
  nome: string;
  cliente_nome: string;
  precisa_senha: boolean;
  rotulo: string;
  thumbnail_url: string | null;
}

export interface PublicContent {
  sessao_id: number;
  nome: string;
  cliente_nome: string;
  canvas_json: Record<string, unknown>;
  timeline_json: Record<string, unknown>;
  config_json: Record<string, unknown>;
}

export async function fetchPublicMeta(token: string): Promise<PublicMeta> {
  const { data } = await publicApi.get<PublicMeta>(`/public/${token}/meta/`);
  return data;
}

export async function fetchPublicContent(token: string): Promise<PublicContent> {
  const { data } = await publicApi.get<PublicContent>(`/public/${token}/content/`);
  return data;
}

export async function unlockPublic(token: string, senha: string): Promise<PublicContent> {
  const { data } = await publicApi.post<PublicContent>(`/public/${token}/unlock/`, { senha });
  return data;
}

export async function heartbeatPublic(token: string, sessao_id: number, duracao_segundos: number) {
  try {
    await publicApi.post(`/public/${token}/heartbeat/`, { sessao_id, duracao_segundos });
  } catch {
    /* ignore */
  }
}
