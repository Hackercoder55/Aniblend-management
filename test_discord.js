const fs = require('fs');
let env = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : fs.readFileSync('.env', 'utf8');
let tokenLine = env.split('\n').find(l => l.includes('DISCORD_BOT_TOKEN'));
let token = tokenLine ? tokenLine.split('=')[1].replace(/['\"]/g, '').trim() : null;
if (!token) {
    console.log('No token found');
    process.exit(1);
}

const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZ2RhbWVmd21ocGprcXBveHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNDU1NzcsImV4cCI6MjA4NjkyMTU3N30.kqST2VJZyiBgI6VMaLIf2WwPM5LgGD8Toi8ic3xWUIQ';
const headers = { 'apikey': key, 'Authorization': 'Bearer ' + key };

fetch('https://qhgdamefwmhpjkqpoxvy.supabase.co/rest/v1/invoices?order=created_at.desc&limit=1', { headers })
  .then(r => r.json())
  .then(invs => {
      console.log('Latest Invoice:', invs[0]?.invoice_number, invs[0]?.status, invs[0]?.employee_id, invs[0]?.thread_id);
      const targetThread = invs[0]?.thread_id;
      if (!targetThread) return console.log('No thread to message');
      console.log('Fetching Discord channel:', targetThread);
      fetch('https://discord.com/api/v10/channels/' + targetThread, {
          headers: { 'Authorization': 'Bot ' + token }
      })
      .then(r => r.json().then(data => console.log('Discord Channel HTTP', r.status, ':', data.message || data.name)));
  }).catch(e => console.log('Error', e));
