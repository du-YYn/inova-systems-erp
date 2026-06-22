'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { FileText } from 'lucide-react';

// UUID em qualquer posição do segmento (NÃO ancorado): permite EXTRAIR o token
// mesmo quando o link chega com lixo grudado no fim (espaço, %20, ponto, quebra
// de linha — comum em WhatsApp/e-mail). Se nada casar, o token fica vazio.
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export default function ProposalPublicPage() {
  const params = useParams();
  // Normaliza o token: extrai o UUID do segmento e padroniza p/ minúsculas.
  // Tolera lixo grudado no fim do link (espaço, %20, ponto, quebra de linha)
  // sem perder o acesso. Vazio ⇒ "Link inválido." no efeito abaixo.
  const token = ((params.token as string) || '').match(UUID_REGEX)?.[0]?.toLowerCase() ?? '';
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // F7B.6: token já extraído/validado acima (formato UUID). Vazio = formato
    // inválido — não faz fetch. Defense-in-depth: a API route revalida server-side.
    if (!token) {
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
        // Iframe ISOLADO estilo CodePen: allow-scripts roda o JS da proposta
        // (animações/capa/scroll-reveal), mas SEM allow-same-origin → origin
        // opaco: o script NÃO acessa cookies/storage/sessão do ERP nem o DOM
        // da página pai. connect-src 'none' na CSP impede saída de rede. Assim
        // QUALQUER proposta (com ou sem JS) funciona sem comprometer o ERP.
        // NUNCA adicionar allow-same-origin aqui (quebraria o isolamento).
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
