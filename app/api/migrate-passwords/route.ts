import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

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

        // Fetch all users
        const { data: users, error: fetchError } = await supabaseAdmin
            .from('dashboard_users')
            .select('*');

        if (fetchError) throw fetchError;

        let migratedCount = 0;
        const skipped = [];

        for (const user of users) {
            // Check if password is already hashed (bcrypt hashes start with $2a$ or $2b$)
            if (user.password && !user.password.startsWith('$2a$') && !user.password.startsWith('$2b$')) {
                // It's a plain text password, hash it
                const hashedPassword = await bcrypt.hash(user.password, 10);

                // Update database
                const { error: updateError } = await supabaseAdmin
                    .from('dashboard_users')
                    .update({ password: hashedPassword })
                    .eq('id', user.id);

                if (updateError) {
                    console.error(`Failed to update user ${user.email}:`, updateError);
                } else {
                    migratedCount++;
                }
            } else {
                skipped.push(user.email);
            }
        }

        return NextResponse.json({
            success: true,
            message: `Successfully migrated ${migratedCount} passwords. Skipped ${skipped.length} users (already hashed).`,
            skipped: skipped,
        });
    } catch (error) {
        console.error('Migration error:', error);
        return NextResponse.json({ error: 'Failed to run migration', details: error }, { status: 500 });
    }
}
