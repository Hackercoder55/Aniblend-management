const fs = require('fs');
const lines = fs.readFileSync('app/manager/page.tsx', 'utf8').split('\n');
lines.forEach((line, index) => {
    if (line.includes('const pendingInvoices')) {
        console.log(`${index + 1}: ${line}`);
    }
});
