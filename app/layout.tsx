import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'

import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { ThemeScript } from '@/components/layout/theme-script'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getBusinessDateParts } from '@/lib/calculations'

import './globals.css'

// General Sans (Fontshare, licença ITF Free Font), servida pelo próprio Hub.
// É a mesma família do logotipo da Canali Co. Georgia, a fonte dos títulos,
// vem do sistema operacional.
const generalSans = localFont({
  src: [
    { path: './fonts/GeneralSans-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/GeneralSans-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/GeneralSans-600.woff2', weight: '600', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-general-sans',
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
    { media: '(prefers-color-scheme: light)', color: '#0b1628' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1628' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { year } = getBusinessDateParts()

  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${generalSans.variable} font-sans`}>
        <TooltipProvider>
          <div className="flex min-h-dvh flex-col">
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter year={year} />
          </div>
        </TooltipProvider>
      </body>
    </html>
  )
}
