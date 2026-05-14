import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
    try {
        const { email, password, role } = await request.json();

        if (!email || !password || !role) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Initialize Supabase client using Service Role key
        // This bypasses RLS and allows secure server-side queries
        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('Missing Supabase environment variables');
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });

        // Query the dashboard_users table securely based on email and role only
        const { data: user, error: dbError } = await supabaseAdmin
            .from('dashboard_users')
            .select('*')
            .eq('email', email)
            .eq('role', role)
            .single();

        if (dbError || !user) {
            return NextResponse.json({ error: 'Invalid credentials or role. Please try again.' }, { status: 401 });
        }

        // Verify the provided password against the hashed password in the DB
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return NextResponse.json({ error: 'Invalid credentials or role. Please try again.' }, { status: 401 });
        }

        // Update last_login
        await supabaseAdmin
            .from('dashboard_users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', user.id);

        // Return sanitized user object (hide password and sensitive fields if necessary)
        return NextResponse.json({
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                full_name: user.full_name,
                employee_id: user.employee_id,
                access_level: user.access_level || null,
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
    }
}
