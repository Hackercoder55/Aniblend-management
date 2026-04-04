const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    'https://qhgdamefwmhpjkqpoxvy.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZ2RhbWVmd21ocGprcXBveHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNDU1NzcsImV4cCI6MjA4NjkyMTU3N30.kqST2VJZyiBgI6VMaLIf2WwPM5LgGD8Toi8ic3xWUIQ'
);

(async () => {
    // 1. Fetch current max sequence
    console.log("Fetching past sequences...");
    const { data: pastInvs, error: seqErr } = await supabase.from('invoices').select('invoice_number').eq('employee_id', '1058')
    console.log(pastInvs, seqErr);

    if (seqErr) return console.error(seqErr);

    let currentSeq = 0;
    if (pastInvs && pastInvs.length > 0) {
        const highest = pastInvs.map(i => {
            const str = (i.invoice_number || '').toString().replace('1058', '')
            return parseInt(str || '0', 10)
        }).filter(n => !isNaN(n)).sort((a, b) => b - a)[0]
        
        if (highest !== undefined) currentSeq = highest;
    }
    const newSeq = currentSeq + 1;
    const invoiceNumber = `1058${String(newSeq).padStart(2, '0')}`;
    console.log("Generated:", invoiceNumber);

    const insertPayload = {
        invoice_number: invoiceNumber,
        employee_id: '1058',
        legal_name: 'Anshuman Kashyap Bora',
        month_label: 'Mar 2026',
        invoice_date: new Date().toISOString(),
        line_items: [{"project_id":"2824_148","title":"2824_148","amount":250,"seconds":12}],
        total_amount: 250,
        bonus_amount: 0,
        tds_percent: 10,
        tds_amount: 25,
        net_payable: 225,
        status: 'Draft',
        thread_id: '1355650220263673998',
        sent_at: null,
    };
    console.log("Attempting insert...");
    const { data, error } = await supabase.from('invoices').insert(insertPayload);
    console.log("Result:", data, "Error:", error);
})();
