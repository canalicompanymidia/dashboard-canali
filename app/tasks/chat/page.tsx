import { ChatView } from '@/components/tasks/chat'
import { Topbar } from '@/components/tasks/topbar'
import { requireColaborador } from '@/lib/auth'
import { ehMembro, getConversas, getMensagens } from '@/lib/tasks/chat'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const colab = await requireColaborador()
  const { c } = await searchParams
  const aberta = c && UUID.test(c) ? c : null

  // A conversa do link já vem com as mensagens, se a pessoa for membro.
  const [conversas, mensagens] = await Promise.all([
    getConversas(colab.email),
    aberta ? ehMembro(aberta, colab.email).then((ok) => (ok ? getMensagens(aberta) : null)) : Promise.resolve(null),
  ])

  return (
    <>
      <Topbar crumbs={[{ label: 'Chat' }]} />
      <ChatView conversasIniciais={conversas} abertaInicial={aberta} mensagensIniciais={mensagens} />
    </>
  )
}
