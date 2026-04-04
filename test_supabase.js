const fs = require('fs');

const envFile = fs.readFileSync('d:\\Docs\\TFA Dashboard\\tfa-dashboard\\.env.local', 'utf8');
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

// Since the url is missing in env.local, I'll fallback to known from history if blank
if (!supabaseUrl) {
    supabaseUrl = 'https://sgszohgxtmpxlajkcdzj.supabase.co'; // Replace with a fake or throw error, wait, I can just read it from Next Config.
}

async function run() {
    console.log("Cannot run securely without URL");
}
run();
