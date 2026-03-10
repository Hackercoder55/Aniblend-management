require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data, error } = await sb.from('payments').select('*').limit(2);
    if (error) {
        console.error('Error fetching payments:', error);
    } else {
        console.log('Payment Row Keys:');
        if (data.length > 0) {
            console.log(Object.keys(data[0]));
        } else {
            console.log('No data');
        }
    }
}

run();
