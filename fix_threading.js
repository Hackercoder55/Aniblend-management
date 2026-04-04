const fs = require('fs');
const file = 'd:\\Docs\\TFA Dashboard\\tfa-dashboard\\app\\manager\\page.tsx';
let data = fs.readFileSync(file, 'utf8');

const t1 = `// Always send invoices to the Animator's main workspace channel, not a specific project thread
        const thread_id = anim.Channel_ID || projs.find(p => p.Thread_ID)?.Thread_ID || ''`;

const r1 = `// Use the current project thread first, fallback to animator main workspace channel
        const thread_id = projs.find(p => p.Thread_ID)?.Thread_ID || anim.Channel_ID || ''`;

if (data.includes(t1)) {
    data = data.split(t1).join(r1);
    console.log("Replaced thread logic");
} else { console.log("t1 not found"); }

const t2 = `          month_label: invoiceMonth,
          invoice_date: new Date().toISOString(),
          line_items: lineItems || [],
          total_amount: totalVal,`;

const r2 = `          month_label: invoiceMonth,
          invoice_date: new Date().toISOString(),
          line_items: JSON.stringify(lineItems || []),
          total_amount: totalVal,`;

if (data.includes(t2)) {
    data = data.split(t2).join(r2);
    console.log("Replaced line items logic");
} else { console.log("t2 not found"); }

fs.writeFileSync(file, data);
