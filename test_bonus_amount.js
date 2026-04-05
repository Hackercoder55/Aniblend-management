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
        invoice_number: 'TEST0001',
        employee_id: 'TEST_EID',
        legal_name: 'Test Name',
        month_label: 'Mar 2026',
        invoice_date: '2026-03-29',
        line_items: JSON.stringify([{ project_id: 'test' }]),
        total_amount: 1000,
        tds_percent: 10,
        tds_amount: 100,
        bonus_amount: 50,
        net_payable: 950,
        status: 'Draft',
        thread_id: 'test_thread'
    };

    console.log("Testing POST insert with bonus_amount...");
    const res = await fetch(`${supabaseUrl}/rest/v1/invoices`, {
        method: 'POST',
        headers: { 
            'apikey': supabaseKey, 
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify(payload)
    });
    
    if (!res.ok) {
        const err = await res.text();
        console.error("Insert failed:", err);
    } else {
        const dat = await res.json();
        console.log("Insert Success:", dat[0].id);
        
        await fetch(`${supabaseUrl}/rest/v1/invoices?id=eq.${dat[0].id}`, {
            method: 'DELETE',
            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        });
    }
}
run();
