'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { FileText } from 'lucide-react';

export default function ProposalPublicPage() {
  const params = useParams();
  const token = params.token as string;
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;

    // 1. Registra a visualização via proxy
    fetch(`/api/proposal/${token}`)
      .then(async res => {
        if (!res.ok) throw new Error('Proposta não encontrada');
        // 2. Redireciona para o HTML raw (renderizado direto pelo browser)
        window.location.href = `/api/proposal/${token}/html`;
      })
      .catch(e => setError(e.message));
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-300 mb-2">Proposta não encontrada</h1>
          <p className="text-gray-500">O link pode ter expirado ou ser inválido.</p>
        </div>
      </div>
    );
  }

  // Loading enquanto registra view e redireciona
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="animate-pulse text-gray-400 text-sm">Carregando proposta...</div>
    </div>
  );
}
