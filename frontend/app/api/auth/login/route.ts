import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URLS = [
  process.env.NEXT_PUBLIC_API_URL,
  process.env.INTERNAL_API_URL,
  'http://backend:8000/api/v1',
  'http://grupo_ry_inova-erp_backend:8000/api/v1',
].filter(Boolean) as string[];

// POST /api/auth/login — proxy para login no subdomínio parceiro
// Necessário porque CSP connect-src 'self' bloqueia chamadas cross-domain
export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  for (const baseUrl of BACKEND_URLS) {
    try {
      const url = `${baseUrl}/accounts/login/`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });

      // Se retornou HTML (Django ALLOWED_HOSTS error), pular para próxima URL
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('json')) {
        continue;
      }

      const data = await res.json();
      const response = NextResponse.json(data, { status: res.status });

      // Repassar Set-Cookie do backend
      const rawHeaders = res.headers;
      const setCookieValues: string[] = [];
      rawHeaders.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') {
          setCookieValues.push(value);
        }
      });
      for (const cookie of setCookieValues) {
        response.headers.append('Set-Cookie', cookie);
      }

      return response;
    } catch {
      continue;
    }
  }
  return NextResponse.json({ error: 'Erro de conexão com o servidor.' }, { status: 502 });
}
