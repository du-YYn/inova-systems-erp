import { useState, type FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AxiosError } from "axios";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { login } from "@/api/auth";
import { useAuth } from "@/store/auth";

export function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const location = useLocation();
  const { setTokens, setUsuario } = useAuth();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    try {
      const data = await login(email, senha);
      setTokens(data.access, data.refresh);
      setUsuario(data.usuario);
      const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/";
      nav(from, { replace: true });
    } catch (err) {
      const ax = err as AxiosError<{ detail?: string }>;
      setErro(ax.response?.data?.detail ?? "Falha ao autenticar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="label-caps mb-3">Inova Systems Solutions</div>
          <h1 className="text-2xl font-light tracking-tight">
            <span className="text-[color:var(--color-gold)]">Apresentação</span> Comercial
          </h1>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Input
            label="E-mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            autoFocus
          />
          <Input
            label="Senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            required
          />
          {erro && (
            <div className="text-xs text-red-400 border border-red-500/30 rounded-md px-3 py-2">
              {erro}
            </div>
          )}
          <Button type="submit" disabled={loading} className="mt-2 justify-center">
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
