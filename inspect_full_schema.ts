 import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

async function inspect() {
  const envPath = path.join(process.cwd(), '.env.local')
  const envContent = fs.readFileSync(envPath, 'utf-8')
  const env: Record<string, string> = {}
  envContent.split('\n').forEach(line => {
    const [key, ...rest] = line.split('=')
    if (key && rest.length) {
      env[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '')
    }
  })

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const supabase = createClient(supabaseUrl, supabaseKey)

  const tables = [
    'questions',
    'quiz_attempt_answers',
    'quiz_attempts',
    'question_reports',
    'question_revision_history',
    'question_review_summary_v',
    'student_attempt_report_status_v'
  ]

  console.log('=== TABLE/VIEW COLUMNS ===')
  for (const table of tables) {
    // We try to fetch one row to see columns
    const { data, error } = await supabase.from(table).select('*').limit(1)
    if (error) {
      console.log(`[${table}] Error:`, error.message)
    } else if (data && data.length > 0) {
      console.log(`[${table}] Columns:`, Object.keys(data[0]))
    } else {
      // If empty, try to get columns via RPC if available, or just log empty
      console.log(`[${table}] Empty (no rows to inspect columns)`)
    }
  }

  console.log('\n=== VIEW DEFINITIONS ===')
  // Usually view definitions are in information_schema.views.
  // We'll try to query it via an RPC if possible, or assume we might not have access.
  // Since we can't run arbitrary SQL easily without a helper RPC, let's see if we can get it.
  const viewInspectorSql = `
    SELECT table_name, view_definition 
    FROM information_schema.views 
    WHERE table_name IN ('question_review_summary_v', 'student_attempt_report_status_v')
  `
  // Try to use a common RPC name for SQL execution if it exists
  const { data: views, error: viewErr } = await supabase.rpc('exec_sql', { sql: viewInspectorSql })
  if (viewErr) {
    console.log('Could not get view definitions via rpc("exec_sql").')
  } else {
    console.log('View Definitions:', views)
  }

  console.log('\n=== FUNCTION SOURCES ===')
  const funcInspectorSql = `
    SELECT routine_name, routine_definition 
    FROM information_schema.routines 
    WHERE routine_name IN ('apply_question_review_wrong_answer', 'apply_question_review_wrong_question', 'get_question_snapshot')
  `
  const { data: funcs, error: funcErr } = await supabase.rpc('exec_sql', { sql: funcInspectorSql })
  if (funcErr) {
    console.log('Could not get function sources via rpc("exec_sql").')
  } else {
    console.log('Function Sources:', funcs)
  }
}

inspect()
