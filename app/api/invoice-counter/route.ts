import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        const body = await request.json();
        const { action, payload, match, single } = body;

        let query: any = supabaseAdmin.from('invoice_counter');

        if (action === 'select') {
            query = query.select(payload || '*');
        } else if (action === 'upsert') {
            query = query.upsert(payload);
        } else if (action === 'update') {
            query = query.update(payload);
        }

        if (match) {
            query = query.match(match);
        }
        if (single) {
            query = query.single();
        }

        const { data, error } = await query;
        if (error) throw error;

        return NextResponse.json({ data });
    } catch (error: any) {
        console.error('API Route Error [invoice-counter]:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
