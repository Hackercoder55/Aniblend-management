const fs = require('fs');
const file = 'd:\\Docs\\TFA Dashboard\\tfa-dashboard\\app\\manager\\page.tsx';
let data = fs.readFileSync(file, 'utf8');

const invoicedProjectIdsCode = `
  // All project IDs that have already been included in an invoice
  const invoicedProjectIds = new Set<string>()
  invoices.forEach(inv => {
    if (inv.line_items && Array.isArray(inv.line_items)) {
      inv.line_items.forEach((item: any) => {
        if (item.project_id) invoicedProjectIds.add(item.project_id)
      })
    }
  })
`;

data = data.replace(
  "// Approved projects not yet paid (for the send panel)", 
  invoicedProjectIdsCode + "\n  // Approved projects not yet paid (for the send panel)"
);

data = data.replace(
  "if (p.Status === 'Approved' && p.Payment_Status !== 'Paid') {", 
  "if (p.Status === 'Approved' && p.Payment_Status !== 'Paid' && !invoicedProjectIds.has(p.Project_ID)) {"
);

data = data.replace(
  "const notSentEids = Object.keys(approvedUnpaidByEid).filter(eid => !sentEids.has(eid))",
  "const notSentEids = Object.keys(approvedUnpaidByEid)"
);

data = data.replace(
  ".filter(([eid]) => !sentEids.has(eid))",
  ""
);

fs.writeFileSync(file, data);
console.log('Done mapping invoices per project!');
