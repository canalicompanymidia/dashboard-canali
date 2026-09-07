import { NextResponse } from 'next/server'

import { getSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Encerra a sessão. POST de propósito: um GET poderia ser disparado por
 *  um <img> em qualquer site e deslogar a pessoa sem ela pedir (CSRF). */
export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient()
  if (supabase) await supabase.auth.signOut()

  return NextResponse.redirect(new URL('/login', new URL(request.url).origin), {
    status: 303,
  })
}
