import { api } from "./client";
import type { Usuario } from "@/types";

export async function login(email: string, password: string) {
  const { data } = await api.post<{ access: string; refresh: string; usuario: Usuario }>(
    "/auth/login/",
    { email, password }
  );
  return data;
}

export async function fetchMe() {
  const { data } = await api.get<Usuario>("/me/");
  return data;
}
