import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://qhgdamefwmhpjkqpoxvy.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZ2RhbWVmd21ocGprcXBveHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNDU1NzcsImV4cCI6MjA4NjkyMTU3N30.kqST2VJZyiBgI6VMaLIf2WwPM5LgGD8Toi8ic3xWUIQ'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
