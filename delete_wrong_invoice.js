const { createClient } = require('@supabase/supabase-js');

// PLEASE ENTER THE ANIMATOR's EXACT NAME HERE:
const ANIMATOR_NAME = "Anshuman Kashyap Bora"; // Example: "Saraan" or "Anshuman"
// Or specify Invoice Number exactly:
const INVOICE_NUMBER = ""; // e.g., "118831"

const supabase = createClient(
    'https://qhgdamefwmhpjkqpoxvy.supabase.co',
    process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZ2RhbWVmd21ocGprcXBveHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNDU1NzcsImV4cCI6MjA4NjkyMTU3N30.kqST2VJZyiBgI6VMaLIf2WwPM5LgGD8Toi8ic3xWUIQ'
);

async function deleteInvoice() {
    console.log(`Searching for invoice to delete...`);
    
    let query = supabase.from('invoices').select('id, legal_name, invoice_number, status, total_amount');
    
    if (INVOICE_NUMBER) {
        query = query.eq('invoice_number', INVOICE_NUMBER);
    } else if (ANIMATOR_NAME) {
        query = query.ilike('legal_name', `%${ANIMATOR_NAME}%`);
    } else {
        console.log("Please specify an ANIMATOR_NAME or INVOICE_NUMBER.");
        return;
    }

    const { data: invoices, error } = await query;
    
    if (error) {
        console.error("Error finding invoice:", error.message);
        return;
    }
    
    if (!invoices || invoices.length === 0) {
        console.log("No invoices found matching that criteria!");
        return;
    }
    
    console.log(`Found ${invoices.length} matching invoice(s):`);
    console.log(invoices);
    
    // We will delete the most recent one if multiple match
    const targetInvoice = invoices[0];
    
    console.log(`\nDeleting Invoice ID: ${targetInvoice.id} for ${targetInvoice.legal_name} (Amount: ${targetInvoice.total_amount}) ...`);
    
    const { error: delError } = await supabase.from('invoices').delete().eq('id', targetInvoice.id);
    
    if (delError) {
        console.error("Failed to delete invoice:", delError.message);
    } else {
        console.log("✅ Successfully deleted! The animator will now show back up in the 'Send Invoices' section.");
    }
}

deleteInvoice();
