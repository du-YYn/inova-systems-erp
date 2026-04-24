import { api } from "./client";
import type { Paginated } from "@/types";

export interface LinkPublico {
  id: string;
  apresentacao: string;
  token: string;
  rotulo: string;
  ativo: boolean;
  expira_em: string | null;
  total_views: number;
  ultimo_acesso: string | null;
  criado_em: string;
  revogado_em: string | null;
  protegido_por_senha: boolean;
}

export async function listLinks(apresentacaoId: string) {
  const { data } = await api.get<Paginated<LinkPublico>>("/links/", {
    params: { apresentacao: apresentacaoId },
  });
  return data;
}

export async function createLink(payload: {
  apresentacao: string;
  rotulo: string;
  senha?: string | null;
  expira_em?: string | null;
}) {
  const { data } = await api.post<LinkPublico>("/links/", payload);
  return data;
}

export async function updateLink(id: string, payload: Partial<{
  rotulo: string;
  ativo: boolean;
  senha: string | null;
  expira_em: string | null;
}>) {
  const { data } = await api.patch<LinkPublico>(`/links/${id}/`, payload);
  return data;
}

export async function revokeLink(id: string) {
  const { data } = await api.post<LinkPublico>(`/links/${id}/revogar/`);
  return data;
}

export async function deleteLink(id: string) {
  await api.delete(`/links/${id}/`);
}
