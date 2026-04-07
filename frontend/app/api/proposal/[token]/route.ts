import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URLS = [
  process.env.INTERNAL_API_URL,
  'http://backend:8000/api/v1',
  'http://grupo_ry_inova-erp_backend:8000/api/v1',
  process.env.NEXT_PUBLIC_API_URL,
].filter(Boolean) as string[];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/proposal/[token] — registra view e retorna metadados
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Validação estrita de UUID — previne path traversal e SSRF
  if (!UUID_REGEX.test(token)) {
    return NextResponse.json({ error: 'Token inválido.' }, { status: 400 });
  }

  for (const baseUrl of BACKEND_URLS) {
    try {
      const res = await fetch(`${baseUrl}/sales/proposals/public/${token}/`, {
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }
      if (res.status === 404) {
        return NextResponse.json({ error: 'Proposta não encontrada.' }, { status: 404 });
      }
    } catch {
      continue;
    }
  }
  return NextResponse.json({ error: 'Erro de conexão.' }, { status: 502 });
}
