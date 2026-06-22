import { NextRequest, NextResponse } from 'next/server';
import { getInternalBackendUrls, forwardedClientHeaders } from '@/lib/internalBackend';

const BACKEND_URLS = getInternalBackendUrls();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/proposal/[token]/html — serve o HTML raw diretamente
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!UUID_REGEX.test(token)) {
    return new NextResponse('Token inválido.', { status: 400 });
  }

  const fwd = forwardedClientHeaders(request);

  for (const baseUrl of BACKEND_URLS) {
    try {
      const res = await fetch(
        `${baseUrl}/sales/proposals/public/${token}/html/`,
        { headers: { ...fwd }, cache: 'no-store' },
      );
      if (res.ok) {
        const html = await res.text();
        return new NextResponse(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            // CSP do iframe ISOLADO (CodePen-style): este HTML roda num iframe
            // sandbox `allow-scripts` SEM `allow-same-origin` (origin opaco).
            // Permite o JS/estilo inline da própria proposta (animações, capa,
            // scroll-reveal), mas trava `connect-src 'none'` (sem rede/exfil) e
            // mantém `frame-ancestors 'self'` (só a /p/<token> embeda). O iframe
            // não acessa cookies/storage/sessão do ERP nem o DOM pai.
            // (Reaplicada pelo middleware — mantida aqui alinhada.)
            'Content-Security-Policy': [
              "default-src 'self' data: blob:",
              "script-src 'unsafe-inline' 'unsafe-eval' data: blob:",
              "style-src 'unsafe-inline' *",
              "img-src * data: blob:",
              "font-src * data:",
              "media-src * data: blob:",
              "connect-src 'none'",
              "frame-ancestors 'self'",
              "base-uri 'none'",
              "object-src 'none'",
              "form-action 'none'",
            ].join('; '),
            // Sobrescreve o X-Frame-Options: DENY global (next.config) para esta
            // rota — DENY impediria o embed same-origin na página /p/.
            'X-Frame-Options': 'SAMEORIGIN',
            'X-Content-Type-Options': 'nosniff',
            'X-XSS-Protection': '1; mode=block',
            'Cache-Control': 'no-store, no-cache',
            'X-Robots-Tag': 'noindex, nofollow',
          },
        });
      }
      if (res.status === 404) {
        return new NextResponse(
          '<html><body style="font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;background:#0a0a0a;color:#666;"><h1>Proposta não encontrada</h1></body></html>',
          { status: 404, headers: { 'Content-Type': 'text/html' } },
        );
      }
    } catch {
      continue;
    }
  }

  return new NextResponse(
    '<html><body style="font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;background:#0a0a0a;color:#666;"><h1>Erro de conexão</h1></body></html>',
    { status: 502, headers: { 'Content-Type': 'text/html' } },
  );
}
