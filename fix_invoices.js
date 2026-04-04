const fs = require('fs');
const file = 'd:\\Docs\\TFA Dashboard\\tfa-dashboard\\app\\manager\\page.tsx';
let data = fs.readFileSync(file, 'utf8');

const targetStr = `const { data } = await apiClient.from('invoices').select('*')`;
const replacement = `const { data } = await apiClient.from('invoices').select('*').order('id', { ascending: false }).limit(9999)`;

if (data.includes(targetStr)) {
    data = data.split(targetStr).join(replacement);
    fs.writeFileSync(file, data);
    console.log("Success");
} else {
    console.log("Not found");
}
