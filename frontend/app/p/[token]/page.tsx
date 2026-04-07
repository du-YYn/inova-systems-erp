'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { FileText } from 'lucide-react';

export default function ProposalPublicPage() {
  const params = useParams();
  const token = params.token as string;
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token) return;

    // Registra view e depois redireciona para o HTML raw
    fetch(`/api/proposal/${token}`)
      .then(async res => {
        if (res.status === 429) { setError('Muitos acessos. Tente novamente em alguns minutos.'); return; }
        if (res.status === 404) { setError('Proposta não encontrada.'); return; }
        if (!res.ok) { setError(`Erro ao carregar proposta (${res.status}).`); return; }
        setReady(true);
      })
      .catch(() => setError('Erro de conexão.'));
  }, [token]);

  // Quando pronto, redireciona para o HTML raw (renderiza como página nativa)
  useEffect(() => {
    if (ready && token) {
      window.location.replace(`/api/proposal/${token}/html`);
    }
  }, [ready, token]);

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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }}>
      <p style={{ color: '#999', fontSize: 14 }}>Carregando proposta...</p>
    </div>
  );
}
