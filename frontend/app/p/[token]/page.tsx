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
        if (!htmlRes) throw new Error('Erro de conexão com o servidor.');
        if (htmlRes.status === 429) throw new Error('Muitos acessos. Tente novamente em alguns minutos.');
        if (htmlRes.status === 404) throw new Error('Proposta não encontrada.');
        if (!htmlRes.ok) throw new Error(`Erro ao carregar proposta (${htmlRes.status}).`);
        const content = await htmlRes.text();
        if (!content || content.length < 10) throw new Error('Proposta sem conteúdo.');
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

  // Renderiza HTML em iframe sandboxed — permite CSS/fontes, bloqueia JavaScript
  return (
    <>
      <style>{`html, body { margin: 0; padding: 0; overflow: hidden; }`}</style>
      <iframe srcDoc={html} sandbox="allow-same-origin allow-popups" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', border: 'none', margin: 0, padding: 0 }} title="Proposta" />
    </>
  );
}
