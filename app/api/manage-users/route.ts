import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

function getSupabase() {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing Supabase env vars');
    return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action, caller_email, caller_role } = body;
        const supabase = getSupabase();

        // Verify the caller is a Head user (role='manager' in this system)
        if (caller_role !== 'manager') {
            return NextResponse.json({ error: 'Head access required' }, { status: 403 });
        }

        // Double-check caller exists with manager role in DB
        const { data: callerUser } = await supabase
            .from('dashboard_users')
            .select('id, role')
            .eq('email', caller_email)
            .eq('role', 'manager')
            .single();

        if (!callerUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // LIST users
        if (action === 'list') {
            const { data, error } = await supabase
                .from('dashboard_users')
                .select('id, email, role, full_name, employee_id, last_login')
                .order('full_name');

            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ data });
        }

        // CREATE user
        if (action === 'create') {
            const { email, password, role, full_name, employee_id } = body;

            if (!email || !password || !role || !full_name) {
                return NextResponse.json({ error: 'Email, password, role, and full_name are required' }, { status: 400 });
            }

            // Check if email already exists
            const { data: existing } = await supabase
                .from('dashboard_users')
                .select('id')
                .eq('email', email)
                .single();

            if (existing) {
                return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
            }

            const hashedPassword = await bcrypt.hash(password, 10);

            const { data: newUser, error: insertError } = await supabase
                .from('dashboard_users')
                .insert({
                    email,
                    password: hashedPassword,
                    role,
                    full_name,
                    employee_id: employee_id || null,
                })
                .select('id, email, role, full_name, employee_id')
                .single();

            if (insertError) {
                return NextResponse.json({ error: insertError.message }, { status: 500 });
            }

            return NextResponse.json({ data: newUser, message: 'User created successfully' });
        }

        // DELETE user
        if (action === 'delete') {
            const { user_id } = body;
            if (!user_id) return NextResponse.json({ error: 'user_id required' }, { status: 400 });

            // Prevent deleting yourself
            if (user_id === callerUser.id) {
                return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
            }

            const { error } = await supabase
                .from('dashboard_users')
                .delete()
                .eq('id', user_id);

            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ message: 'User deleted' });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        console.error('Manage users error:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
