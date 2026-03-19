const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

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

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };

  const config: RequestInit = {
    credentials: 'include',
    ...options,
    headers,
  };

  if (body !== undefined) {
    config.body = JSON.stringify(body);
  }

  const res = await fetch(url.toString(), config);

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

export const api = {
  get: <T = unknown>(endpoint: string, params?: Record<string, string>) =>
    request<T>(endpoint, { method: 'GET', params }),

  post: <T = unknown>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'POST', body }),

  patch: <T = unknown>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'PATCH', body }),

  put: <T = unknown>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'PUT', body }),

  delete: <T = unknown>(endpoint: string) =>
    request<T>(endpoint, { method: 'DELETE' }),
};

export { ApiError };
export default api;
