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

    // Registra view + busca HTML em paralelo
    Promise.all([
      fetch(`/api/proposal/${token}`).catch(() => null),
      fetch(`/api/proposal/${token}/html`),
    ])
      .then(async ([, htmlRes]) => {
        if (!htmlRes || !htmlRes.ok) throw new Error('Proposta não encontrada');
        const content = await htmlRes.text();
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
        <h1 style={{ color: '#ccc', fontSize: 20, marginBottom: 8 }}>Proposta não encontrada</h1>
        <p style={{ color: '#666', fontSize: 14 }}>O link pode ter expirado ou ser inválido.</p>
      </div>
    );
  }

  // Renderiza o HTML completo substituindo a página inteira
  return <iframe srcDoc={html} style={{ width: '100%', height: '100vh', border: 'none' }} title="Proposta" />;
}
