import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/reset-password', '/forgot-password', '/p/', '/api/proposal/', '/onboarding/', '/api/onboarding/', '/chamado/'];

const ONBOARDING_HOST = process.env.ONBOARDING_HOST || 'cadastro.inovasystemssolutions.com';
const PARTNER_HOST = process.env.PARTNER_HOST || 'parceiro.inovasystemssolutions.com';

/**
 * Gera um nonce criptograficamente seguro para CSP por request.
 * Usa Web Crypto (disponível no Edge Runtime do Next).
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  // Base64 sem dependência de Buffer (Edge Runtime).
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/**
 * Constrói o header Content-Security-Policy.
 *
 * script-src: 'self' + nonce + strict-dynamic — SEM 'unsafe-inline'/'unsafe-eval'.
 *             Protecao XSS gold standard. NAO mexer.
 *
 * style-src:  'self' + 'unsafe-inline' — trade-off aceito.
 *   Razao: React/Next obrigatoriamente gera atributos `style="..."` em
 *   components (AnimatedCharacters, Framer Motion, transforms dinamicos).
 *   Browser NAO aceita nonce em atributos `style="..."` (apenas em <style>
 *   tags). Sem 'unsafe-inline' aqui, 24+ estilos legitimos sao bloqueados
 *   e componentes visuais (ex: bonecos animados do login) somem.
 *
 *   CSS injection != XSS — CSS nao executa codigo. Atacante via CSS
 *   injection pode mudar visual ou exfil lento via seletores (bytes/seg),
 *   mas NAO consegue executar JavaScript.
 *
 *   OWASP CSP cheatsheet aceita esse trade-off para apps React/Vue.
 *   Ver docs/security-decisions.md para detalhe completo.
 */
function buildCsp(nonce: string, embeddableSameOrigin = false): string {
  const publicApi = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  // F0: connect-src precisa da ORIGIN (sem path). Na CSP, um source com path
  // sem barra final casa SO aquele path exato: 'http://host/api/v1' bloqueia
  // '/api/v1/accounts/login/'. Em prod o dominio nu na lista mascarava isso;
  // em localhost (porta dedicada) o fetch morria bloqueado.
  let publicApiOrigin = publicApi;
  try { publicApiOrigin = new URL(publicApi).origin; } catch { /* mantem como veio */ }
  const connectExtra = [
    'https://*.inovasystemssolutions.com',
    'https://erp.inovasystemssolutions.com',
    'https://cadastro.inovasystemssolutions.com',
    'https://parceiro.inovasystemssolutions.com',
    'https://viacep.com.br',
    publicApiOrigin,
  ].join(' ');

  // F0: em desenvolvimento o Next (react-refresh/webpack) usa eval() para
  // HMR; a CSP nonce+strict-dynamic bloqueia e a pagina morre com EvalError.
  // 'unsafe-eval' APENAS quando NODE_ENV!=production (npm run dev) — o build
  // de producao continua sem eval e sem relaxamento.
  const devEval = process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : '';

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${connectExtra}`,
    "font-src 'self' data:",
    // O HTML público da proposta (/api/proposal/<token>/html) é exibido dentro
    // do iframe da página /p/<token> (mesma origem). Para essa rota, 'self';
    // todo o resto fica 'none' (anti-clickjacking).
    embeddableSameOrigin ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}


/**
 * CSP do HTML público da proposta, exibido num iframe ISOLADO (sandbox
 * `allow-scripts` SEM `allow-same-origin` → origin opaco). Permite o JS e os
 * estilos inline da própria proposta (animações, capa, scroll-reveal), mas
 * trava `connect-src 'none'` (sem fetch/XHR/exfiltração) e mantém
 * `frame-ancestors 'self'`. É seguro porque o iframe não acessa cookies/
 * storage/sessão do ERP nem o DOM da página pai (origin opaco). Padrão usado
 * por CodePen/JSFiddle para rodar HTML/JS arbitrário com segurança.
 */
function buildIframeProposalCsp(): string {
  return [
    "default-src 'self' data: blob:",
    "script-src 'unsafe-inline' 'unsafe-eval' data: blob:",
    "style-src 'unsafe-inline' *",
    "img-src * data: blob:",
    "font-src * data:",
    "media-src * data: blob:",
    "connect-src 'none'",
    "frame-ancestors 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join('; ');
}


/** Valida se um pathname pode ser usado como ?redirect=... de forma segura
 * (evita open redirect via `//evil.com`, `\\evil.com`, `/\\evil`, `javascript:`
 * e URLs absolutas). Aceita apenas paths relativos simples. */
