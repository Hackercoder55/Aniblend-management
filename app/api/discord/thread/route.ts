import { NextResponse } from 'next/server';

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const threadId = searchParams.get('threadId');

        if (!threadId) {
            return NextResponse.json({ error: 'Thread ID is required' }, { status: 400 });
        }

        const token = process.env.NEXT_PUBLIC_DISCORD_BOT_TOKEN;

        if (!token) {
            return NextResponse.json({ error: 'Discord token is missing' }, { status: 500 });
        }

        const res = await fetch(`https://discord.com/api/v10/channels/${threadId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bot ${token}`,
            },
        });

        if (!res.ok) {
            const errText = await res.text();
            return NextResponse.json({ error: 'Failed to delete thread', details: errText }, { status: res.status });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
