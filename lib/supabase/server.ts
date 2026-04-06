import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { env } from '../env'

export function createSupabaseServer() {
  const cookieStore = cookies()
  // Auth helpers will read env automatically
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore })

  const originalGetUser = supabase.auth.getUser.bind(supabase.auth)
  ;(supabase.auth as any).getUser = async (...args: any[]) => {
    try {
      const { data, error } = await supabase.auth.getSession()
      const user = data.session?.user ?? null
      if (!user) return { data: { user: null }, error: error || new Error('Unauthorized') }
      return { data: { user }, error: null }
    } catch (e: any) {
      try {
        return await originalGetUser(...args)
      } catch {
        return { data: { user: null }, error: e }
      }
    }
  }

  return supabase
}

export function serviceRoleClient() {
  return createClient(env.supabaseUrl, env.supabaseServiceKey)
}
