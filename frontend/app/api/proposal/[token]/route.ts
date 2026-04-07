import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URLS = [
  process.env.INTERNAL_API_URL,
  'http://backend:8000/api/v1',
  'http://grupo_ry_inova-erp_backend:8000/api/v1',
  process.env.NEXT_PUBLIC_API_URL,
].filter(Boolean) as string[];

// GET /api/proposal/[token] — registra view e retorna metadados
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

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
