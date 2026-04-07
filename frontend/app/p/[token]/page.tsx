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

    // View tracking em background — não bloqueia o carregamento
    fetch(`/api/proposal/${token}`).catch(() => {});

    // Busca HTML direto — único fetch que bloqueia
    fetch(`/api/proposal/${token}/html`)
      .then(async res => {
        if (res.status === 429) { setError('Muitos acessos. Tente novamente em alguns minutos.'); return; }
        if (res.status === 404) { setError('Proposta não encontrada.'); return; }
        if (!res.ok) { setError(`Erro (${res.status}).`); return; }
        const content = await res.text();
        if (!content || content.length < 10) { setError('Proposta sem conteúdo.'); return; }
        setHtml(content);
      })
      .catch(() => setError('Erro de conexão.'))
      .finally(() => setLoading(false));
  }, [token]);

  // Renderiza HTML assim que chega — sem esperar tracking
  if (html && typeof document !== 'undefined') {
    document.open();
    document.write(html);
    document.close();
    return null;
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
        <p style={{ color: '#999', fontSize: 14 }}>Carregando proposta...</p>
      </div>
    );
  }

  if (error) {
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

  return null;
}
