import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
    try {
        const { email, password, role, full_name, employee_id, admin_secret } = await request.json();

        // Verify secret to prevent public user creation
        if (admin_secret !== process.env.ADMIN_SECRET) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!email || !password || !role) {
            return NextResponse.json({ error: 'Missing required fields (email, password, role)' }, { status: 400 });
        }

        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            return NextResponse.json({ error: 'Server config error' }, { status: 500 });
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });

        // Hash the password securely
        const hashedPassword = await bcrypt.hash(password, 10);

        const { data: newUser, error: insertError } = await supabaseAdmin
            .from('dashboard_users')
            .insert([
                {
                    email,
                    password: hashedPassword,
                    role,
                    full_name: full_name || null,
                    employee_id: employee_id || null,
                }
            ])
            .select()
            .single();

        if (insertError) {
            console.error('Insert Error:', insertError);
            return NextResponse.json({ error: 'Failed to create user', details: insertError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'User created successfully',
            user: {
                id: newUser.id,
                email: newUser.email,
                role: newUser.role,
                full_name: newUser.full_name,
            }
        });
    } catch (error) {
        console.error('Create User Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
