const fs = require('fs');
async function check() {
    try {
        const res = await fetch('http://localhost:3000/api/invoices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'select',
                order: { column: 'created_at', options: { ascending: false } },
                limit: 10
            })
        });
        const json = await res.json();
        fs.writeFileSync('invoices_admin.json', JSON.stringify(json, null, 2));
        console.log("Done fetching through API route.");
    } catch (e) {
        console.error(e);
    }
}
check();
