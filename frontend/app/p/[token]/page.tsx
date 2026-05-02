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

  // F7B (M2) + F7B.5: iframe com `src` (nao `srcDoc`) — preserva o CSP que
  // o backend retorna. Sandbox SEM `allow-same-origin` mantem o iframe em
  // origin nulo (no acesso a cookies/localStorage do parent / ERP).
  //
  // F7B.5: `allow-scripts` libera JS necessario para animacoes e
  // posicionamento dinamico nos templates de proposta. Combinado com
  // origin nulo + CSP `connect-src 'none'`, o JS pode animar mas nao
  // exfiltra dados nem acessa estado do parent.
  //
  // `allow-popups` + `allow-popups-to-escape-sandbox` permite CTAs com
  // target="_blank" abrirem em nova aba. NAO adicionar `allow-forms`,
  // `allow-top-navigation`, `allow-modals` — aumentaria superficie sem
  // necessidade (propostas nao tem forms nativos, navegam via <a>).
  if (!loading && !error) {
    return (
      <iframe
        title="Proposta"
        src={`/api/proposal/${token}/html`}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
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
