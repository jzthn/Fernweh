import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  'https://tdgwulykndzopmkmzsfg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkZ3d1bHlrbmR6b3Bta216c2ZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NjczOTUsImV4cCI6MjA5NTU0MzM5NX0.kp19XJcMD9tgP1-NtqK5go24h50gOfn5HUtcCtumHm0'
)