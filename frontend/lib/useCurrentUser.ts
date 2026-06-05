'use client';

import { useEffect, useState, useCallback } from 'react';
import api, { ApiError } from '@/lib/api';

/**
 * Representa o usuário autenticado conforme retornado por GET /accounts/me/.
 * Espelha o UserSerializer do backend (campos read-only do servidor).
 */
export interface CurrentUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  role: 'admin' | 'manager' | 'operator' | 'viewer' | 'partner' | string;
  is_2fa_enabled?: boolean;
  phone?: string;
  avatar?: string | null;
  is_active?: boolean;
}

interface UseCurrentUserResult {
  user: CurrentUser | null;
  role: CurrentUser['role'] | null;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

// Cache em memória por sessão (módulo). Evita múltiplas chamadas paralelas a
// /me/. NUNCA persistir em localStorage: o role é fonte de autorização na UI,
// e localStorage pode ser adulterado pelo usuário/XSS.
let cachedUser: CurrentUser | null = null;
let inflight: Promise<CurrentUser | null> | null = null;

async function fetchMe(): Promise<CurrentUser | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const data = await api.get<CurrentUser>('/accounts/me/');
      cachedUser = data;
      return data;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        cachedUser = null;
        return null;
      }
      throw err;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Hook para obter o usuário autenticado atual a partir do backend.
 * O backend é a única fonte de verdade para `role` — nunca dependa do
 * localStorage para decisões de autorização na UI.
 */
export function useCurrentUser(): UseCurrentUserResult {
  const [user, setUser] = useState<CurrentUser | null>(cachedUser);
  const [loading, setLoading] = useState<boolean>(cachedUser === null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMe();
      setUser(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao carregar usuário';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    cachedUser = null;
    await load();
  }, [load]);

  useEffect(() => {
    if (cachedUser) {
      setUser(cachedUser);
      setLoading(false);
      return;
    }
    void load();
  }, [load]);

  return {
    user,
    role: user?.role ?? null,
    isAdmin: user?.role === 'admin',
    loading,
    error,
    refresh,
  };
}

/**
 * Limpa o cache de usuário em memória. Chamar no logout para evitar que
 * outro usuário herde o cache do anterior.
 */
export function clearCurrentUserCache(): void {
  cachedUser = null;
  inflight = null;
}

export default useCurrentUser;
