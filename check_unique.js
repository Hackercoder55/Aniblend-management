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
    const res = await fetch(`${supabaseUrl}/rest/v1/payments?select=Employee%20ID`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const rows = await res.json();
    
    const counts = {};
    let duplicates = false;
    for (const r of rows) {
        const id = r['Employee ID'];
        if (!id) continue;
        if (counts[id]) {
            counts[id]++;
            duplicates = true;
        } else {
            counts[id] = 1;
        }
    }
    console.log("Are there duplicates of Employee ID?", duplicates);
    console.log(Object.entries(counts).filter(x => x[1] > 1).slice(0, 5));
}
run();
