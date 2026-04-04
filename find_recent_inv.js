const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    'https://qhgdamefwmhpjkqpoxvy.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZ2RhbWVmd21ocGprcXBveHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNDU1NzcsImV4cCI6MjA4NjkyMTU3N30.kqST2VJZyiBgI6VMaLIf2WwPM5LgGD8Toi8ic3xWUIQ'
);

async function check() {
    const minDate = new Date();
    minDate.setHours(minDate.getHours() - 48); // last 2 days
    const { data: invoices, error } = await supabase
        .from('invoices')
        .select('*')
        .gte('created_at', minDate.toISOString());
        
    fs.writeFileSync('invoices2_debug.json', JSON.stringify(invoices || [], null, 2));
    console.log('done: ' + (invoices ? invoices.length : 'error'));
}

check();
