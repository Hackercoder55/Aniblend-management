import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// DELETE — called when manager deletes an invoice to also remove Discord message
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url)
    const messageId = url.searchParams.get('messageId')
    const channelId = url.searchParams.get('channelId')
    if (!messageId || !channelId) return NextResponse.json({ error: 'messageId and channelId required' }, { status: 400 })
    const token = process.env.DISCORD_BOT_TOKEN || process.env.NEXT_PUBLIC_DISCORD_BOT_TOKEN
    if (!token) return NextResponse.json({ error: 'No bot token' }, { status: 500 })
    const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bot ${token}` }
    })
    return NextResponse.json({ success: res.ok, status: res.status })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}


const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      channelId,       // animator's Discord workspace CHANNEL id (not user id)
      employeeId,      // animator's Employee_ID (for DB lookup & save)
      invoiceId,       // invoices table row id
      invoiceNumber,
      monthLabel,
      totalAmount,
      tdsAmount,
      netPayable,
      legalName,
      lineItems,
      bonusAmount,
      othersAmount,
    } = body;

    if (!channelId || !invoiceNumber || !monthLabel) {
      return NextResponse.json({ error: 'channelId, invoiceNumber, and monthLabel are required' }, { status: 400 });
    }

    const token = process.env.DISCORD_BOT_TOKEN || process.env.NEXT_PUBLIC_DISCORD_BOT_TOKEN;
    if (!token) {
      return NextResponse.json({ error: 'Discord bot token is missing' }, { status: 500 });
    }

    const THREAD_NAME = '🧾 Invoices';

    // ─── Step 1: Check saved invoice_thread_id in animators table ───────────
    let threadId: string | null = null;

    if (employeeId) {
      const { data: animRow } = await supabaseAdmin
        .from('animators')
        .select('invoice_thread_id')
        .eq('Employee_ID', employeeId)
        .single();

      if (animRow?.invoice_thread_id) {
        // Verify thread still exists on Discord
        const checkRes = await fetch(`https://discord.com/api/v10/channels/${animRow.invoice_thread_id}`, {
          headers: { 'Authorization': `Bot ${token}` }
        });
        if (checkRes.ok) {
          threadId = animRow.invoice_thread_id;
        }
      }
    }

    // ─── Step 2: If no saved thread, search active threads in channel ────────
    if (!threadId) {
      const activeRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/threads/active`, {
        headers: { 'Authorization': `Bot ${token}` }
      });
      if (activeRes.ok) {
        const activeData = await activeRes.json();
        const found = (activeData.threads || []).find((t: any) =>
          t.name === THREAD_NAME || t.name.toLowerCase() === 'invoices' || t.name.toLowerCase() === 'invoice'
        );
        if (found) threadId = found.id;
      }
    }

    // ─── Step 3: Search archived threads if still not found ─────────────────
    if (!threadId) {
      const archiveRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/threads/archived/public`, {
        headers: { 'Authorization': `Bot ${token}` }
      });
      if (archiveRes.ok) {
        const archiveData = await archiveRes.json();
        const found = (archiveData.threads || []).find((t: any) =>
          t.name === THREAD_NAME || t.name.toLowerCase() === 'invoices' || t.name.toLowerCase() === 'invoice'
        );
        if (found) {
          // Unarchive thread by sending a message
          threadId = found.id;
          // Unarchive via modify
          await fetch(`https://discord.com/api/v10/channels/${found.id}`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bot ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ archived: false, locked: false })
          });
        }
      }
    }

    // ─── Step 4: Create thread if not found ──────────────────────────────────
    if (!threadId) {
      // Post a message in the channel, then create thread from it
      const msgRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bot ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `🧾 **Invoices**\nAll your monthly payment invoices will be posted here.` })
      });

      if (!msgRes.ok) {
        const err = await msgRes.text();
        return NextResponse.json({ error: 'Failed to post channel message', details: err }, { status: 500 });
      }

      const msgData = await msgRes.json();
      const threadRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${msgData.id}/threads`, {
        method: 'POST',
        headers: { 'Authorization': `Bot ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: THREAD_NAME, auto_archive_duration: 10080 })
      });

      if (!threadRes.ok) {
        const err = await threadRes.text();
        return NextResponse.json({ error: 'Failed to create invoice thread', details: err }, { status: 500 });
      }

      const threadData = await threadRes.json();
      threadId = threadData.id;
    }

    // ─── Step 5: Save thread_id to animators table ──────────────────────────
    if (employeeId && threadId) {
      await supabaseAdmin
        .from('animators')
        .update({ invoice_thread_id: threadId })
        .eq('Employee_ID', employeeId);
    }

    // ─── Step 6: Build invoice embed ─────────────────────────────────────────
    const grossAmount = Number(totalAmount || 0);
    const bonus = Number(bonusAmount || 0);
    const others = Number(othersAmount || 0);
    const tds = Number(tdsAmount || 0);
    const net = Number(netPayable || 0);
    const totalWithBonus = grossAmount + bonus + others;

    // Build line items description
    let lineDesc = '';
    if (lineItems && Array.isArray(lineItems)) {
      lineDesc = lineItems.map((item: any, i: number) => {
        const mins = item.seconds ? (item.seconds / 60).toFixed(2) : '0';
        return `${i + 1}. **${item.title || item.project_id}** — ${mins} min → ₹${(item.amount || 0).toLocaleString()}`;
      }).join('\n');
    }

    const fields: any[] = [
      { name: '📋 Legal Name', value: legalName || 'N/A', inline: true },
      { name: '📅 Month', value: monthLabel, inline: true },
      { name: '\u200b', value: '\u200b', inline: false },
    ];

    if (lineDesc) {
      fields.push({ name: '🎬 Projects', value: lineDesc.slice(0, 1024), inline: false });
    }

    fields.push(
      { name: '💰 Gross Amount', value: `₹${grossAmount.toLocaleString()}`, inline: true },
    );
    if (bonus > 0) {
      fields.push({ name: '🎁 Bonus', value: `₹${bonus.toLocaleString()}`, inline: true });
    }
    if (others !== 0) {
      fields.push({ name: '🛠️ Others', value: `₹${others.toLocaleString()}`, inline: true });
    }
    fields.push(
      { name: '📊 TDS Deducted', value: `₹${tds.toLocaleString()}`, inline: true },
      { name: '✅ Net Payable', value: `**₹${net.toLocaleString()}**`, inline: true },
    );

    const embed = {
      title: `🧾 Invoice #${invoiceNumber}`,
      color: 0x10b981,
      fields,
      footer: { text: 'The Futureverse Agency • Please review and acknowledge below' },
      timestamp: new Date().toISOString(),
    };

    // ─── Step 7: Send invoice message with Acknowledge / Edit buttons ────────
    const msgBody: any = {
      content: `Hello! 👋 Your payment invoice for **${monthLabel}** is ready.\n\nPlease review the details below and click **Acknowledge** to confirm, or **Request Edit** if something looks incorrect.`,
      embeds: [embed],
    };

    // Add components (buttons) - dynamic custom_ids with invoiceId embedded
    if (invoiceId) {
      msgBody.components = [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 3, // green
              label: '✅ Confirm Invoice',
              custom_id: `inv_ack_${invoiceId}`,
            },
            {
              type: 2,
              style: 2, // grey
              label: '✏️ Request Edit',
              custom_id: `inv_edit_${invoiceId}`,
            },
          ],
        },
      ];
    }

    const sendRes = await fetch(`https://discord.com/api/v10/channels/${threadId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bot ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(msgBody),
    });

    if (!sendRes.ok) {
      const err = await sendRes.text();
      return NextResponse.json({ error: 'Failed to send invoice message', details: err }, { status: sendRes.status });
    }

    const sentMsg = await sendRes.json();

    // ─── Step 8: Update invoice status to Sent ───────────────────────────────
    if (invoiceId) {
      await supabaseAdmin
        .from('invoices')
        .update({
          status: 'Sent',
          thread_id: threadId,
          sent_at: new Date().toISOString(),
          discord_message_id: sentMsg.id,
        })
        .eq('id', invoiceId);
    }

    return NextResponse.json({ success: true, threadId, messageId: sentMsg.id });
  } catch (error: any) {
    console.error('[send-invoice]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
