export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  difyBaseUrl: process.env.DIFY_BASE_URL || 'https://api.dify.ai/v1',
  difyWorkflowKey: process.env.DIFY_WORKFLOW_API_KEY as string,
  difyChatKey: process.env.DIFY_CHAT_API_KEY as string,
}

export function assertEnv() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error('Missing Supabase public env')
  }
}