function isSafeRedirectPath(path: string): boolean {
  if (!path || typeof path !== 'string') return false;
  if (!path.startsWith('/')) return false;
  // Rejeita protocolo-relativo, backslash-tricks, null bytes, esquemas perigosos
  if (path.startsWith('//') || path.startsWith('/\\') || path.includes('\\')) return false;
  if (path.includes('\0') || path.includes('\r') || path.includes('\n')) return false;
  if (/^\/+(javascript|data|vbscript|file):/i.test(path)) return false;
  // Aceita path razoável: letras, dígitos, /, -, _, ., ?, &, =, %
  return /^\/[a-zA-Z0-9/_\-.?&=%+]*$/.test(path);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Gera nonce e propaga via header da request para Server Components lerem.
  const nonce = generateNonce();
  request.headers.set('x-nonce', nonce);

  // A rota /api/proposal/<token>/html serve o HTML público da proposta para ser
  // exibido DENTRO do iframe da página /p/<token> (mesma origem). Precisa permitir
  // frame same-origin; com DENY/'none' o navegador recusa o iframe e mostra
  // "recusou a conexão" — a proposta não abre em lugar nenhum. Demais rotas
  // permanecem travadas (anti-clickjacking).
  const isEmbeddableProposalHtml = /^\/api\/proposal\/[^/]+\/html\/?$/.test(pathname);
  // O /html roda num iframe ISOLADO (sandbox allow-scripts, SEM same-origin):
  // usa uma CSP que permite o JS/estilo inline da própria proposta mas trava a
  // saída de rede. Todas as demais rotas usam a CSP nonce-based forte.
  const csp = isEmbeddableProposalHtml ? buildIframeProposalCsp() : buildCsp(nonce);

  const finish = (response: NextResponse): NextResponse => {
    response.headers.set('Content-Security-Policy', csp);
    response.headers.set('x-nonce', nonce);
    // X-Frame-Options gerenciado aqui (removido do next.config para poder variar
    // por rota): SAMEORIGIN só para o HTML embedável; DENY para o resto.
    response.headers.set('X-Frame-Options', isEmbeddableProposalHtml ? 'SAMEORIGIN' : 'DENY');
    return response;
  };

  const passThrough = (): NextResponse =>
    finish(NextResponse.next({ request: { headers: request.headers } }));

  // Detecta hostname real (Traefik/Easypanel pode usar x-forwarded-host)
  const rawHost = request.headers.get('x-forwarded-host')
    || request.headers.get('host')
    || '';
  const hostname = rawHost.split(':')[0].split(',')[0].trim();

  // ── Subdomínio cadastro.inovasystemssolutions.com ──
  if (hostname === ONBOARDING_HOST) {
    if (pathname.startsWith('/_next') || pathname.includes('.')) {
      return passThrough();
    }
    if (pathname !== '/' && !pathname.startsWith('/onboarding/') && !pathname.startsWith('/api/')) {
      const url = request.nextUrl.clone();
      url.pathname = `/onboarding${pathname}`;
      return finish(NextResponse.rewrite(url, { request: { headers: request.headers } }));
    }
    return passThrough();
  }

  // ── Subdomínio parceiro.inovasystemssolutions.com ──
  if (hostname === PARTNER_HOST) {
    if (pathname.startsWith('/_next') || pathname.includes('.')) {
      return passThrough();
    }
    // Libera login e API
    if (pathname === '/login' || pathname.startsWith('/api')) {
      return passThrough();
    }
    // Verifica sessão
    const session = request.cookies.get('inova_session');
    if (!session?.value) {
      const loginUrl = new URL('/login', request.url);
      if (isSafeRedirectPath(pathname)) {
        loginUrl.searchParams.set('redirect', pathname);
      }
      return finish(NextResponse.redirect(loginUrl));
    }
    // Reescreve /{path} → /partner/{path} se não está já em /partner/
    if (!pathname.startsWith('/partner/')) {
      const url = request.nextUrl.clone();
      url.pathname = pathname === '/' ? '/partner/dashboard' : `/partner${pathname}`;
      return finish(NextResponse.rewrite(url, { request: { headers: request.headers } }));
    }
    return passThrough();
  }

  // ── ERP principal ──

  // Parceiros no domínio do ERP → redirecionar para portal
  // (inova_role cookie setado no login para detecção rápida no middleware)
  const roleHint = request.cookies.get('inova_role')?.value;
  if (roleHint === 'partner' && !pathname.startsWith('/login') && !pathname.startsWith('/partner/')) {
    return finish(NextResponse.redirect(new URL(`https://${PARTNER_HOST}/`)));
  }

  // Libera rotas públicas
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return passThrough();
  }

  // Libera assets internos do Next.js
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return passThrough();
  }

  // Verifica cookie de sessão (setado no login)
  const session = request.cookies.get('inova_session');

  if (!session?.value) {
    const loginUrl = new URL('/login', request.url);
    if (pathname.startsWith('/') && !pathname.startsWith('//')) {
      loginUrl.searchParams.set('redirect', pathname);
    }
    return finish(NextResponse.redirect(loginUrl));
  }

  return passThrough();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
