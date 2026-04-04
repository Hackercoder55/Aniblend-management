const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

let supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

try {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  envFile.split('\n').forEach(line => {
    const [key, ...values] = line.split('=');
    if (!key) return;
    const cleanKey = key.trim();
    const cleanVal = values.join('=').trim().replace(/^['"]|['"]$/g, '');
    if (cleanKey === 'SUPABASE_URL' || cleanKey === 'NEXT_PUBLIC_SUPABASE_URL') supabaseUrl = supabaseUrl || cleanVal;
    if (cleanKey === 'SUPABASE_SERVICE_ROLE_KEY') supabaseKey = supabaseKey || cleanVal;
  });
} catch (e) {}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('projects').select('*').limit(1);
  if (error) console.error(error);
  else console.log(Object.keys(data[0]));
}
run();
