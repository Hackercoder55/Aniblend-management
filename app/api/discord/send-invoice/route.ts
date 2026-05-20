import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const { channelId, invoiceNumber, monthLabel, totalAmount, tdsAmount, netPayable, legalName } = await request.json();

        if (!channelId || !invoiceNumber || !monthLabel) {
            return NextResponse.json({ error: 'channelId, invoiceNumber, and monthLabel are required' }, { status: 400 });
        }

        const token = process.env.DISCORD_BOT_TOKEN || process.env.NEXT_PUBLIC_DISCORD_BOT_TOKEN;

        if (!token) {
            return NextResponse.json({ error: 'Discord bot token is missing' }, { status: 500 });
        }

        // Create a thread and post the first message
        const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/threads`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: `Invoice #${invoiceNumber} - ${monthLabel}`,
                type: 11, // GUILD_PUBLIC_THREAD
                message: {
                    content: `Hello <@${channelId}>! Your payment for **${monthLabel}** has been processed. Here is your invoice summary.`,
                    embeds: [
                        {
                            title: `Invoice #${invoiceNumber}`,
                            color: 0x10b981, // Emerald green
                            fields: [
                                { name: "Legal Name", value: legalName || "N/A", inline: true },
                                { name: "Month", value: monthLabel, inline: true },
                                { name: "Gross Amount", value: `₹${totalAmount}`, inline: false },
                                { name: "TDS Deducted", value: `₹${tdsAmount}`, inline: true },
                                { name: "Net Paid", value: `₹${netPayable}`, inline: true }
                            ],
                            footer: { text: "The Futureverse Agency - Auto-Generated Invoice" },
                            timestamp: new Date().toISOString()
                        }
                    ]
                }
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            return NextResponse.json({ error: 'Failed to create thread', details: errText }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json({ success: true, threadId: data.id, messageId: data.id }); // For threads created this way, thread id is the same as the message id that started it
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
