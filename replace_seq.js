const fs = require('fs');
const file = 'd:\\Docs\\TFA Dashboard\\tfa-dashboard\\app\\manager\\page.tsx';
let data = fs.readFileSync(file, 'utf8');

const target = `// Get or create invoice counter
        const { data: ctrData } = await apiClient.from('invoice_counter').select('*').match({ employee_id: eid })
        const currentSeq = (ctrData && ctrData[0]?.last_seq) || 0
        const newSeq = currentSeq + 1
        await apiClient.from('invoice_counter').upsert({ employee_id: eid, last_seq: newSeq })
        const invoiceNumber = \`\${eid}\${String(newSeq).padStart(2, '0')}\``;

const replacement = `// Get past sequence safely by looking at existing invoices
        const { data: pastInvs } = await apiClient.from('invoices').select('invoice_number').eq('employee_id', eid)
        let currentSeq = 0
        if (pastInvs && pastInvs.length > 0) {
           const strHeights = pastInvs.map((i: any) => {
              const str = (i.invoice_number || '').toString().replace(eid, '')
              return parseInt(str || '0', 10)
           }).filter((n: number) => !isNaN(n))
           if (strHeights.length > 0) {
             currentSeq = Math.max(...strHeights)
           }
        }
        const newSeq = currentSeq + 1
        const invoiceNumber = \`\${eid}\${String(newSeq).padStart(2, '0')}\``;

if (data.includes(target)) {
   data = data.replace(target, replacement);
   fs.writeFileSync(file, data);
   console.log('Success!');
} else {
   console.log('Target not found!');
}
