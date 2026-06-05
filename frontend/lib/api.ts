const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// S7C2: metodos que precisam de CSRF double-submit token.
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * S7C2: le o cookie `csrftoken` setado pelo backend no login/refresh.
 * Retorna string vazia se nao encontrar — chamadores devem tratar como
 * potencial 403 do backend.
 */
function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';  // SSR
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  params?: Record<string, string>;
}

class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// Token refresh state — prevents multiple simultaneous refresh calls
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function refreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/accounts/refresh/`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureRefresh(): Promise<boolean> {
  if (isRefreshing && refreshPromise) return refreshPromise;
  isRefreshing = true;
  refreshPromise = refreshToken().finally(() => {
    isRefreshing = false;
    refreshPromise = null;
  });
  return refreshPromise;
}

async function request<T = unknown>(
  endpoint: string,
  { body, params, headers: customHeaders, ...options }: RequestOptions = {}
): Promise<T> {
  const url = new URL(`${API_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
  }

  const method = (options.method || 'GET').toUpperCase();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders as Record<string, string>),
  };

  // S7C2: injeta CSRF token em POST/PUT/PATCH/DELETE (backend exige).
  if (UNSAFE_METHODS.has(method)) {
    const csrf = getCsrfToken();
    if (csrf) {
      headers['X-CSRFToken'] = csrf;
    }
  }

  const config: RequestInit = {
    credentials: 'include',
    ...options,
    headers,
  };

  if (body !== undefined) {
    config.body = JSON.stringify(body);
  }

  let res = await fetch(url.toString(), config);

  // Se 401 e não é a própria rota de refresh/login → tenta renovar token
  if (res.status === 401 && !endpoint.includes('/accounts/refresh') && !endpoint.includes('/accounts/login')) {
    const refreshed = await ensureRefresh();
    if (refreshed) {
      // Repete a requisição original com o novo token
      res = await fetch(url.toString(), config);
    } else {
      // Refresh falhou — redireciona para login
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
  }

  if (res.status === 204) {
    return undefined as T;
  }

  if (!res.ok) {
    let errorData: unknown = {};
    try {
      errorData = await res.json();
    } catch {
      // response body is not JSON
    }
    const message =
      typeof errorData === 'object' && errorData !== null
        ? Object.values(errorData as Record<string, unknown>).flat().join(' ')
        : 'Erro na requisição';
    throw new ApiError(message || 'Erro na requisição', res.status, errorData);
  }

  return res.json();
}

async function uploadFile<T = unknown>(endpoint: string, file: File, fieldName = 'contract_file'): Promise<T> {
  const url = `${API_URL}${endpoint}`;
  const form = new FormData();
  form.append(fieldName, file);

  // S7C2: POST de upload tambem precisa de X-CSRFToken header
  const csrf = getCsrfToken();
  const headers: Record<string, string> = csrf ? { 'X-CSRFToken': csrf } : {};

  let res = await fetch(url, { method: 'POST', credentials: 'include', body: form, headers });

  if (res.status === 401 && !endpoint.includes('/accounts/')) {
    const refreshed = await ensureRefresh();
    if (refreshed) {
      // Re-le csrftoken (refresh pode ter rotacionado)
      const csrf2 = getCsrfToken();
      const headers2: Record<string, string> = csrf2 ? { 'X-CSRFToken': csrf2 } : {};
      res = await fetch(url, { method: 'POST', credentials: 'include', body: form, headers: headers2 });
    }
  }

  if (!res.ok) {
    let errorData: unknown = {};
    try { errorData = await res.json(); } catch { /* */ }
    const message = typeof errorData === 'object' && errorData !== null
      ? Object.values(errorData as Record<string, unknown>).flat().join(' ') : 'Erro no upload';
    throw new ApiError(message, res.status, errorData);
  }
  return res.json();
}

export const api = {
  get: <T = unknown>(endpoint: string, params?: Record<string, string>, signal?: AbortSignal) =>
    request<T>(endpoint, { method: 'GET', params, signal }),

  post: <T = unknown>(endpoint: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(endpoint, { method: 'POST', body, signal }),

  patch: <T = unknown>(endpoint: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(endpoint, { method: 'PATCH', body, signal }),

  put: <T = unknown>(endpoint: string, body?: unknown, signal?: AbortSignal) =>
    request<T>(endpoint, { method: 'PUT', body, signal }),

  delete: <T = unknown>(endpoint: string, signal?: AbortSignal) =>
    request<T>(endpoint, { method: 'DELETE', signal }),

  upload: <T = unknown>(endpoint: string, file: File, fieldName?: string) =>
    uploadFile<T>(endpoint, file, fieldName),
};

export { ApiError };
export default api;
