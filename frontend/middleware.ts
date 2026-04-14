import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/reset-password', '/forgot-password', '/p/', '/api/proposal/', '/onboarding/', '/api/onboarding/'];

const ONBOARDING_HOST = 'cadastro.inovasystemssolutions.com';
const PARTNER_HOST = 'parceiro.inovasystemssolutions.com';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Detecta hostname real (Traefik/Easypanel pode usar x-forwarded-host)
  const rawHost = request.headers.get('x-forwarded-host')
    || request.headers.get('host')
    || '';
  const hostname = rawHost.split(':')[0].split(',')[0].trim();

  // ── Subdomínio cadastro.inovasystemssolutions.com ──
  if (hostname === ONBOARDING_HOST) {
    if (pathname.startsWith('/_next') || pathname.includes('.')) {
      return NextResponse.next();
    }
    if (pathname !== '/' && !pathname.startsWith('/onboarding/') && !pathname.startsWith('/api/')) {
      const url = request.nextUrl.clone();
      url.pathname = `/onboarding${pathname}`;
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  // ── Subdomínio parceiro.inovasystemssolutions.com ──
  if (hostname === PARTNER_HOST) {
    if (pathname.startsWith('/_next') || pathname.includes('.')) {
      return NextResponse.next();
    }
    // Libera login e API
    if (pathname === '/login' || pathname.startsWith('/api')) {
      return NextResponse.next();
    }
    // Verifica sessão
    const session = request.cookies.get('inova_session');
    if (!session?.value) {
      const loginUrl = new URL('/login', request.url);
      if (pathname.startsWith('/') && !pathname.startsWith('//')) {
        loginUrl.searchParams.set('redirect', pathname);
      }
      return NextResponse.redirect(loginUrl);
    }
    // Reescreve /{path} → /partner/{path} se não está já em /partner/
    if (!pathname.startsWith('/partner/')) {
      const url = request.nextUrl.clone();
      url.pathname = pathname === '/' ? '/partner/dashboard' : `/partner${pathname}`;
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  // ── ERP principal ──

  // Libera rotas públicas
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Libera assets internos do Next.js
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Verifica cookie de sessão (setado no login)
  const session = request.cookies.get('inova_session');

  if (!session?.value) {
    const loginUrl = new URL('/login', request.url);
    if (pathname.startsWith('/') && !pathname.startsWith('//')) {
      loginUrl.searchParams.set('redirect', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
