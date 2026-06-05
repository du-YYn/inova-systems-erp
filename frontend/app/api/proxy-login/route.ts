import { NextRequest, NextResponse } from 'next/server';
import { getInternalBackendUrls } from '@/lib/internalBackend';

// POST /api/auth/login — proxy de login server-side
// Resolve problemas de CSP e cookies cross-domain em subdomínios.
export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  // URLs internas vêm de uma única fonte (lib/internalBackend.ts), evitando
  // hostnames Docker hardcoded em múltiplos arquivos.
  const urls = getInternalBackendUrls();

  let lastError = '';

  for (const baseUrl of urls) {
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

  // NÃO retornamos `lastError` ao cliente — isso vazaria hostnames internos
  // de Docker (ex.: http://backend:8000) e ajudaria a montar superfícies de
  // ataque SSRF / fingerprinting. Log fica server-side apenas.
  console.warn('[proxy-login] all backend URLs failed:', lastError);
  return NextResponse.json(
    { error: 'Erro de conexão com o servidor.' },
    { status: 502 },
  );
}
