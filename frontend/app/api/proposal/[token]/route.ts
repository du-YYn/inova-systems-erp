import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://backend:8000/api/v1';
// Em produção dentro do Docker, o frontend acessa o backend via hostname interno
const INTERNAL_URL = process.env.INTERNAL_API_URL || BACKEND_URL.replace('https://erp.inovasystemssolutions.com', 'http://backend:8000');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    const res = await fetch(`${INTERNAL_URL}/sales/proposals/public/${token}/`, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Proposta não encontrada.' },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: 'Erro ao buscar proposta.' },
      { status: 500 }
    );
  }
}
