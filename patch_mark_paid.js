const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app/manager/page.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

const targetContent = `        const insertPayload = {
          invoice_number: invoiceNumber,
          employee_id: eid,
          legal_name: (animRow?.legal_name || animatorName).trim(),
          month_label: targetMonth,
          invoice_date: new Date().toISOString(),
          line_items: lineItems,
          total_amount: Math.round(gross || 0),
          tds_percent: tds,
          tds_amount: Math.round((gross || 0) * (tds / 100)),
          net_payable: Math.round(net),
          status: 'Draft',
          thread_id: threadId,
          sent_at: null,
        }

        const { error: invErr } = await apiClient.from('invoices').insert(insertPayload)
        if (invErr) {
          console.error('[Mark Paid] invoice insert failed:', invErr)
          addToast(\`⚠️ Invoice draft creation failed: \${invErr.message}\`, 'error')
        } else {
          addToast(\`✅ Invoice generated and queued for Discord!\`, 'success')
        }`;

const replacementContent = `        const insertPayload = {
          invoice_number: invoiceNumber,
          employee_id: eid,
          legal_name: (animRow?.legal_name || animatorName).trim(),
          month_label: targetMonth,
          invoice_date: new Date().toISOString(),
          line_items: lineItems,
          total_amount: Math.round(gross || 0),
          tds_percent: tds,
          tds_amount: Math.round((gross || 0) * (tds / 100)),
          net_payable: Math.round(net),
          status: 'Paid',
          thread_id: threadId,
          sent_at: new Date().toISOString(),
        }

        const { data: invData, error: invErr } = await apiClient.from('invoices').insert(insertPayload).select().single();
        if (invErr) {
          console.error('[Mark Paid] invoice insert failed:', invErr)
          addToast(\`⚠️ Invoice creation failed: \${invErr.message}\`, 'error')
        } else {
          try {
             // Send Discord Embed to Workspace
             const res = await fetch('/api/discord/send-invoice', {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({
                     channelId: threadId,
                     invoiceNumber: invoiceNumber,
                     monthLabel: targetMonth,
                     totalAmount: insertPayload.total_amount,
                     tdsAmount: insertPayload.tds_amount,
                     netPayable: insertPayload.net_payable,
                     legalName: insertPayload.legal_name
                 })
             });
             if (res.ok) {
                 const dRes = await res.json();
                 if (dRes.success) {
                     await apiClient.from('invoices').update({
                         thread_id: dRes.threadId,
                         discord_msg_id: dRes.messageId
                     }).eq('id', invData.id);
                 }
             }
          } catch (discordErr) {
             console.error("Failed to send invoice to Discord:", discordErr);
          }
          addToast(\`✅ Invoice generated and sent to Discord!\`, 'success')
        }`;

content = content.replace(targetContent, replacementContent);
fs.writeFileSync(filePath, content, 'utf-8');
console.log('Patched page.tsx handleMarkPaid logic');
