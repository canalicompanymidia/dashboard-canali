/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.googleusercontent.com' },
      { protocol: 'https', hostname: 'drive.google.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**.vturb.com.br' },
      { protocol: 'https', hostname: '**.cloudfront.net' },
    ],
  },
  async headers() {
    return [
      {
        // Vale para o site inteiro.
        source: '/:path*',
        headers: [
          // Impede que o Hub seja embutido num iframe de outro site —
          // o golpe é sobrepor uma página falsa e capturar cliques do
          // colaborador já logado. frame-ancestors é a versão moderna
          // do X-Frame-Options; mantemos os dois pela compatibilidade.
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Content-Security-Policy',
            // Escopo deliberadamente restrito. Um script-src fechado
            // exigiria nonce em todo script inline que o Next injeta, e
            // quebraria o app; estas quatro diretivas, por outro lado,
            // barram ataques reais sem risco de regressão.
            value: [
              "frame-ancestors 'none'", // ninguém embute o Hub
              "base-uri 'self'", //        <base> injetado não redireciona recursos
              "form-action 'self'", //     formulário não posta para fora
              "object-src 'none'", //      sem Flash/applet legado
            ].join('; '),
          },
          // Um ano de HTTPS obrigatório. A Vercel já serve só HTTPS; o
          // header fecha a janela do primeiro acesso em rede hostil.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          // Área interna não entra em buscador. Com login isso já seria
          // improvável, mas o custo de garantir é zero.
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
      {
        // O cofre nunca deve ser armazenado em cache por proxies ou pelo browser.
        source: '/api/vault/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, private' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
      {
        // A landing é material de marketing: pública e indexável de propósito.
        source: '/landing/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'all' }],
      },
    ]
  },
}

export default nextConfig
