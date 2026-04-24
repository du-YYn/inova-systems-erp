import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Usuario } from "@/types";

interface AuthState {
  access: string | null;
  refresh: string | null;
  usuario: Usuario | null;
  setTokens: (access: string, refresh: string) => void;
  setUsuario: (u: Usuario | null) => void;
  setAccess: (access: string) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      access: null,
      refresh: null,
      usuario: null,
      setTokens: (access, refresh) => set({ access, refresh }),
      setAccess: (access) => set({ access }),
      setUsuario: (usuario) => set({ usuario }),
      logout: () => set({ access: null, refresh: null, usuario: null }),
    }),
    { name: "inova-auth" }
  )
);
