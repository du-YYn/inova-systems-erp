/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      // F7B.5: rota do HTML do iframe NAO recebe os headers globais.
      // CSP/X-Frame-Options sao definidos pelo route handler em
      // app/api/proposal/[token]/html/route.ts (precisa ser permissivo
      // para JS inline e embedavel via frame-ancestors 'self').
      {
        source: '/api/proposal/:token/html',
        headers: [
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      // F7B.5: pagina parent do /p/{token} aceita ser embedada por NADA
      // externo. CSP permite que ELA propria contenha o iframe (frames
      // com src em mesma origem nao sao governados por frame-ancestors,
      // entao child-src/frame-src nao precisam ser relaxados).
      {
        source: '/p/:token',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "connect-src 'self'",
              "font-src 'self'",
              "frame-src 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              `connect-src 'self' https://*.inovasystemssolutions.com https://erp.inovasystemssolutions.com https://cadastro.inovasystemssolutions.com https://parceiro.inovasystemssolutions.com https://viacep.com.br ${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}`,
              "font-src 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
}

module.exports = nextConfig
