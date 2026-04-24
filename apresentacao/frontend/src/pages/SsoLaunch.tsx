import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AxiosError } from "axios";
import { Button } from "@/components/Button";
import { ssoExchange } from "@/api/sso";
import { useAuth } from "@/store/auth";

type Estado = "trocando" | "ok" | "erro";

const MENSAGENS: Record<string, string> = {
  "token-ausente":     "Link inválido — não recebemos um token.",
  "token-expirado":    "Este link expirou. Volte ao ERP e clique em Apresentações novamente.",
  "token-invalido":    "O token recebido não é válido. Volte ao ERP e tente novamente.",
  "token-ja-utilizado":"Este link já foi usado. Cada link só serve para um único acesso.",
  "sso-indisponivel":  "A integração entre ERP e Apresentação não está configurada.",
};

export function SsoLaunch() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { setTokens, setUsuario } = useAuth();
  const [estado, setEstado] = useState<Estado>("trocando");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setErro(MENSAGENS["token-ausente"]);
      setEstado("erro");
      return;
    }
    (async () => {
      try {
        const data = await ssoExchange(token);
        setTokens(data.access, data.refresh);
        setUsuario(data.usuario);
        setEstado("ok");
        nav("/", { replace: true });
      } catch (err) {
        const ax = err as AxiosError<{ erro?: string }>;
        const codigo = ax.response?.data?.erro;
        setErro(MENSAGENS[codigo ?? ""] ?? "Falha ao validar a sessão SSO.");
        setEstado("erro");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (estado === "erro") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="label-caps mb-3 text-red-400">SSO falhou</div>
          <h1 className="text-xl font-light tracking-tight">{erro}</h1>
          <Button onClick={() => nav("/login")} className="mt-8 justify-center">
            Ir para login manual
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="label-caps text-[color:var(--color-gold)] mb-2">Inova ERP</div>
        <div className="text-sm text-[color:var(--color-text-secondary)]">
          Validando sua sessão...
        </div>
      </div>
    </div>
  );
}
