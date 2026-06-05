import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/reset-password', '/forgot-password', '/p/', '/api/proposal/', '/onboarding/', '/api/onboarding/'];

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
function buildCsp(nonce: string): string {
  const publicApi = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const connectExtra = [
    'https://*.inovasystemssolutions.com',
    'https://erp.inovasystemssolutions.com',
    'https://cadastro.inovasystemssolutions.com',
    'https://parceiro.inovasystemssolutions.com',
    'https://viacep.com.br',
    publicApi,
  ].join(' ');

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${connectExtra}`,
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
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
  const csp = buildCsp(nonce);

  const finish = (response: NextResponse): NextResponse => {
    response.headers.set('Content-Security-Policy', csp);
    response.headers.set('x-nonce', nonce);
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
