const fs = require('fs');

async function checkDiscord() {
  const env = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : fs.readFileSync('.env', 'utf8');
  const tokenLine = env.split('\n').find(l => l.includes('DISCORD_BOT_TOKEN'));
  const token = tokenLine ? tokenLine.split('=')[1].replace(/['\"]/g, '').trim() : null;
  const channelId = '1472534509170200596';

  console.log('Testing GET on channel:', channelId);
  const getReq = await fetch('https://discord.com/api/v10/channels/' + channelId, {
    headers: { 'Authorization': 'Bot ' + token }
  });
  const getRes = await getReq.json();
  console.log('GET STATUS:', getReq.status);
  console.log('GET BODY:', getRes.message || getRes.name || getRes);

  console.log('\nTesting POST to channel messages:', channelId);
  const postReq = await fetch('https://discord.com/api/v10/channels/' + channelId + '/messages', {
    method: 'POST',
    headers: { 'Authorization': 'Bot ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'Test post' })
  });
  const postRes = await postReq.json();
  console.log('POST STATUS:', postReq.status);
  console.log('POST BODY:', postRes);
}

checkDiscord().catch(console.error);
