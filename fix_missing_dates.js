// Fix: Set Approved_Date to "01 Feb 2026" for all Approved/Paid/Closed projects
// that are missing Approved_Date AND Date Approved fields
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://qhgdamefwmhpjkqpoxvy.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZ2RhbWVmd21ocGprcXBveHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNDU1NzcsImV4cCI6MjA4NjkyMTU3N30.kqST2VJZyiBgI6VMaLIf2WwPM5LgGD8Toi8ic3xWUIQ'
);

async function fixMissingDates() {
  console.log('🔍 Fetching all Approved/Paid/Closed projects...');
  
  // Fetch in batches to avoid 1000 row limit
  const [{ data: batch1 }, { data: batch2 }] = await Promise.all([
    supabase.from('projects').select('id, Project_ID, Status, Approved_Date, "Date Approved"')
      .in('Status', ['Approved', 'Paid', 'Closed'])
      .order('id', { ascending: false })
      .range(0, 999),
    supabase.from('projects').select('id, Project_ID, Status, Approved_Date, "Date Approved"')
      .in('Status', ['Approved', 'Paid', 'Closed'])
      .order('id', { ascending: false })
      .range(1000, 1999),
  ]);

  const allProjects = [...(batch1 || []), ...(batch2 || [])];
  console.log(`📊 Total Approved/Paid/Closed projects: ${allProjects.length}`);

  // Find ones missing BOTH dates
  const missing = allProjects.filter(p => {
    const d1 = p.Approved_Date || '';
    const d2 = p['Date Approved'] || '';
    return !d1.trim() && !d2.trim();
  });

  console.log(`⚠️  Projects missing approved date: ${missing.length}`);
  
  if (missing.length === 0) {
    console.log('✅ No projects to fix!');
    return;
  }

  // Show what we'll fix
  missing.forEach(p => {
    console.log(`  → ${p.Project_ID} (Status: ${p.Status})`);
  });

  const FEB_DATE = '01 Feb 2026';
  console.log(`\n🔧 Setting all ${missing.length} projects to "${FEB_DATE}"...`);

  let fixed = 0;
  for (const p of missing) {
    const { error } = await supabase
      .from('projects')
      .update({ 
        'Approved_Date': FEB_DATE, 
        'Date Approved': FEB_DATE 
      })
      .eq('id', p.id);
    
    if (error) {
      console.log(`  ❌ Failed ${p.Project_ID}: ${error.message}`);
    } else {
      fixed++;
    }
  }

  console.log(`\n✅ Done! Fixed ${fixed}/${missing.length} projects with date "${FEB_DATE}"`);
}

fixMissingDates().catch(console.error);
