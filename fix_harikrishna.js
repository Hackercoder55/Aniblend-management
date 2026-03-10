import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qhgdamefwmhpjkqpoxvy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZ2RhbWVmd21ocGprcXBveHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNDU1NzcsImV4cCI6MjA4NjkyMTU3N30.kqST2VJZyiBgI6VMaLIf2WwPM5LgGD8Toi8ic3xWUIQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
    const { data: invoices, error: eqErr } = await supabase
        .from('invoices')
        .select('*')
        .ilike('legal_name', '%harikrishnan%')
        .eq('status', 'Acknowledged');

    console.log('Invoices found:', invoices);

    if (invoices && invoices.length > 0) {
        for (const inv of invoices) {
            const { error } = await supabase
                .from('invoices')
                .update({ status: 'Paid' })
                .eq('id', inv.id);
            if (error) {
                console.error('Error updating invoice:', error);
            } else {
                console.log(`Updated invoice ${inv.id} to Paid`);
            }
        }
    } else {
        console.log('No acknowledged invoices found for Harikrishnan.');
    }
}

fix();
