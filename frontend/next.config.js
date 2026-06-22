/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  // Remove chamadas a console.* em build production (mantém warn/info p/ alertas
  // legítimos). Evita vazamento de payloads/credenciais via console.error nos
  // catch-blocks do frontend.
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['warn', 'info'] }
      : false,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // X-Frame-Options é setado no middleware.ts (por rota): DENY em tudo,
          // SAMEORIGIN só no HTML público de proposta, que é embedado no iframe
          // da página /p/<token>. Aqui era DENY global e quebrava esse embed.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // HSTS — força HTTPS por 2 anos, includeSubDomains e preload-ready.
          // Sem efeito em HTTP/dev; browsers só honram via HTTPS.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // COOP — isola janela do site de janelas cross-origin (Spectre, etc.)
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          // CORP — só permite carregar recursos same-origin via subrecursos cross-origin
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          // Nota: Content-Security-Policy é setado por request no middleware.ts
          // (CSP nonce-based — não pode vir daqui pois nonce muda por request).
        ],
      },
    ];
  },
}

module.exports = nextConfig
