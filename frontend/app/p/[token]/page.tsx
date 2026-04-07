'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { FileText } from 'lucide-react';

export default function ProposalPublicPage() {
  const params = useParams();
  const token = params.token as string;
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;

    // Registra view + busca HTML
    Promise.all([
      fetch(`/api/proposal/${token}`).catch(() => null),
      fetch(`/api/proposal/${token}/html`),
    ])
      .then(async ([, htmlRes]) => {
        if (!htmlRes) { setError('Erro de conexão.'); return; }
        if (htmlRes.status === 429) { setError('Muitos acessos. Tente novamente em alguns minutos.'); return; }
        if (htmlRes.status === 404) { setError('Proposta não encontrada.'); return; }
        if (!htmlRes.ok) { setError(`Erro (${htmlRes.status}).`); return; }
        const content = await htmlRes.text();
        if (!content || content.length < 10) { setError('Proposta sem conteúdo.'); return; }
        setHtml(content);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <p style={{ color: '#999', fontSize: 14 }}>Carregando proposta...</p>
      </div>
    );
  }

  if (error || !html) {
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

  // Substitui a página inteira pelo HTML da proposta
  // Isso remove o Next.js completamente e renderiza o HTML puro
  if (typeof document !== 'undefined') {
    document.open();
    document.write(html);
    document.close();
    return null;
  }

  return null;
}
