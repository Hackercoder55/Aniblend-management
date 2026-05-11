const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  let allProjects = [];
  let from = 0;
  const step = 1000;
  let keepFetching = true;

  while (keepFetching) {
    const { data, error } = await supabase.from('projects').select('*').range(from, from + step - 1);
    if (error) {
      console.error('ERROR:', error);
      break;
    }
    if (!data) break;
    allProjects = [...allProjects, ...data];
    if (data.length < step) keepFetching = false;
    from += step;
  }
  console.log('Fetched:', allProjects.length);
}
test();
