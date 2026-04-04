const fs = require('fs');

const envFile = fs.readFileSync('d:\\Docs\\TFA Dashboard\\tfa-dashboard\\.env', 'utf8');
let supabaseUrl = '';
let supabaseKey = '';

envFile.split('\n').forEach(line => {
    if (line.includes('NEXT_PUBLIC_SUPABASE_URL=')) {
        supabaseUrl = line.split('="')[1].replace('"', '').trim();
    }
    if (line.includes('SUPABASE_SERVICE_ROLE_KEY=')) {
        supabaseKey = line.split('="')[1].replace('"', '').trim();
    }
});

async function run() {
    const eid = '1058';
    
    // 1. Fetch past invoices for Anshuman
    const res1 = await fetch(`${supabaseUrl}/rest/v1/invoices?employee_id=eq.${eid}`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const pastInvs = await res1.json();
    console.log("Anshuman Invoices Count:", pastInvs.length);
    console.log("Anshuman Invoices:", pastInvs.map(x => ({ id: x.id, status: x.status, inv: x.invoice_number })));
    
}
run();
