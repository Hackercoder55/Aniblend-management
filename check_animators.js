const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
let url = '', key = '';
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if(!k) return;
  const kTrim = k.trim();
  const vTrim = v.join('=').trim().replace(/^['"]|['"]$/g, '');
  if(kTrim === 'NEXT_PUBLIC_SUPABASE_URL' || kTrim === 'SUPABASE_URL') url = vTrim;
  if(kTrim === 'SUPABASE_SERVICE_ROLE_KEY') key = vTrim;
});
const supabase = createClient(url, key);
supabase.from('animators').select('*').limit(1).then(({data}) => console.log(Object.keys(data[0] || {})));
