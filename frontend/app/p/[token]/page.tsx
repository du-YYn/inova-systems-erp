'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { FileText, Eye } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface ProposalData {
  number: string;
  title: string;
  company: string;
  total_value: number;
  status: string;
  valid_until: string | null;
  has_file: boolean;
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
    fetch(`${API_URL}/sales/proposals/public/${token}/`)
      .then(async res => {
        if (!res.ok) throw new Error('Proposta não encontrada');
        return res.json();
      })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  // Bloquear clique-direito e atalhos de download
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', prevent);
    const preventKeys = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'p')) {
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', preventKeys);
    return () => {
      document.removeEventListener('contextmenu', prevent);
      document.removeEventListener('keydown', preventKeys);
    };
  }, []);

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

  // URL do PDF inline (sem download)
  const pdfUrl = `${API_URL}/sales/proposals/public/${token}/pdf/`;

  return (
    <div className="min-h-screen bg-gray-950 select-none" style={{ userSelect: 'none' }}>
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">
              Inova<span className="text-gray-500 text-xs ml-1">SYSTEMS SOLUTIONS</span>
            </h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Eye className="w-3.5 h-3.5" />
            Documento confidencial
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Proposal info */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-amber-500 font-semibold uppercase tracking-wide mb-1">
                Proposta Comercial
              </p>
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

        {/* PDF Viewer (inline, sem download) */}
        {data.has_file ? (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <iframe
              src={`${pdfUrl}#toolbar=0&navpanes=0&scrollbar=1`}
              className="w-full border-0"
              style={{ height: '80vh' }}
              title="Proposta PDF"
              sandbox="allow-same-origin allow-scripts"
            />
            <div className="p-3 border-t border-gray-800 text-center">
              <p className="text-[10px] text-gray-600">
                Este documento é confidencial. A reprodução ou distribuição não autorizada é proibida.
              </p>
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
        © {new Date().getFullYear()} Inova Systems Solutions — Documento confidencial
      </footer>
    </div>
  );
}
