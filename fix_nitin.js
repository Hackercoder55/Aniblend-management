const fs = require('fs');
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZ2RhbWVmd21ocGprcXBveHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNDU1NzcsImV4cCI6MjA4NjkyMTU3N30.kqST2VJZyiBgI6VMaLIf2WwPM5LgGD8Toi8ic3xWUIQ';
const headers = { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' };

async function fix() {
  // Delete invoice 111601
  const delReq = await fetch('https://qhgdamefwmhpjkqpoxvy.supabase.co/rest/v1/invoices?invoice_number=eq.111601', {
    method: 'DELETE',
    headers: headers
  });
  console.log('Invoice 111601 deletion status:', delReq.status);

  // Fetch Nitin's info
  const animReq = await fetch('https://qhgdamefwmhpjkqpoxvy.supabase.co/rest/v1/animators?Name=ilike.*Nitin*', { headers });
  const anims = await animReq.json();
  console.log('Nitin Anim:', anims[0]);

  // Fetch Nitin's Projects to see which one the invoice is for and what the Thread ID is
  if (anims[0]) {
      const projReq = await fetch('https://qhgdamefwmhpjkqpoxvy.supabase.co/rest/v1/projects?Employee_ID=eq.' + anims[0].Employee_ID + '&Status=eq.Done unpaid', { headers });
      const projs = await projReq.json();
      console.log('Nitin Projects:', projs.length > 0 ? projs.map(p => ({ Project_ID: p.Project_ID, Thread_ID: p.Thread_ID })) : 'none');
  }
}
fix().catch(console.error);
