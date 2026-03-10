const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://qhgdamefwmhpjkqpoxvy.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZ2RhbWVmd21ocGprcXBveHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNDU1NzcsImV4cCI6MjA4NjkyMTU3N30.kqST2VJZyiBgI6VMaLIf2WwPM5LgGD8Toi8ic3xWUIQ');
async function run() {
    const { data, error } = await supabase.from('payments').select('*').eq('Employee ID', '1009');
    console.log('Payments for 1009:', data?.length);
    if (data) {
        data.forEach(d => console.log(d.Timestamp, d.bonus, d.payment_status));
    }
}
run();
