'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { FileText, Download, Eye } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
const BASE_URL = API_URL.replace('/api/v1', '');

interface ProposalData {
  number: string;
  title: string;
  company: string;
  total_value: number;
  status: string;
  valid_until: string | null;
  file_url: string | null;
  view_count: number;
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function ProposalPublicPage() {
  const params = useParams();
  const token = params.token as string;
  const [data, setData] = useState<ProposalData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`${BASE_URL}/p/${token}/`)
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
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
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

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">Inova<span className="text-gray-500 text-xs ml-1">SYSTEMS SOLUTIONS</span></h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Eye className="w-3.5 h-3.5" />
            {data.view_count} visualização{data.view_count !== 1 ? 'ões' : ''}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Proposal info */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs text-amber-500 font-semibold uppercase tracking-wide mb-1">Proposta Comercial</p>
              <h2 className="text-xl font-bold text-white">{data.title}</h2>
              <p className="text-sm text-gray-400 mt-1">{data.number} • {data.company}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-amber-500">{fmt(data.total_value)}</p>
              {data.valid_until && (
                <p className="text-xs text-gray-500 mt-1">
                  Válida até {new Date(data.valid_until + 'T00:00:00').toLocaleDateString('pt-BR')}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* PDF Viewer */}
        {data.file_url ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <iframe
              src={data.file_url}
              className="w-full border-0"
              style={{ height: '80vh' }}
              title="Proposta PDF"
            />
            <div className="p-4 border-t border-gray-800 flex justify-center">
              <a href={data.file_url} download target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors">
                <Download className="w-4 h-4" /> Baixar PDF
              </a>
            </div>
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 text-center">
            <FileText className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400">Nenhum documento anexado a esta proposta.</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-gray-600">
        © {new Date().getFullYear()} Inova Systems Solutions
      </footer>
    </div>
  );
}
