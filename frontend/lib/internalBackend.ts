/**
 * Resolve a lista ordenada de URLs internas do backend usadas por rotas API
 * server-side do Next (proxy-login, public proposal, onboarding etc.).
 *
 * Ordem de prioridade:
 * 1. `INTERNAL_BACKEND_URL` (configurada via .env — preferida em produção,
 *    aponta para o hostname interno na rede Docker/k8s).
 * 2. `INTERNAL_API_URL` (legada — mantida para compatibilidade durante
 *    a transição; remover quando todos os ambientes migrarem).
 * 3. Fallbacks Docker, NESTA ordem:
 *    a) `http://inova-erp-backend:8000/api/v1` — alias hifenizado e ÚNICO do
 *       projeto (Host válido no Django; underscore seria rejeitado pela regex
 *       de Host → 400, ver abaixo).
 *    b) `http://backend:8000/api/v1` — nome curto, AMBÍGUO na rede `easypanel`
 *       compartilhada (resolve para backends de outros projetos também →
 *       round-robin → 404/timeout). Por isso vem DEPOIS do alias.
 * 4. `NEXT_PUBLIC_API_URL` (última opção — exposição pública, evita usar).
 *
 * IMPORTANTE: nunca retornar essas URLs ao cliente em mensagens de erro —
 * vazariam topologia interna. Use-as apenas server-side.
 */
export function getInternalBackendUrls(): string[] {
  const candidates = [
    process.env.INTERNAL_BACKEND_URL,
    process.env.INTERNAL_API_URL,
    // Alias hifenizado e ÚNICO do projeto, ANTES do nome curto `backend`.
    // NÃO usar `grupo_ry_inova-erp_backend` (underscore): a regex de Host do
    // Django (^[a-z0-9.-]+$) rejeita underscore ANTES de checar o ALLOWED_HOSTS
    // → 400 → o proxy cai no `backend`. Na rede `easypanel` (compartilhada)
    // `backend` resolve para VÁRIOS projetos (round-robin → DB errado → 404).
    // `inova-erp-backend` é hífen (Host válido) e único → 1 IP (inova). Em dev
    // local (sem easypanel) não resolve e o caller cai no `backend` abaixo.
    'http://inova-erp-backend:8000/api/v1',
    'http://backend:8000/api/v1',
    process.env.NEXT_PUBLIC_API_URL,
  ].filter((u): u is string => Boolean(u && u.trim()));

  // Deduplica preservando ordem.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const u of candidates) {
    if (!seen.has(u)) {
      seen.add(u);
      unique.push(u);
    }
  }
  return unique;
}

/**
 * Headers a repassar do request do cliente para a chamada server-side ao backend.
 *
 * Repassa o IP real do cliente (`x-forwarded-for` / `x-real-ip` que o Traefik
 * entrega ao frontend). Sem isso, o backend vê TODAS as chamadas do proxy vindo
 * do IP do frontend — e o throttle anônimo por-IP do DRF (ex.: 60/h em
 * ProposalPublicThrottle) vira um teto GLOBAL compartilhado por todos os
 * clientes, disparando 429 sozinho. Com `NUM_PROXIES=None`, o DRF passa a usar
 * este `x-forwarded-for` → throttle por-cliente real.
 */
export function forwardedClientHeaders(req: { headers: Headers }): Record<string, string> {
  const out: Record<string, string> = {};
  const xff = req.headers.get('x-forwarded-for');
  if (xff) out['x-forwarded-for'] = xff;
  const xri = req.headers.get('x-real-ip');
  if (xri) out['x-real-ip'] = xri;
  return out;
}
