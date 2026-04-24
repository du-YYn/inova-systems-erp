import { api } from "./client";
import type { Apresentacao, ApresentacaoListItem, Paginated } from "@/types";

export async function listApresentacoes(params?: { search?: string; status?: string }) {
  const { data } = await api.get<Paginated<ApresentacaoListItem>>("/apresentacoes/", { params });
  return data;
}

export async function getApresentacao(id: string) {
  const { data } = await api.get<Apresentacao>(`/apresentacoes/${id}/`);
  return data;
}

export async function createApresentacao(payload: { nome: string; cliente_nome?: string }) {
  const { data } = await api.post<Apresentacao>("/apresentacoes/", payload);
  return data;
}

export async function updateApresentacao(id: string, payload: Partial<Apresentacao>) {
  const { data } = await api.patch<Apresentacao>(`/apresentacoes/${id}/`, payload);
  return data;
}

export async function deleteApresentacao(id: string) {
  await api.delete(`/apresentacoes/${id}/`);
}

export async function duplicarApresentacao(id: string) {
  const { data } = await api.post<Apresentacao>(`/apresentacoes/${id}/duplicar/`);
  return data;
}
