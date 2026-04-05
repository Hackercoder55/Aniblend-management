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
    const res = await fetch(`${supabaseUrl}/rest/v1/payments?select=id,Employee%20ID,tds_percent,bonus,Timestamp,Payment_Status&order=Timestamp.desc&limit=5`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    
    const data = await res.json();
    console.log("Recent payments:");
    console.log(data);

    // Also get for employee 1025 (Jeo Raj) which is in the user's screenshot
    const res2 = await fetch(`${supabaseUrl}/rest/v1/payments?Employee%20ID=eq.1025&order=Timestamp.desc`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const data2 = await res2.json();
    console.log("Payments for Jeo Raj (1025):");
    console.log(data2);
}
run();
