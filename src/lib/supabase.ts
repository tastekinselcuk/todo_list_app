import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://saamxvuphakjpffvvcbj.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNhYW14dnVwaGFranBmZnZ2Y2JqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3NTEwMjcsImV4cCI6MjA4NzMyNzAyN30.zBRHDdZrq3huBtk5nLHY28zt_3IB0pF0r41lVfMQCT4'
""
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase URL or Anon Key. Check your .env.local file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
