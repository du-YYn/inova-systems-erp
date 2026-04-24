import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuth } from "@/store/auth";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

export const api = axios.create({
  baseURL: BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = useAuth.getState().access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

let refreshing: Promise<string | null> | null = null;

async function refreshAccess(): Promise<string | null> {
  const { refresh, setAccess, logout } = useAuth.getState();
  if (!refresh) { logout(); return null; }
  try {
    const res = await axios.post(`${BASE_URL}/auth/refresh/`, { refresh });
    const access = res.data.access as string;
    setAccess(access);
    return access;
  } catch {
    logout();
    return null;
  }
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as RetryConfig | undefined;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      refreshing ??= refreshAccess().finally(() => { refreshing = null; });
      const newAccess = await refreshing;
      if (newAccess) {
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  }
);
