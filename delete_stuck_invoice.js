const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
    'https://qhgdamefwmhpjkqpoxvy.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZ2RhbWVmd21ocGprcXBveHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNDU1NzcsImV4cCI6MjA4NjkyMTU3N30.kqST2VJZyiBgI6VMaLIf2WwPM5LgGD8Toi8ic3xWUIQ'
);

async function check() {
    const { data: invoices, error } = await supabase
        .from('invoices')
        .select('id, employee_id, legal_name, status, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
        
    fs.writeFileSync('invoices_debug.json', JSON.stringify(invoices, null, 2));
    console.log('done');
}

check();
