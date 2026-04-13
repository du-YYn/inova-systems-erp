import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/reset-password', '/forgot-password', '/p/', '/api/proposal/', '/onboarding/', '/api/onboarding/'];

const ONBOARDING_HOST = 'cadastro.inovasystemssolutions.com';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hostname = request.headers.get('host')?.split(':')[0] || '';

  // ── Subdomínio cadastro.inovasystemssolutions.com ──
  // Reescreve /{token} → /onboarding/{token} internamente
  if (hostname === ONBOARDING_HOST) {
    // Libera assets do Next.js
    if (pathname.startsWith('/_next') || pathname.includes('.')) {
      return NextResponse.next();
    }
    // UUID na raiz → rewrite para /onboarding/{token}
    if (pathname !== '/' && !pathname.startsWith('/onboarding/') && !pathname.startsWith('/api/')) {
      const url = request.nextUrl.clone();
      url.pathname = `/onboarding${pathname}`;
      return NextResponse.rewrite(url);
    }
    // Já está em /onboarding/ ou /api/ — deixa passar
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
    // Only pass safe, relative paths to avoid open redirect
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
