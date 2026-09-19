import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const { threadIds } = await request.json();

        if (!threadIds || !Array.isArray(threadIds)) {
            return NextResponse.json({ error: 'threadIds array is required' }, { status: 400 });
        }

        const token = process.env.DISCORD_BOT_TOKEN || process.env.NEXT_PUBLIC_DISCORD_BOT_TOKEN;

        if (!token) {
            return NextResponse.json({ error: 'Discord bot token is missing' }, { status: 500 });
        }

        const results: Record<string, string | null> = {};

        // Fetch all threads in parallel to get their last_message_id
        await Promise.all(threadIds.map(async (threadId) => {
            try {
                const res = await fetch(`https://discord.com/api/v10/channels/${threadId}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bot ${token}`,
                    },
                });
                
                if (res.ok) {
                    const data = await res.json();
                    results[threadId] = data.last_message_id || null;
                } else {
                    results[threadId] = null;
                }
            } catch (err) {
                results[threadId] = null;
            }
        }));

        return NextResponse.json({ success: true, data: results });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
