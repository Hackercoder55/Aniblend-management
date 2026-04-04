const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
let envFile = '';
try { envFile = fs.readFileSync('d:\\Docs\\TFA Dashboard\\tfa-dashboard\\.env', 'utf8'); } catch(e){}
if(!envFile) {
  try { envFile = fs.readFileSync('d:\\Docs\\TFA Dashboard\\tfa-dashboard\\.env.local', 'utf8'); } catch(e){}
}

let supabaseUrl = '';
let supabaseKey = '';

envFile.split('\n').forEach(line => {
    if (line.includes('NEXT_PUBLIC_SUPABASE_URL=')) {
        supabaseUrl = line.split('="')[1]?.replace('"', '').trim() || line.split('=')[1]?.replace('"', '').trim();
    }
    if (line.includes('SUPABASE_SERVICE_ROLE_KEY=')) {
        supabaseKey = line.split('="')[1]?.replace('"', '').trim() || line.split('=')[1]?.replace('"', '').trim();
    }
});

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: invs, error } = await supabase.from('invoices').select('*').eq('employee_id', '1058').order('id', { ascending: false }).limit(5);
    console.log("Recent Invoices for Anshuman:", JSON.stringify(invs, null, 2));
    
    if (error) console.error(error);
}
run();
