import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireFinanceManager } from '@/lib/finance-session'
import { amount, dateKey, emptyWallet, paise, settle, snapshot, syncProjects, today, validateSettings, type Artist, type Draft, type Entry, type Settlement, type SourceProject, type Wallet } from '@/lib/finance'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
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
    const [saved, projects, artists, payments] = await Promise.all([read(db), rows(db, 'projects'), rows(db, 'animators'), rows(db, 'payments')])
    const legacyPayments = payments.filter(p => ['paid', 'closed'].includes(String(p.Payment_Status).toLowerCase()) && !String(p['Project ID']).startsWith('Wallet: ')).map(p => ({ id: String(p.id), date: dateKey(p.paid_date || p.Timestamp || ''), name: p.Name || p['Employee ID'], reference: p['Project ID'] || '', gross: paise(Number(p.gross) || 0), bonus: paise(Number(p.bonus) || 0), others: paise(Number(p.others_amount) || 0), net: paise(Number(p.net_paid) || 0), note: p.bonus_note || '' }))
    return NextResponse.json({ wallet: saved?.data || emptyWallet(), revision: saved?.revision ?? 0, projects, artists, legacyPayments }, { headers: { 'Cache-Control': 'no-store' } })
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
      const { error } = await db.from('finance_wallet').upsert({ id: 1, revision: 0, data: emptyWallet() }, { onConflict: 'id', ignoreDuplicates: true })
      if (error) throw error
      saved = await read(db)
    }
    if (!saved) throw new Error('Wallet initialization failed')
    const wallet = structuredClone(saved.data)
    if (wallet.audit.some(e => e.id === requestId)) return NextResponse.json({ wallet, revision: saved.revision, replayed: true })
    if (body.revision !== saved.revision) throw new Error('WALLET_CONFLICT: Another change was saved. Refresh and review before trying again.')
    let payment: Settlement | null = null
    let closed: string[] = []
    let detail = ''
    switch (body.action) {
      case 'settings': {
        wallet.settings = validateSettings(body.settings)
        detail = `Rates/settings saved: ${JSON.stringify(wallet.settings)}`
        break
      }
      case 'sync': {
        if (wallet.settings.clientRate <= 0 && !Object.keys(wallet.settings.clientRates).length) throw new Error('Set client rates before importing revenue')
        const [projects, artists] = await Promise.all([rows(db, 'projects'), rows(db, 'animators')])
        const added = syncProjects(wallet, projects as SourceProject[], artists as Artist[])
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
        const [projects, artists] = await Promise.all([rows(db, 'projects'), rows(db, 'animators')])
        let count = 0
        wallet.projects = wallet.projects.map(p => {
          if (p.legacy || p.obligations.some(o => o.settlementId)) return p
          const source = projects.find(s => s.Project_ID === p.id)
          if (!source) return p
          const updated = snapshot(source as SourceProject, artists as Artist[], wallet.settings)
          const received = wallet.entries.filter(e => e.kind === 'receipt' && e.projectId === p.id).reduce((n, e) => n + e.amount, 0)
          if (received > updated.revenue) throw new Error(`Project ${p.id}: new revenue would be lower than recorded receipts. Correct the receipt first.`)
          if (updated.legacy) throw new Error(`Project ${p.id} was paid outside the wallet. Reconcile before repricing.`)
          count++; return updated
        })
        detail = `Recalculated ${count} unpaid projects using current source details and saved rates`
        break
      }
      case 'project': {
        const p = wallet.projects.find(p => p.id === body.projectId)
        if (!p) throw new Error('Project not found')
        if (p.obligations.some(o => o.settlementId && o.settlementId !== 'legacy')) throw new Error('Settled project rates are locked')
        const date = dateKey(String(body.date || ''))
        if (!date || date > today()) throw new Error('Choose a valid recognition date')
        const previous = { date: p.date, clientRate: p.clientRate, revenue: p.revenue, obligations: p.obligations }
        p.date = date; p.clientRate = amount(body.clientRate, 'Client rate'); p.revenue = paise(p.seconds * p.clientRate / 60)
        const received = wallet.entries.filter(e => e.kind === 'receipt' && e.projectId === p.id).reduce((n, e) => n + e.amount, 0)
        if (received > p.revenue) throw new Error('Revenue cannot be lower than recorded client receipts. Correct the receipt first.')
        if (!Array.isArray(body.costs) || body.costs.length !== p.obligations.length) throw new Error('All project costs are required')
        p.obligations = p.obligations.map(o => { const c = body.costs.find((c: { key: string }) => c.key === o.key); if (!c) throw new Error('Invalid cost line'); return { ...o, gross: paise(amount(c.gross, 'Project cost')), extra: paise(amount(c.extra, 'Project bonus/extra')) } })
        p.issues = p.issues.filter(issue => !issue.startsWith('Approval date') && !issue.startsWith('Client rate'))
        detail = `Project ${p.id} edited. Before: ${JSON.stringify(previous)}. After: ${JSON.stringify(p)}`
        break
      }
      case 'draft': {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(body.month)) throw new Error('Invalid month')
        const artists = await rows(db, 'animators')
        const artist = artists.find(a => a.Employee_ID === body.employeeId)
        if (!artist) throw new Error('Unknown team member')
        const draft: Draft = { bonus: amount(body.draft.bonus), others: amount(body.draft.others), tdsPercent: amount(body.draft.tdsPercent, 'TDS', 100), note: String(body.draft.note || '').slice(0, 1000), employeeName: artist.Name }
        wallet.drafts[`${body.month}:${body.employeeId}`] = draft
        detail = `Payout draft ${body.month} / ${body.employeeId}: ${JSON.stringify(draft)}`
        break
      }
      case 'cashout': {
        if (!Array.isArray(body.keys) || body.keys.length > 10000) throw new Error('Invalid project selection')
        // Source status may have changed in the legacy app or bot since import.
        const projects = await rows(db, 'projects')
        for (const p of wallet.projects.filter(p => p.obligations.some(o => body.keys.includes(o.key)))) {
          const source = projects.find(s => s.Project_ID === p.id)
          if (!source || !['Approved', 'Paid', 'Closed'].includes(source.Status)) throw new Error(`Project ${p.id} is no longer approved; reconcile first`)
          if (['Paid', 'Closed'].includes(source.Payment_Status) && !p.obligations.some(o => o.settlementId)) throw new Error(`Project ${p.id} was paid outside the wallet; reconcile first`)
        }
        payment = settle(wallet, String(body.employeeId), body.keys, body.month, requestId, randomUUID())
        closed = wallet.projects.filter(p => !p.legacy && p.obligations.length && p.obligations.every(o => o.settlementId) && payment!.lines.some(l => l.projectId === p.id)).map(p => p.id)
        detail = `${payment.name}: recorded ₹${(payment.net / 100).toFixed(2)} paid, ${payment.lines.length} work items; reference ${payment.id}`
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
        if (body.kind === 'receipt') {
          if (!projectId) throw new Error('Select the project whose payment was received')
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
    const { data: revision, error } = await db.rpc('commit_finance_wallet', { expected_revision: saved.revision, wallet_data: wallet, payment_data: payment, closed_project_ids: closed })
    if (error) throw error
    return NextResponse.json({ wallet, revision })
  } catch (e) { return failure(e) }
}
