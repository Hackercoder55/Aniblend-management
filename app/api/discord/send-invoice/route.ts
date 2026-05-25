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

        // 1. Fetch active threads in the channel to see if "Invoices" exists
        let threadId = null;
        const threadsRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/threads/active`, {
            headers: { 'Authorization': `Bot ${token}` }
        });
        
        if (threadsRes.ok) {
            const threadsData = await threadsRes.json();
            const invoiceThread = threadsData.threads?.find((t: any) => t.name.toLowerCase() === 'invoices' || t.name.toLowerCase() === 'invoice');
            if (invoiceThread) {
                threadId = invoiceThread.id;
            }
        }

        // 2. If no active thread found, create one
        if (!threadId) {
            const createThreadRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bot ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    content: "?? **Invoices Thread**\nAll monthly invoices will be posted here."
                })
            });
            if (createThreadRes.ok) {
                const msgData = await createThreadRes.json();
                const startThreadRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msgData.id}/threads`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bot ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ name: "Invoices" })
                });
                if (startThreadRes.ok) {
                    const threadData = await startThreadRes.json();
                    threadId = threadData.id;
                }
            }
        }

        if (!threadId) {
            return NextResponse.json({ error: 'Failed to find or create Invoices thread' }, { status: 500 });
        }

        // 3. Send the invoice message to the thread
        const embed = {
            title: `Invoice #${invoiceNumber}`,
            color: 0x10b981,
            fields: [
                { name: "Legal Name", value: legalName || "N/A", inline: true },
                { name: "Month", value: monthLabel, inline: true },
                { name: "Gross Amount", value: `\u20b9${totalAmount}`, inline: false },
                { name: "TDS Deducted", value: `\u20b9${tdsAmount}`, inline: true },
                { name: "Net Paid", value: `\u20b9${netPayable}`, inline: true }
            ],
            footer: { text: "The Futureverse Agency - Auto-Generated Invoice" },
            timestamp: new Date().toISOString()
        };

        const res = await fetch(`https://discord.com/api/v10/channels/${threadId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bot ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content: `Hello <@${channelId}>! Your payment for **${monthLabel}** has been processed. Here is your invoice summary.`,
                embeds: [embed]
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            return NextResponse.json({ error: 'Failed to send invoice message', details: errText }, { status: res.status });
        }

        return NextResponse.json({ success: true, threadId });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
