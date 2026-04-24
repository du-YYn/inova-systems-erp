import axios from "axios";
import type { Usuario } from "@/types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

interface ExchangeResponse {
  access: string;
  refresh: string;
  usuario: Usuario;
}

export async function ssoExchange(token: string): Promise<ExchangeResponse> {
  const { data } = await axios.post<ExchangeResponse>(
    `${BASE_URL}/sso/exchange/`,
    { token },
  );
  return data;
}
