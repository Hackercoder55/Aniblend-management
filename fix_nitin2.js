const fs = require('fs');
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZ2RhbWVmd21ocGprcXBveHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNDU1NzcsImV4cCI6MjA4NjkyMTU3N30.kqST2VJZyiBgI6VMaLIf2WwPM5LgGD8Toi8ic3xWUIQ';
const headers = { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' };

async function fix() {
  const animReq = await fetch('https://qhgdamefwmhpjkqpoxvy.supabase.co/rest/v1/animators?Name=ilike.*Nitin*', { headers });
  const anims = await animReq.json();
  fs.writeFileSync('nitin_info.json', JSON.stringify(anims[0], null, 2));
}
fix();
