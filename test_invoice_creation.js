const fs = require('fs');

const envFile = fs.readFileSync('d:\\Docs\\TFA Dashboard\\tfa-dashboard\\.env.local', 'utf8');
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
    
    // 1. Fetch past invoices for sequence
    const res1 = await fetch(`${supabaseUrl}/rest/v1/invoices?employee_id=eq.${eid}&select=invoice_number`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const pastInvs = await res1.json();
    console.log("Past Invs:", pastInvs);
    
    let currentSeq = 0;
    if (pastInvs && pastInvs.length > 0) {
        const highest = pastInvs.map(i => {
           const str = (i.invoice_number || '').toString().replace(eid, '');
           return parseInt(str || '0', 10);
        }).filter(n => !isNaN(n)).sort((a,b) => b - a)[0];
        if (highest !== undefined) currentSeq = highest;
    }
    const newSeq = currentSeq + 1;
    const invoiceNumber = `${eid}${String(newSeq).padStart(2, '0')}`;
    console.log("New Invoice Number:", invoiceNumber);

    // 2. Fetch projects logic
    const res2 = await fetch(`${supabaseUrl}/rest/v1/projects?select=Project_ID,Status,Payment_Status,Employee_ID,Animator`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const projects = await res2.json();

    // 3. Fetch invoices to build invoicedProjectIds
    const res3 = await fetch(`${supabaseUrl}/rest/v1/invoices?select=line_items`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const invoices = await res3.json();

    const invoicedProjectIds = new Set();
    invoices.forEach(inv => {
        let items = inv.line_items;
        if (typeof items === 'string') {
            try { items = JSON.parse(items); } catch(e) { items = []; }
        }
        if (items && Array.isArray(items)) {
            items.forEach(item => {
                if (item.project_id) invoicedProjectIds.add(item.project_id);
            });
        }
    });

    // 4. Find unpaid for Anshuman
    const projs = [];
    projects.forEach(p => {
        if (p.Status === 'Approved' && p.Payment_Status !== 'Paid' && !invoicedProjectIds.has(p.Project_ID)) {
            let p_eid = p.Employee_ID || '';
            if (p_eid === eid || (p.Animator && p.Animator.toLowerCase().includes('anshuman'))) {
                projs.push(p);
            }
        }
    });
    console.log("Found Unpaid Projects for Anshuman:", projs.length);

    // 5. Build payload
    const payload = {
        invoice_number: invoiceNumber,
        employee_id: eid,
        legal_name: 'Anshuman Kashyap Bora test',
        month_label: 'Mar 2026',
        invoice_date: '2026-03-29',
        line_items: JSON.stringify([{ project_id: 'test' }]), // supabase REST takes string/json, but Next.js apiClient object does json stringify itself via array
        total_amount: 1000,
        tds_percent: 10,
        tds_amount: 100,
        net_payable: 900,
        status: 'Draft',
        thread_id: 'test_thread'
    };

    console.log("Testing POST insert...");
    const res4 = await fetch(`${supabaseUrl}/rest/v1/invoices`, {
        method: 'POST',
        headers: { 
            'apikey': supabaseKey, 
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify(payload)
    });
    
    if (!res4.ok) {
        const err = await res4.text();
        console.error("Insert failed:", err);
    } else {
        const dat = await res4.json();
        console.log("Insert Success:", dat[0].id);
        
        // delete the test record
        const res5 = await fetch(`${supabaseUrl}/rest/v1/invoices?id=eq.${dat[0].id}`, {
            method: 'DELETE',
            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
        });
        console.log("Test record deleted:", res5.ok);
    }
}
run();
