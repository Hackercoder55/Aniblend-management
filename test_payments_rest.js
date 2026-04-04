const fs = require('fs');
const https = require('https');

const envFile = fs.readFileSync('.env.local', 'utf8');
let supabaseUrl = '';
let supabaseKey = '';

envFile.split('\n').forEach(line => {
    if (line.includes('NEXT_PUBLIC_SUPABASE_URL=')) {
        supabaseUrl = line.split('="')[1].replace('"', '').trim();
    }
    if (line.includes('SUPABASE_SERVICE_ROLE_KEY=')) {
        supabaseKey = line.split('="')[1].replace('"', '').trim();
    }
});

const options = {
  hostname: supabaseUrl.replace('https://', ''),
  port: 443,
  path: '/rest/v1/payments?limit=1',
  method: 'GET',
  headers: {
    'apikey': supabaseKey,
    'Authorization': 'Bearer ' + supabaseKey
  }
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
      console.log('Status code:', res.statusCode);
      if (res.statusCode === 200) {
          const parsed = JSON.parse(data);
          if (parsed.length > 0) {
              console.log('Keys:', Object.keys(parsed[0]));
          } else {
              console.log('No data');
          }
      } else {
          console.log(data);
      }
  });
});

req.on('error', error => {
  console.error(error);
});

req.end();
