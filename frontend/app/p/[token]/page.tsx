'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { FileText } from 'lucide-react';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function ProposalPublicPage() {
  const params = useParams();
  const token = params.token as string;
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;

    // F7B.6: validar formato do token client-side antes de qualquer fetch.
    // Defense-in-depth — Next.js API route ja valida, mas evita uma roundtrip.
    if (!UUID_REGEX.test(token)) {
      setError('Link inválido.');
      setLoading(false);
      return;
    }

    // Verifica se proposta existe via metadados antes de mostrar iframe.
    // Tambem registra view-tracking em background.
    fetch(`/api/proposal/${token}`)
      .then(res => {
        if (res.status === 429) { setError('Muitos acessos. Tente novamente em alguns minutos.'); return; }
        if (res.status === 404) { setError('Proposta não encontrada.'); return; }
        if (!res.ok) { setError(`Erro (${res.status}).`); return; }
      })
      .catch(() => setError('Erro de conexão.'))
      .finally(() => setLoading(false));
  }, [token]);

  // F7B (M2): iframe com `src` (nao `srcDoc`) — preserva o CSP que o backend
  // retorna em /api/proposal/[token]/html. Com srcDoc o documento herda o CSP
  // da pagina pai, que e' mais permissivo. Sandbox sem `allow-same-origin`
  // mantem o iframe em origin nulo (sem acesso a cookies/localStorage do ERP).
  // `allow-popups` + `allow-popups-to-escape-sandbox` permite que botoes CTA
  // com target="_blank" abram em nova aba (corrige bug F7B.1 do "Aceito proposta").
  if (!loading && !error) {
    return (
      <iframe
        title="Proposta"
        src={`/api/proposal/${token}/html`}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        style={{ width: '100vw', height: '100vh', border: 'none', display: 'block' }}
      />
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <p style={{ color: '#999', fontSize: 14 }}>Carregando proposta...</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', flexDirection: 'column' }}>
      <FileText style={{ width: 64, height: 64, color: '#444', marginBottom: 16 }} />
      <h1 style={{ color: '#ccc', fontSize: 20, marginBottom: 8 }}>
        {error.includes('encontrada') ? 'Proposta não encontrada' : 'Erro'}
      </h1>
      <p style={{ color: '#666', fontSize: 14 }}>{error}</p>
    </div>
  );
}
