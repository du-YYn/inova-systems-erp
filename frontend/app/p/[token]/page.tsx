'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { FileText } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface ProposalData {
  number: string;
  title: string;
  company: string;
  total_value: number;
  status: string;
  valid_until: string | null;
  html_content: string;
  view_count: number;
}

export default function ProposalPublicPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<ProposalData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/sales/proposals/public/${token}/`)
      .then(async res => {
        if (!res.ok) throw new Error('Proposta não encontrada');
        return res.json();
      })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Carregando...</div>
      </div>
    );
  }

  if (error || !data) {
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

  // Renderiza o HTML da proposta direto na página
  return (
    <div
      className="proposal-content"
      dangerouslySetInnerHTML={{ __html: data.html_content }}
    />
  );
}
