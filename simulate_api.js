const fetch = require('node-fetch');

(async () => {
    const payload = {
        action: 'insert',
        payload: {
            invoice_number: '105803',
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
        }
    };

    try {
        const res = await fetch('http://localhost:3000/api/invoices', {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'application/json' }
        });
        const text = await res.text();
        console.log("Status:", res.status, "Body:", text);
    } catch(e) { console.error(e); }
})();
