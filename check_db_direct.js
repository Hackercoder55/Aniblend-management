const fs = require('fs');

const envFile = fs.readFileSync('d:\\Docs\\TFA Dashboard\\tfa-dashboard\\.env.local', 'utf8');
let supabaseUrl = '';
let supabaseKey = '';

envFile.split('\n').forEach(line => {
    if (line.includes('NEXT_PUBLIC_SUPABASE_URL=')) {
        supabaseUrl = line.split('=')[1].replace(/"/g, '').trim();
    }
    if (line.includes('SUPABASE_SERVICE_ROLE_KEY=')) {
        supabaseKey = line.split('=')[1].replace(/"/g, '').trim();
    }
});

async function run() {
    const res2 = await fetch(`${supabaseUrl}/rest/v1/payments?Employee%20ID=eq.1025&order=Timestamp.desc`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const data2 = await res2.json();

    fs.writeFileSync('d:\\Docs\\TFA Dashboard\\tfa-dashboard\\check_payments_output_2.json', JSON.stringify({jeo: data2}, null, 2));
    console.log("Done checking db directly");
}
run();
