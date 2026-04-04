const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://qhgdamefwmhpjkqpoxvy.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZ2RhbWVmd21ocGprcXBveHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNDU1NzcsImV4cCI6MjA4NjkyMTU3N30.kqST2VJZyiBgI6VMaLIf2WwPM5LgGD8Toi8ic3xWUIQ'
);

async function check() {
    console.log("Fetching recent invoices...");
    const { data: invoices, error } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error("Error:", error);
        return;
    }
    
    console.log("Recent invoices:");
    invoices.forEach(inv => {
        console.log(`ID: ${inv.id}, Emp: ${inv.employee_id}, Name: ${inv.legal_name}, Status: ${inv.status}, Thread: ${inv.thread_id}, Month: ${inv.month_label}`);
    });
}

check();
