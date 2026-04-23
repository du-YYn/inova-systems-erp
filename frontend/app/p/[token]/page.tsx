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

  // Render em iframe com sandbox em vez de document.write:
  // - sandbox sem allow-scripts impede qualquer JS embutido (defesa contra XSS
  //   via HTML user-controlled que passou pelo bleach do backend)
  // - allow-popups + allow-popups-to-escape-sandbox permite cliques em links CTA
  //   do template (WhatsApp, onboarding, etc.) abrirem em nova aba
  // - allow-same-origin NÃO incluído: iframe fica em origin nulo, sem acesso
  //   a cookies/localStorage/DOM da aplicação principal
  if (html) {
    return (
      <iframe
        title="Proposta"
        srcDoc={html}
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
