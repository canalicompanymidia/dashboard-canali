import Link from 'next/link'
import { ListChecks, Settings2 } from 'lucide-react'

import { CanaliLogo } from '@/components/layout/canali-logo'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { Button } from '@/components/ui/button'
import { getColaborador } from '@/lib/auth'
import { getAvatarDe } from '@/lib/tasks/data'
import { corDaPessoa, iniciais } from '@/lib/tasks/pessoas'
import { formatDate, primeiroNome } from '@/lib/utils'

export async function SiteHeader() {
  // Nas telas de login e "sem acesso" não há colaborador — e mostrar um
  // botão "Admin" ali seria oferecer uma porta que devolve a pessoa para
  // a mesma tela. O papel também decide: colaborador comum não vê o
  // atalho de um painel que não pode abrir.
  const colaborador = await getColaborador()
  const avatar = colaborador ? await getAvatarDe(colaborador.email) : null

  return (
    // Barra sempre em marinho-900, nos dois temas: é a assinatura das
    // ferramentas internas da Canali Co. (Design System).
    <header className="sticky top-0 z-40 border-b border-[#1c2940] bg-marinho-900 text-white">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href={colaborador ? '/' : '/login'}
          className="group flex items-center gap-2.5 rounded-md text-white"
          aria-label="Canali Co. — Hub Canali Company"
        >
          {/* Símbolo compacto: a versão cheia vira borrão nesta altura. O
              nome ao lado é General Sans, a mesma letra do logotipo. */}
          <CanaliLogo compact className="h-7 w-auto shrink-0 text-white" />
          <span className="text-[17px] leading-none font-medium tracking-[-0.01em]">Canali Co.</span>
          <span className="hidden border-l border-[#2c3a55] pl-3 text-[13px] leading-none font-medium text-[#a3a8b0] sm:inline">
            Hub Canali Company
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-1.5">
          <span className="mr-2 hidden text-xs text-[#a3a8b0] lg:block tabular">
            {formatDate(new Date())}
          </span>
          {colaborador ? (
            <Link
              href="/tasks/preferencias"
              className="mr-1 flex items-center gap-2 rounded-full py-0.5 pr-2 pl-0.5 text-[13px] text-[#c9cdd3] hover:bg-marinho-700 hover:text-white"
              title="Seu perfil e preferências"
            >
              <span
                className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold text-white ring-2 ring-[#2c3a55]"
                style={{ backgroundColor: corDaPessoa(colaborador.email) }}
                aria-hidden
              >
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL assinada e temporária.
                  <img src={avatar} alt="" className="size-full object-cover" />
                ) : (
                  iniciais(colaborador.nome || colaborador.email)
                )}
              </span>
              {colaborador.nome ? <span className="hidden md:block">{primeiroNome(colaborador.nome)}</span> : null}
            </Link>
          ) : null}

          {/* O botão "Painel" saiu: a marca à esquerda já leva para a Home. */}
          {colaborador ? (
            <Button
              variant="outline"
              size="sm"
              asChild
              className="border-[#3a4a68] bg-transparent text-[#e6e8eb] shadow-none hover:bg-marinho-700 hover:text-white"
            >
              <Link href="/tasks">
                <ListChecks className="size-4" />
                <span className="hidden sm:inline">Tasks</span>
              </Link>
            </Button>
          ) : null}

          {colaborador?.papel === 'admin' ? (
            <Button
              variant="outline"
              size="sm"
              asChild
              className="border-[#3a4a68] bg-transparent text-[#e6e8eb] shadow-none hover:bg-marinho-700 hover:text-white"
            >
              <Link href="/admin">
                <Settings2 className="size-4" />
                <span className="hidden sm:inline">Admin</span>
              </Link>
            </Button>
          ) : null}

          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
