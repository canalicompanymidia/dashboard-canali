import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'

import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { ThemeScript } from '@/components/layout/theme-script'
import { TooltipProvider } from '@/components/ui/tooltip'

import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-geist-sans',
})

export const metadata: Metadata = {
  title: {
    default: 'Hub de Marketing | Canali Company',
    template: '%s | Canali Company',
  },
  description:
    'Centro de comando do marketing da Canali Company: metas anuais, métricas em tempo real, ações ativas, documentos e cofre de senhas.',
  robots: { index: false, follow: false },
  icons: { icon: '/favicon.svg' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafafa' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1117' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${inter.variable} font-sans`}>
        <TooltipProvider>
          <div className="flex min-h-dvh flex-col">
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
        </TooltipProvider>
      </body>
    </html>
  )
}
