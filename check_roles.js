const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
let url = '', key = '';
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if(!k) return;
  const kT = k.trim();
  const vT = v.join('=').trim().replace(/^['"]|['"]$/g, '');
  if(kT === 'NEXT_PUBLIC_SUPABASE_URL') url = vT;
  if(kT === 'SUPABASE_SERVICE_ROLE_KEY') key = vT;
});
const supabase = createClient(url, key);
supabase.from('animators').select('Role').then(({data}) => console.log([...new Set(data.map(d => d.Role))]));
