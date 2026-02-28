const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://qhgdamefwmhpjkqpoxvy.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZ2RhbWVmd21ocGprcXBveHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNDU1NzcsImV4cCI6MjA4NjkyMTU3N30.kqST2VJZyiBgI6VMaLIf2WwPM5LgGD8Toi8ic3xWUIQ'
);

async function check() {
    const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('Project_ID', '21218_1246_her');

    console.log(JSON.stringify(data, null, 2));
}

check();
