import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URLS = [
  process.env.INTERNAL_API_URL,
  'http://backend:8000/api/v1',
  'http://grupo_ry_inova-erp_backend:8000/api/v1',
  process.env.NEXT_PUBLIC_API_URL,
].filter(Boolean) as string[];

// POST /api/auth/login — proxy login para evitar problemas de cookies cross-domain
export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  for (const baseUrl of BACKEND_URLS) {
    try {
      const res = await fetch(`${baseUrl}/accounts/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      });

      const data = await res.json();

      // Criar resposta com os mesmos headers/cookies do backend
      const response = NextResponse.json(data, { status: res.status });

      // Repassar Set-Cookie headers do backend para o browser
      const setCookies = res.headers.getSetCookie?.() || [];
      for (const cookie of setCookies) {
        response.headers.append('Set-Cookie', cookie);
      }

      return response;
    } catch {
      continue;
    }
  }
  return NextResponse.json({ error: 'Erro de conexão.' }, { status: 502 });
}
