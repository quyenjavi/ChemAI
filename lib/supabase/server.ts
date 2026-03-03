import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createClient } from '@supabase/supabase-js'
import { env } from '../env'

export function createSupabaseServer() {
  const cookieStore = cookies()
  // Auth helpers will read env automatically
  return createRouteHandlerClient({ cookies: () => cookieStore })
}

export function serviceRoleClient() {
  return createClient(env.supabaseUrl, env.supabaseServiceKey)
}
