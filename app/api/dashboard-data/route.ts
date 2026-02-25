import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });

        // Fetch projects and animators simultaneously
        const [{ data: pData, error: pError }, { data: aData, error: aError }] = await Promise.all([
            supabaseAdmin.from('projects').select('*'),
            supabaseAdmin.from('animators').select('*'),
        ]);

        if (pError) throw pError;
        if (aError) throw aError;

        // Return the data securely
        return NextResponse.json({
            projects: pData || [],
            animators: aData || []
        });

    } catch (error) {
        console.error('Data fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
    }
}
