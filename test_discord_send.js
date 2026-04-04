const fs = require('fs');
let env = fs.readFileSync('.env.local', 'utf8');
let token = env.split('\n').find(l => l.includes('DISCORD_BOT_TOKEN')).split('=')[1].replace(/['\"]/g, '').trim();

fetch('https://discord.com/api/v10/channels/1472534509170200596/messages', {
    method: 'POST',
    headers: { 'Authorization': 'Bot ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'Test message from invoice system' })
})
.then(r => r.json().then(data => console.log('POST Status', r.status, 'Response:', data)))
.catch(e => console.log('Fetch error', e));
