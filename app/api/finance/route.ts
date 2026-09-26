import { NextResponse } from 'next/server'
import { paymentNotices, dispatchNotice } from '@/lib/finance-notifications'
import { randomUUID } from 'node:crypto'
import { requireFinanceManager } from '@/lib/finance-session'
import { amount, repriceUnpaid, editUnpaidPrice, saveRecurring, recurringCharges, closeCycle, reconcileLegacy, dateKey, emptyWallet, paise, settle, snapshot, syncProjects, today, validateSettings, type Artist, type Draft, type Entry, type Settlement, type SourceProject, type Wallet } from '@/lib/finance'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
async function rows(db: SupabaseClient, table: string) {
  const result = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from(table).select('*').order('id').range(offset, offset + 999)
    if (error) throw error
    result.push(...data)
    if (data.length < 1000) return result
    if (offset >= 999000) throw new Error('Too many records to load safely')
  }
}
async function financeArtists(db: SupabaseClient) {
  const [artists, leads] = await Promise.all([rows(db, 'animators'), db.from('leads').select('Head_Name,Discord_ID,Employee_ID')])
  if (leads.error && !['42P01', 'PGRST205'].includes(leads.error.code)) throw leads.error
  return artists.map(a => ({ ...a, aliases: (leads.data || []).filter(l => l.Employee_ID && l.Employee_ID === a.Employee_ID || l.Discord_ID && l.Discord_ID === a.Discord_ID).map(l => l.Head_Name).filter(Boolean) }))
}
async function initialWallet(db: SupabaseClient) {
  const wallet = emptyWallet()
  const { data, error } = await db.from('client_rates').select('client_code,rate_type,rate_inr')
  if (error && !['42P01', 'PGRST205'].includes(error.code)) throw error
  for (const r of data || []) {
    const code = String(r.client_code || '').trim().toLowerCase(), rate = Number(r.rate_inr)
    if (!code || !Number.isFinite(rate) || rate < 0) continue
    if (r.rate_type === 'flat') wallet.settings.clientFlatRates![code] = rate
    else wallet.settings.clientRates[code] = rate
  }
  return wallet
}
async function read(db: SupabaseClient) {
  const { data, error } = await db.from('finance_wallet').select('*').eq('id', 1).maybeSingle()
  if (error) throw new Error('WALLET_SETUP_REQUIRED: Run migrations/001_finance_wallet.sql in Supabase first.')
  return data as { revision: number; data: Wallet } | null
}
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : (error as { message?: string })?.message || 'Wallet operation failed'
  const status = message.includes('AUTH_REQUIRED') ? 401 : message.includes('WALLET_CONFLICT') ? 409 : message.includes('WALLET_SETUP_REQUIRED') ? 503 : 400
  return NextResponse.json({ error: message === 'AUTH_REQUIRED' ? 'Please sign out and sign in again with a manager account.' : message }, { status })
}
export async function GET() {
  try {
    const { db } = await requireFinanceManager()
    const [saved, projects, artists, payments] = await Promise.all([read(db), rows(db, 'projects'), financeArtists(db), rows(db, 'payments')])
    const notifications = await db.from('finance_notifications').select('id,settlement_id,employee_id,project_id,channel_id,status,message_id,last_error,attempted_at').order('created_at', { ascending: false }).limit(1000)
    const legacyPayments = payments.filter(p => ['paid', 'closed'].includes(String(p.Payment_Status).toLowerCase()) && !String(p['Project ID']).startsWith('Wallet: ')).map(p => ({ kind: ['SHARE_', 'MISC_', 'EXTRAREV_'].some(prefix => String(p['Employee ID'] || '').startsWith(prefix)) ? 'adjustment' : 'team', id: String(p.id), date: dateKey(p.paid_date || p.Timestamp || ''), name: p.Name || p['Employee ID'], reference: p['Project ID'] || '', gross: paise(Number(p.gross) || 0), bonus: paise(Number(p.bonus) || 0), others: paise(Number(p.others_amount) || 0), net: paise(Number(p.net_paid) || 0), note: p.bonus_note || '' }))
    return NextResponse.json({ wallet: saved?.data || await initialWallet(db), revision: saved?.revision ?? 0, projects, artists, legacyPayments, notifications: notifications.data || [], notificationSetupRequired: !!notifications.error }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) { return failure(e) }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) throw new Error('Invalid request origin')
    const { db, actor } = await requireFinanceManager()
    const body = await request.json()
    const requestId = String(body.requestId || '')
    if (!/^[a-zA-Z0-9-]{20,80}$/.test(requestId)) throw new Error('Invalid request identifier')
    let saved = await read(db)
    if (!saved) {
      const { error } = await db.from('finance_wallet').upsert({ id: 1, revision: 0, data: await initialWallet(db) }, { onConflict: 'id', ignoreDuplicates: true })
      if (error) throw error
      saved = await read(db)
    }
    if (!saved) throw new Error('Wallet initialization failed')
    const wallet = structuredClone(saved.data)
    if (wallet.audit.some(e => e.id === requestId)) return NextResponse.json({ wallet, revision: saved.revision, replayed: true })
    if (body.revision !== saved.revision) throw new Error('WALLET_CONFLICT: Another change was saved. Refresh and review before trying again.')
    let payment: Settlement | null = null
    let notifications: ReturnType<typeof paymentNotices> = []
    let closed: string[] = []
    let detail = ''
    switch (body.action) {
      case 'settings': {
        wallet.settings = validateSettings(body.settings)
        const [sources, artists] = await Promise.all([rows(db,'projects'), financeArtists(db)])
        syncProjects(wallet,sources as SourceProject[],artists as Artist[])
        const count = repriceUnpaid(wallet,sources as SourceProject[],artists as Artist[])
        detail = `Rates saved and ${count} unpaid project amounts updated: ${JSON.stringify(wallet.settings)}`
        break
      }
      case 'sync': {
        if (wallet.settings.clientRate <= 0 && !Object.keys(wallet.settings.clientRates).length && !Object.keys(wallet.settings.clientFlatRates || {}).length) throw new Error('Set client rates before importing revenue')
        const [projects, artists] = await Promise.all([rows(db, 'projects'), financeArtists(db)])
        const added = syncProjects(wallet, projects as SourceProject[], artists as Artist[])
        repriceUnpaid(wallet,projects as SourceProject[],artists as Artist[])
        if (!wallet.legacyImported) {
          const payments = await rows(db, 'payments')
          const latest = payments.filter(p => String(p.Payment_Status).toLowerCase() === 'pending' && String(p['Project ID']).startsWith('Month: ')).sort((a, b) => String(b.Timestamp).localeCompare(String(a.Timestamp)))
          for (const artist of artists) {
            const old = latest.find(p => p['Employee ID'] === artist.Employee_ID)
            const bonus = Math.max(0, Number(old?.bonus) || 0), others = Math.max(0, Number(artist.others_amount) || Number(old?.others_amount) || 0)
            if (bonus || others) wallet.drafts[`${today().slice(0, 7)}:${artist.Employee_ID}`] = { bonus, others, tdsPercent: old?.tds_percent ?? wallet.settings.tdsPercent, note: 'Imported old adjustments. Verify that lead fees and project extras are not counted twice before saving.', employeeName: artist.Name, needsReview: true }
          }
          wallet.legacyImported = true
        }
        detail = `Imported ${added.length} completed projects; existing snapshots preserved`
        break
      }
      case 'reprice': {
        const [sources,artists]=await Promise.all([rows(db,'projects'),financeArtists(db)])
        syncProjects(wallet,sources as SourceProject[],artists as Artist[])
        const count=repriceUnpaid(wallet,sources as SourceProject[],artists as Artist[])
        detail='Updated '+count+' unpaid projects; settled receipts and manual prices preserved'
        break
      }
      case 'payout_details': {
        if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month)||body.month>today().slice(0,7))throw new Error('Invalid payout month')
        if(!Array.isArray(body.rows)||!body.rows.length||body.rows.length>500)throw new Error('Invalid payout details')
        const artists=await financeArtists(db)
        const seen=new Set<string>()
        for(const row of body.rows) {
          const artist=artists.find(a=>a.Employee_ID===row.employeeId)
          if(!artist||seen.has(row.employeeId))throw new Error('Invalid or duplicate employee')
          seen.add(row.employeeId)
          const d=row.draft||{}
          wallet.drafts[body.month+':'+row.employeeId]={bonus:amount(d.bonus),others:amount(d.others),tdsPercent:amount(d.tdsPercent,'TDS',100),note:String(d.note||'').slice(0,1000),employeeName:artist.Name}
          if(!Array.isArray(row.prices)||row.prices.length>10000)throw new Error('Invalid work prices')
          for(const price of row.prices) {
            const project=wallet.projects.find(p=>p.obligations.some(o=>o.key===price.key&&o.employeeId===row.employeeId))
            if(!project)throw new Error('Price does not belong to this employee')
            editUnpaidPrice(wallet,String(price.key),price.amount,'gross')
          }
        }
        detail='Saved payout details and unpaid work prices for '+[...seen].join(', ')
        break
      }
      case 'recurring': {
        saveRecurring(wallet,body.rule,randomUUID())
        detail='Monthly expense schedule: '+JSON.stringify(body.rule)
        break
      }
      case 'pay_recurring': {
        const charge=recurringCharges(wallet).find(c=>c.key===body.key)
        if(!charge||charge.paid)throw new Error('This monthly expense is missing or already paid')
        wallet.entries.push({id:randomUUID(),requestId,kind:'withdrawal',date:today(),amount:charge.amount,note:charge.name+' / '+charge.month+' (monthly cost already included in profit)',projectId:'',recurringKey:charge.key})
        detail='Recorded monthly expense paid: '+charge.name+' / '+charge.month
        break
      }
      case 'project': {
        const p = wallet.projects.find(p => p.id === body.projectId)
        if (!p) throw new Error('Project not found')
        if (p.cycleId) throw new Error('Cashed-out project amounts are locked in history')
        const settled = p.obligations.some(o => o.settlementId && o.settlementId !== 'legacy')
        if (settled && body.date !== p.date) throw new Error('Recognition date is locked after artist payment')
        const date = dateKey(String(body.date || ''))
        if (!date || date > today()) throw new Error('Choose a valid recognition date')
        const previous = { date: p.date, clientRate: p.clientRate, revenue: p.revenue, obligations: p.obligations }
        p.manualRevenue = true; p.date = date; p.clientRate = amount(body.clientRate, 'Client rate'); p.revenue = paise(p.seconds * p.clientRate / 60)
        const received = wallet.entries.filter(e => e.kind === 'receipt' && e.projectId === p.id).reduce((n, e) => n + e.amount, 0)
        if (received > p.revenue) throw new Error('Revenue cannot be lower than recorded client receipts. Correct the receipt first.')
        if (!Array.isArray(body.costs) || body.costs.length !== p.obligations.length) throw new Error('All project costs are required')
        p.obligations = p.obligations.map(o => { const c = body.costs.find((c: { key: string }) => c.key === o.key); if (!c) throw new Error('Invalid cost line'); if (settled && (paise(amount(c.gross)) !== o.gross || paise(amount(c.extra)) !== o.extra)) throw new Error('Paid team costs are locked; only client pricing may change'); return { ...o, manualPrice: o.manualPrice || paise(amount(c.gross)) !== o.gross, gross: paise(amount(c.gross, 'Project cost')), extra: paise(amount(c.extra, 'Project bonus/extra')) } })
        p.issues = p.issues.filter(issue => !issue.startsWith('Approval date') && !issue.startsWith('Client rate'))
        detail = `Project ${p.id} edited. Before: ${JSON.stringify(previous)}. After: ${JSON.stringify(p)}`
        break
      }
      case 'draft': {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month)) throw new Error('Invalid month')
        const artists = await financeArtists(db)
        const artist = artists.find(a => a.Employee_ID === body.employeeId)
        if (!artist) throw new Error('Unknown team member')
        const draft: Draft = { bonus: amount(body.draft.bonus), others: amount(body.draft.others), tdsPercent: amount(body.draft.tdsPercent, 'TDS', 100), note: String(body.draft.note || '').slice(0, 1000), employeeName: artist.Name }
        wallet.drafts[`${body.month}:${body.employeeId}`] = draft
        detail = `Payout draft ${body.month} / ${body.employeeId}: ${JSON.stringify(draft)}`
        break
      }
      case 'mark_paid': {
        const setup = await db.from('finance_notifications').select('id').limit(1)
        if (setup.error) throw new Error('Payment messaging setup required: run migrations/002_payment_notifications.sql before Mark Paid.')
        if (!Array.isArray(body.keys) || body.keys.length > 10000) throw new Error('Invalid project selection')
        // Source status may have changed in the legacy app or bot since import.
        const projects = await rows(db, 'projects')
        for (const p of wallet.projects.filter(p => p.obligations.some(o => body.keys.includes(o.key)))) {
          const source = projects.find(s => s.Project_ID === p.id)
          if (!source || !['Approved', 'Paid', 'Closed'].includes(source.Status)) throw new Error(`Project ${p.id} is no longer approved; reconcile first`)
          if (['Paid', 'Closed'].includes(source.Payment_Status) && !p.obligations.some(o => o.settlementId)) throw new Error(`Project ${p.id} was paid outside the wallet; reconcile first`)
        }
        payment = settle(wallet, String(body.employeeId), body.keys, body.month, requestId, randomUUID(), body.cutoff)
        if (wallet.settings.notifyPayments !== false) {
          const artists = await financeArtists(db)
          notifications = paymentNotices(payment, projects, artists.find(a => a.Employee_ID === payment!.employeeId))
        }
        closed = wallet.projects.filter(p => !p.legacy && p.obligations.length && p.obligations.every(o => o.settlementId) && payment!.lines.some(l => l.projectId === p.id)).map(p => p.id)
        detail = `${payment.name}: recorded ₹${(payment.net / 100).toFixed(2)} paid, ${payment.lines.length} work items; reference ${payment.id}`
        break
      }
      case 'cashout': {
        if (!Array.isArray(body.projectIds) || body.projectIds.length > 10000) throw new Error('Refresh the dashboard and select paid projects for cycle cashout')
        const cycle = closeCycle(wallet, body.projectIds, String(body.cutoff || ''), requestId, randomUUID())
        detail = 'Cycle cashout: ' + cycle.projects.length + ' fully paid projects archived; revenue, receipts and payment amounts unchanged'
        break
      }
      case 'reconcile_legacy': {
        const [projects, artists, payments, rates] = await Promise.all([rows(db, 'projects'), financeArtists(db), rows(db, 'payments'), rows(db, 'client_rates')])
        const beforeSettings = wallet.settings
        const result = reconcileLegacy(wallet, projects as SourceProject[], artists as Artist[], rates as any, payments, String(body.cycleStart || ''))
        detail = 'Initialized existing accounts: ' + JSON.stringify(result) + '; previous settings preserved here: ' + JSON.stringify(beforeSettings)
        break
      }
      case 'entry': {
        const kinds = ['receipt', 'client_bonus', 'expense', 'capital', 'withdrawal']
        if (!kinds.includes(body.kind)) throw new Error('Invalid transaction type')
        const date = dateKey(String(body.date || ''))
        if (!date || date > today()) throw new Error('Choose a valid transaction date')
        const value = paise(amount(body.amount))
        if (value <= 0) throw new Error('Amount must be greater than zero')
        const note = String(body.note || '').trim().slice(0, 1000)
        if (!note) throw new Error('Add a description/reference')
        const projectId = String(body.projectId || '')
        if (projectId && !wallet.projects.some(p => p.id === projectId)) throw new Error('Unknown project')
        if (body.kind === 'receipt' && projectId) {
          // Client receipts may be recorded as a combined amount without video matching.
          const project = wallet.projects.find(p => p.id === projectId)!
          const received = wallet.entries.filter(e => e.kind === 'receipt' && e.projectId === projectId).reduce((n, e) => n + e.amount, 0)
          if (received + value > project.revenue) throw new Error('Receipt exceeds project revenue. Record extra client money as a client bonus.')
        }
        wallet.entries.push({ id: randomUUID(), requestId, kind: body.kind, date, amount: value, note, projectId })
        detail = `${body.kind}: ₹${value / 100}; ${note}`
        break
      }
      case 'reverse': {
        const entry = wallet.entries.find(e => e.id === body.entryId)
        if (!entry || entry.reverses || wallet.entries.some(e => e.reverses === entry.id)) throw new Error('Transaction already reversed or missing')
        const note = String(body.note || '').trim().slice(0, 1000)
        if (!note) throw new Error('A correction reason is required')
        wallet.entries.push({ ...entry, id: randomUUID(), requestId, date: today(), amount: -entry.amount, note, reverses: entry.id } as Entry)
        detail = `Reversed ${entry.id}: ${note}`
        break
      }
      default: throw new Error('Unknown wallet action')
    }
    wallet.audit.push({ id: requestId, date: new Date().toISOString(), actor, action: body.action, detail })
    const { data: revision, error } = await db.rpc('commit_finance_wallet', { expected_revision: saved.revision, wallet_data: wallet, payment_data: payment ? { ...payment, notifications } : null, closed_project_ids: closed })
    if (error) throw error
    // A message failure never changes the saved payment into a failed payment.
    const delivery = await Promise.allSettled(notifications.slice(0, 3).map(n => dispatchNotice(db, n.id)))
    const noticeRows = await db.from('finance_notifications').select('id,settlement_id,employee_id,project_id,channel_id,status,message_id,last_error,attempted_at').order('created_at', { ascending: false }).limit(1000).then(result => result, () => ({ data: null, error: { message: 'Delivery status unavailable' } }))
    return NextResponse.json({ wallet, revision, notifications: noticeRows.data || [], notificationSetupRequired: !!noticeRows.error, deliveryWarning: delivery.some(r => r.status === 'rejected') ? 'Payment saved. Refresh message delivery status before retrying.' : undefined })
  } catch (e) { return failure(e) }
}
