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
        payload: { bonus_note: 'test' },
        match: { id: 193 }
    };

    console.log("Testing POST insert with bonus_note...");
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
