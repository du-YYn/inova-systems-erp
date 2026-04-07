import { NextRequest, NextResponse } from 'next/server';

// No Docker, o frontend acessa o backend pelo nome do serviço
// Tenta múltiplas URLs em ordem de prioridade
const BACKEND_URLS = [
  process.env.INTERNAL_API_URL,
  'http://backend:8000/api/v1',
  'http://grupo_ry_inova-erp_backend:8000/api/v1',
  process.env.NEXT_PUBLIC_API_URL,
].filter(Boolean) as string[];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  for (const baseUrl of BACKEND_URLS) {
    try {
      const url = `${baseUrl}/sales/proposals/public/${token}/`;
      const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
      });

      if (res.ok) {
        const data = await res.json();
        return NextResponse.json(data);
      }

      if (res.status === 404) {
        return NextResponse.json(
          { error: 'Proposta não encontrada.' },
          { status: 404 }
        );
      }
    } catch {
      // Tenta próxima URL
      continue;
    }
  }

  return NextResponse.json(
    { error: 'Não foi possível conectar ao servidor.' },
    { status: 502 }
  );
}
