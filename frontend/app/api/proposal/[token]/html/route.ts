import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URLS = [
  process.env.INTERNAL_API_URL,
  'http://backend:8000/api/v1',
  'http://grupo_ry_inova-erp_backend:8000/api/v1',
  process.env.NEXT_PUBLIC_API_URL,
].filter(Boolean) as string[];

// GET /api/proposal/[token]/html — serve o HTML raw diretamente
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  for (const baseUrl of BACKEND_URLS) {
    try {
      const res = await fetch(
        `${baseUrl}/sales/proposals/public/${token}/html/`,
        { cache: 'no-store' },
      );
      if (res.ok) {
        const html = await res.text();
        return new NextResponse(html, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
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
