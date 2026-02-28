import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const { threadId, message } = await request.json();

        if (!threadId || !message) {
            return NextResponse.json({ error: 'threadId and message are required' }, { status: 400 });
        }

        const token = process.env.NEXT_PUBLIC_DISCORD_BOT_TOKEN;

        if (!token) {
            return NextResponse.json({ error: 'Discord bot token is missing' }, { status: 500 });
        }

        const res = await fetch(`https://discord.com/api/v10/channels/${threadId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: message }),
        });

        if (!res.ok) {
            const errText = await res.text();
            return NextResponse.json({ error: 'Failed to send message', details: errText }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
