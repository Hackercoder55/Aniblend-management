const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://qhgdamefwmhpjkqpoxvy.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZ2RhbWVmd21ocGprcXBveHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNDU1NzcsImV4cCI6MjA4NjkyMTU3N30.kqST2VJZyiBgI6VMaLIf2WwPM5LgGD8Toi8ic3xWUIQ');
async function run() {
    const { data: invs } = await supabase.from('invoices').select('*').ilike('legal_name', '%harikrishnan%').limit(1);
    if (invs && invs.length > 0) {
        const inv = invs[0];
        const { error } = await supabase.from('invoices').update({ bonus_amount: null }).eq('id', inv.id);
        console.log('Reset Harikrishnan bonus. Error?', error);
    }
}
run();
