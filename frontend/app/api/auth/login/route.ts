import { NextRequest, NextResponse } from 'next/server';

// POST /api/auth/login — proxy de login server-side
// Resolve problemas de CSP e cookies cross-domain em subdomínios
export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  // Construir lista de URLs para tentar (server-side, sem restrição CSP)
  const urls: string[] = [];
  if (process.env.INTERNAL_API_URL) urls.push(process.env.INTERNAL_API_URL);
  if (process.env.NEXT_PUBLIC_API_URL) urls.push(process.env.NEXT_PUBLIC_API_URL);
  urls.push('http://backend:8000/api/v1');
  urls.push('http://grupo_ry_inova-erp_backend:8000/api/v1');

  // Deduplicar
  const unique = urls.filter((u, i) => urls.indexOf(u) === i);

  let lastError = '';

  for (const baseUrl of unique) {
    try {
      // Extrair hostname para ALLOWED_HOSTS
      const urlObj = new URL(`${baseUrl}/accounts/login/`);

      const res = await fetch(urlObj.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-Proto': 'https',
        },
        body: JSON.stringify(body),
        cache: 'no-store',
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
      });

      // Se o backend redireciona (HTTPS redirect), pular esta URL
      if (res.status >= 300 && res.status < 400) {
        lastError = `${baseUrl} redirect (${res.status})`;
        continue;
      }

      // Se retornou HTML (Django error), tentar próxima URL
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('json')) {
        lastError = `${baseUrl} retornou HTML (${res.status})`;
        continue;
      }

      const data = await res.json();
      const response = NextResponse.json(data, { status: res.status });

      // Repassar TODOS os Set-Cookie do backend
      res.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') {
          response.headers.append('Set-Cookie', value);
        }
      });

      return response;
    } catch (e) {
      lastError = `${baseUrl}: ${e instanceof Error ? e.message : String(e)}`;
      continue;
    }
  }

  return NextResponse.json(
    { error: 'Erro de conexão com o servidor.', detail: lastError },
    { status: 502 }
  );
}
