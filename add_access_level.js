const { createClient } = require('@supabase/supabase-js');

const s = createClient(
  'https://qhgdamefwmhpjkqpoxvy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZ2RhbWVmd21ocGprcXBveHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNDU1NzcsImV4cCI6MjA4NjkyMTU3N30.kqST2VJZyiBgI6VMaLIf2WwPM5LgGD8Toi8ic3xWUIQ'
);

async function main() {
  // Try adding column via RPC (if exec_sql function exists)
  const { data, error } = await s.rpc('exec_sql', { 
    query: "ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'lead'" 
  });
  
  if (error) {
    console.log('RPC exec_sql not available:', error.message);
    console.log('\n⚠️  You need to manually add the column in Supabase SQL Editor:');
    console.log("ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS access_level TEXT DEFAULT 'lead';");
    console.log('\nThen for manually created users (Rohit), run:');
    console.log("UPDATE dashboard_users SET access_level = 'full' WHERE full_name = 'Rohit';");
  } else {
    console.log('✅ Column added successfully:', data);
  }
}

main();
