'use client';

import { useEffect, useState } from 'react';
import { UserCircle, Loader2 } from 'lucide-react';
import api from '@/lib/api';

interface Profile {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  role: string;
}

export default function PartnerPerfilPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Profile>('/accounts/profile/')
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-[#A6864A] animate-spin" />
      </div>
    );
  }

  if (!profile) return null;

  const fields = [
    { label: 'Nome', value: `${profile.first_name} ${profile.last_name}`.trim() || profile.username },
    { label: 'E-mail', value: profile.email },
    { label: 'Telefone', value: profile.phone || '—' },
    { label: 'Usuário', value: profile.username },
  ];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-100">Meu Perfil</h2>
        <p className="text-sm text-gray-500 mt-0.5">Seus dados de parceiro</p>
      </div>

      <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-6">
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-[#1a1a1a]">
          <div className="w-14 h-14 bg-[#A6864A]/10 rounded-full flex items-center justify-center">
            <UserCircle className="w-8 h-8 text-[#A6864A]" />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-100">
              {profile.first_name} {profile.last_name}
            </p>
            <p className="text-xs text-[#A6864A] font-medium">Parceiro</p>
          </div>
        </div>

        <div className="space-y-4">
          {fields.map(f => (
            <div key={f.label}>
              <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">{f.label}</p>
              <p className="text-sm text-gray-200">{f.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
