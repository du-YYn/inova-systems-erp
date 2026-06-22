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
 *    a) `http://grupo_ry_inova-erp_backend:8000/api/v1` — alias por-projeto,
 *       resolve só para o backend DESTE projeto.
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
    // Alias por-projeto ANTES do nome curto `backend`: na rede `easypanel`
    // (compartilhada entre projetos) `backend` resolve para VÁRIOS containers
    // de projetos distintos, com bancos diferentes — round-robin DNS faz o
    // proxy cair no DB errado (404 "não encontrada") ou em backend ocupado
    // (timeout). O alias resolve só para o backend deste projeto. Em dev local
    // (sem easypanel) o alias não resolve e o caller cai no `backend` abaixo.
    'http://grupo_ry_inova-erp_backend:8000/api/v1',
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
