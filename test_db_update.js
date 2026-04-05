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
    const payload = {
        action: 'update',
        payload: { bonus: 13500, tds_percent: 10, Timestamp: new Date().toISOString() },
        match: { id: 193 }
    };

    console.log("Sending update request to api endpoint...");
    // Since we're in node, we can't call /api/payments locally unless Next server is running, 
    // so let's just use the Supabase direct API to test if that's the issue, or what the exact error is.
    const res = await fetch(`${supabaseUrl}/rest/v1/payments?id=eq.193`, {
        method: 'PATCH',
        headers: { 
            'apikey': supabaseKey, 
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify(payload.payload)
    });
    
    if (!res.ok) {
        console.error("error:", await res.text());
    } else {
        const data = await res.json();
        console.log("Success! Data:", data);
    }
}
run();
