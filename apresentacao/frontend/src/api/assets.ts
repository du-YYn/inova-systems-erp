import { api } from "./client";
import type { Paginated } from "@/types";

export interface Asset {
  id: string;
  nome: string;
  tipo: "logo" | "imagem" | "icone";
  arquivo: string;
  tamanho_bytes: number;
  criado_em: string;
}

export async function listAssets() {
  const { data } = await api.get<Paginated<Asset>>("/assets/");
  return data;
}

export async function uploadAsset(file: File, tipo: Asset["tipo"] = "logo") {
  const form = new FormData();
  form.append("nome", file.name);
  form.append("tipo", tipo);
  form.append("arquivo", file);
  const { data } = await api.post<Asset>("/assets/", form);
  return data;
}

export async function deleteAsset(id: string) {
  await api.delete(`/assets/${id}/`);
}
