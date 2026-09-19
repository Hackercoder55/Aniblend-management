'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { adjustments, defaults, pending, summarize, today, type Artist, type Draft, type FinanceProject, type Settings, type SourceProject, type Wallet } from '@/lib/finance'
import styles from './finance-wallet.module.css'

const money = (value: number) => Number.isFinite(value) ? (value / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }) : '—'
const number = (value: string) => value === '' ? NaN : Number(value)
const monthLabel = (month: string) => month === 'all' ? 'All time' : new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
type WalletResponse = { wallet: Wallet; revision: number; projects?: SourceProject[]; artists?: Artist[]; legacyPayments?: { id: string; date: string; name: string; reference: string; gross: number; bonus: number; others: number; net: number; note: string }[] }

export default function FinanceWallet({ initialView = 'profit', onRefresh }: { initialView?: 'profit' | 'payouts'; onRefresh: () => void }) {
  const [data, setData] = useState<WalletResponse | null>(null)
  const [view, setView] = useState<'profit' | 'payouts' | 'history' | 'settings'>(initialView)
  const [month, setMonth] = useState(today().slice(0, 7))
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const retryRef = useRef<{ json: string; id: string } | null>(null)
  const autoSyncRef = useRef('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [extraPay, setExtraPay] = useState({ employeeId: '', amount: '', note: '' })
  const [settings, setSettings] = useState<Settings>(defaults)
  const [clientOverrides, setClientOverrides] = useState('')
  const [employeeOverrides, setEmployeeOverrides] = useState('')
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [review, setReview] = useState<string | null>(null)
  const [edit, setEdit] = useState<FinanceProject | null>(null)
  const [entry, setEntry] = useState({ kind: 'expense', date: today(), amount: '', projectId: '', note: '' })
  const apply = useCallback((next: WalletResponse) => {
    setData(old => ({ ...old, ...next }))
    setSettings(next.wallet.settings)
    setClientOverrides(Object.entries(next.wallet.settings.clientRates).map(([k, v]) => `${k}=${v}`).join('\n'))
    setEmployeeOverrides(Object.entries(next.wallet.settings.employeeRates).map(([k, v]) => `${k}=${v}`).join('\n'))
    setDrafts(next.wallet.drafts)
  }, [])
  const load = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError('')
    try {
      const response = await fetch('/api/finance', { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      apply(result)
    } catch (e) { setError((e as Error).message) }
    finally { busyRef.current = false; setBusy(false) }
  }, [apply])
  useEffect(() => { void load() }, [load])
  useEffect(() => { setView(initialView) }, [initialView])
  async function mutate(payload: Record<string, unknown>, success: string) {
    if (!data || busyRef.current) return false
    busyRef.current = true; setBusy(true); setError(''); setNotice('')
    const json = JSON.stringify(payload)
    const requestId = retryRef.current?.json === json ? retryRef.current.id : crypto.randomUUID()
    retryRef.current = { json, id: requestId }
    try {
      const response = await fetch('/api/finance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, requestId, revision: data.revision }) })
      const result = await response.json()
      if (!response.ok) {
        if (response.status === 409) retryRef.current = null
        throw new Error(result.error)
      }
      const preserved = Object.fromEntries(Object.entries(drafts).filter(([key, draft]) => {
        if ((payload.action === 'draft' || payload.action === 'cashout') && key.slice(8) === payload.employeeId && key.slice(0, 7) <= String(payload.month)) return false
        return JSON.stringify(draft) !== JSON.stringify(data.wallet.drafts[key])
      }))
      apply(result); setDrafts({ ...result.wallet.drafts, ...preserved }); retryRef.current = null; setNotice(success)
      return true
    } catch (e) { setError((e as Error).message); return false }
    finally { busyRef.current = false; setBusy(false) }
  }
  // Refreshing the dashboard imports newly approved work once rates are configured.
  // The reference also prevents a failed import from creating an automatic retry loop.
  useEffect(() => {
    if (!data || busy || busyRef.current || data.wallet.settings.clientRate <= 0) return
    const ids = (data.projects || []).filter(p => ['Approved', 'Paid', 'Closed'].includes(p.Status || '') && !data.wallet.projects.some(s => s.id === p.Project_ID)).map(p => p.Project_ID).sort().join('|')
    if (!ids || autoSyncRef.current === ids) return
    autoSyncRef.current = ids
    void mutate({ action: 'sync' }, 'New completed projects added using your saved rates.')
  })
  function download() {
    if (!data) return
    const escape = (v: unknown) => `"${String(v ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`
    const rows: unknown[][] = [['Date', 'Type', 'Reference', 'Name / description', 'Gross INR', 'Bonus INR', 'Other INR', 'TDS INR', 'Net / amount INR', 'Project IDs']]
    for (const s of data.wallet.settlements.filter(s => month === 'all' || s.date.startsWith(month))) rows.push([s.date, 'Payout', s.id, s.name, s.gross / 100, s.bonus / 100, s.others / 100, s.tds / 100, s.net / 100, s.lines.map(l => l.projectId).join('; ')])
    for (const e of data.wallet.entries.filter(e => month === 'all' || e.date.startsWith(month))) rows.push([e.date, e.kind, e.id, e.note, '', '', '', '', e.amount / 100, e.projectId])
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `aniblend-wallet-${month}.csv`; a.click(); URL.revokeObjectURL(url)
  }
  if (!data) return <section className={styles.wallet}><div className={styles.panel}><h2>Studio wallet</h2><p>{busy ? 'Loading saved wallet…' : 'Connect your wallet'}</p>{error && <div role="alert" className={styles.error}>{error}</div>}<button onClick={load} disabled={busy}>Retry connection</button><p className={styles.muted}>First setup: run the supplied wallet SQL migration, then sign in again.</p></div></section>
  const wallet = data.wallet
  const totals = summarize(wallet, month)
  const allTotals = summarize(wallet, 'all')
  const payableMonth = month === 'all' ? today().slice(0, 7) : month
  const lines = pending(wallet, payableMonth)
  const employees = [...new Set([...lines.map(l => l.employeeId), ...Object.keys(wallet.drafts).filter(k => k.slice(0, 7) <= payableMonth).map(k => k.slice(8))])].map(id => ({ id, name: lines.find(l => l.employeeId === id)?.name || data.artists?.find(a => a.Employee_ID === id)?.Name || id, lines: lines.filter(l => l.employeeId === id) }))
  const filteredProjects = wallet.projects.filter(p => (month === 'all' || p.date.startsWith(month)) && `${p.id} ${p.title} ${p.client}`.toLowerCase().includes(search.toLowerCase()))
  const legacyCount = wallet.projects.filter(p => p.legacy).length
  const months = [...new Set([today().slice(0, 7), month, ...Object.keys(wallet.drafts).map(k => k.slice(0, 7)), ...wallet.projects.map(p => p.date.slice(0, 7)), ...wallet.entries.map(e => e.date.slice(0, 7)), ...wallet.settlements.map(s => s.date.slice(0, 7))])].filter(m => m !== 'all').sort().reverse()
  const newCount = (data.projects || []).filter(p => ['Approved', 'Paid', 'Closed'].includes(p.Status || '') && !wallet.projects.some(s => s.id === p.Project_ID)).length
  const defaultDraft = (): Draft => ({ bonus: 0, others: 0, tdsPercent: wallet.settings.tdsPercent, note: '' })
  const calc = (id: string) => {
    const selected = lines.filter(l => l.employeeId === id && !excluded.has(l.key))
    const draft = drafts[`${payableMonth}:${id}`] || defaultDraft()
    const gross = selected.reduce((n, l) => n + l.gross, 0)
    const extra = selected.reduce((n, l) => n + l.extra, 0)
    const earlier = adjustments(Object.fromEntries(Object.entries(wallet.drafts).filter(([key]) => key.slice(0, 7) < payableMonth)), id, payableMonth).reduce((n, d) => n + d.bonus + d.others, 0)
    const tds = Math.round(gross * draft.tdsPercent / 100)
    return { selected, draft, gross, extra: extra + earlier, tds, net: gross + extra + earlier + Math.round((draft.bonus + draft.others) * 100) - tds }
  }
  const dirty = (id: string) => JSON.stringify(drafts[`${payableMonth}:${id}`] || defaultDraft()) !== JSON.stringify(wallet.drafts[`${payableMonth}:${id}`] || defaultDraft())
  const changeDraft = (id: string, key: keyof Draft, value: string) => setDrafts(old => ({ ...old, [`${payableMonth}:${id}`]: { ...(old[`${payableMonth}:${id}`] || defaultDraft()), [key]: key === 'note' ? value : number(value) } }))
  function parseOverrides(text: string) {
    return Object.fromEntries(text.split('\n').filter(s => s.trim()).map(line => { const [key, rate, ...rest] = line.split('='); if (!key?.trim() || rate === undefined || rest.length) throw new Error('Use one name=rate per line'); return [key.trim(), number(rate.trim())] }))
  }
  return <section className={styles.wallet} aria-label="Studio finance wallet">
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>ANIBLEND / FINANCE</span><h1>Every project. Every rupee.</h1><p>Your payouts, studio profit and money history in one place.</p></div>
      <div className={styles.actions}><select aria-label="Reporting month" value={month} onChange={e => { setMonth(e.target.value); setExcluded(new Set()); setReview(null) }}><option value="all">All time</option>{months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select><button disabled={busy} onClick={load}>Refresh</button></div>
    </header>
    <nav className={styles.tabs} aria-label="Finance views">{(['profit', 'payouts', 'history', 'settings'] as const).map(tab => <button key={tab} aria-current={view === tab ? 'page' : undefined} onClick={() => setView(tab)}>{({ profit: 'Profit overview', payouts: 'Team payouts', history: 'Wallet history', settings: 'Rates & settings' })[tab]}</button>)}</nav>
    {error && <div role="alert" className={styles.error}>{error}</div>}{notice && <div role="status" className={styles.success}>{notice}</div>}
    {newCount > 0 && <div className={styles.banner}><div><b>{newCount} completed projects ready to import</b><p>Set your rates, then import to freeze their revenue and team costs. Existing wallet records stay intact.</p></div><button disabled={busy} onClick={() => mutate({ action: 'sync' }, 'Completed projects imported. Existing history preserved.')}>Import projects</button></div>}
    {legacyCount > 0 && <p className={styles.warning}>{legacyCount} historical paid projects use estimated cost snapshots. Old payouts and bank receipts are not imported as cash transactions. Review their project amounts; cash totals cover wallet entries only.</p>}
    {view === 'profit' && <>
      <div className={styles.hero}><div><span>STUDIO PROFIT · {monthLabel(month)}</span><strong>{money(totals.profit)}</strong><p>Earned revenue + client bonuses − team cost − business expenses</p></div><div className={styles.heroSide}><span>RECORDED CASH BALANCE · ALL TIME</span><b>{money(allTotals.cash)}</b><small>Based on recorded receipts, payouts and adjustments</small></div></div>
      <div className={styles.stats}>{[['Earned revenue', totals.revenue, 'Includes paid and unpaid projects'], ['Team cost', totals.teamCost, 'Gross pay, bonuses and saved extras'], ['Business expenses', totals.expenses, 'Logged operating costs'], ['Client bonuses', totals.bonus, 'Additional income received']].map(([label, value, help]) => <div key={String(label)} className={styles.stat}><span>{label}</span><b>{money(Number(value))}</b><small>{help}</small></div>)}</div>
      <div className={styles.columns}><div className={styles.panel}><h2>Money movement</h2><p className={styles.muted}>{monthLabel(month)} · Cash moves on transaction date</p>{[['Client payments received', totals.receipts], ['Net paid to team', totals.cashPaid], ['Tax withheld in payouts', totals.tds], ['Net cash movement', totals.cash]].map(([label, value]) => <div key={String(label)} className={styles.metric}><span>{label}</span><b>{money(Number(value))}</b></div>)}<p className={styles.muted}>Tax withheld stays a liability, not profit. Record tax remittance as a withdrawal with a reference; it is already included in gross team cost.</p></div>
      <form className={styles.panel} onSubmit={async e => { e.preventDefault(); if (await mutate({ action: 'entry', ...entry, amount: number(entry.amount) }, 'Transaction saved to wallet history.')) setEntry({ ...entry, amount: '', note: '' }) }}><h2>Add a transaction</h2><div className={styles.formGrid}><label>Type<select value={entry.kind} onChange={e => setEntry({ ...entry, kind: e.target.value })}><option value="expense">Business expense</option><option value="client_bonus">Client bonus received</option><option value="receipt">Client payment received</option><option value="capital">Opening balance / funds added</option><option value="withdrawal">Owner withdrawal / tax remittance</option></select></label><label>Amount (₹)<input required type="number" min="0.01" step="0.01" value={entry.amount} onChange={e => setEntry({ ...entry, amount: e.target.value })} /></label><label>Date<input required type="date" max={today()} value={entry.date} onChange={e => setEntry({ ...entry, date: e.target.value })} /></label><label>Project<select value={entry.projectId} required={entry.kind === 'receipt'} onChange={e => setEntry({ ...entry, projectId: e.target.value })}><option value="">Studio / no project</option>{wallet.projects.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}</select></label></div><label>Description / payment reference<input required maxLength={1000} value={entry.note} placeholder="e.g. September software subscription" onChange={e => setEntry({ ...entry, note: e.target.value })} /></label><button className={styles.primary} disabled={busy}>Save transaction</button></form></div>
      <div className={styles.panel}><div className={styles.sectionHead}><div><h2>Project profitability</h2><p className={styles.muted}>Recognition month stays the same after cashout. Client receipts do not create revenue twice.</p></div><input aria-label="Search projects" placeholder="Search project or client…" value={search} onChange={e => setSearch(e.target.value)} /></div><div className={styles.tableWrap}><table><thead><tr><th>Project / client</th><th>Revenue</th><th>Team cost</th><th>Project margin*</th><th>Client due</th><th>Status</th><th /></tr></thead><tbody>{filteredProjects.map(p => { const cost = p.obligations.reduce((n, o) => n + o.gross + o.extra, 0); const receipts = wallet.entries.filter(e => e.projectId === p.id && e.kind === 'receipt').reduce((n, e) => n + e.amount, 0); return <tr key={p.id}><td><b>{p.title}</b><small>{p.id} · {p.client} · {p.date}</small>{p.issues.length > 0 && <small className={styles.danger}>{p.issues.join('; ')}</small>}</td><td>{money(p.revenue)}</td><td>{money(cost)}</td><td>{money(p.revenue - cost)}</td><td>{money(p.revenue - receipts)}</td><td><span className={styles.badge}>{p.legacy ? 'Historical estimate' : p.obligations.every(o => o.settlementId) ? 'Team paid' : 'Payout pending'}</span></td><td><button disabled={busy || p.obligations.some(o => o.settlementId && o.settlementId !== 'legacy')} onClick={() => setEdit(structuredClone(p))}>Review</button></td></tr> })}</tbody></table>{filteredProjects.length === 0 && <p className={styles.empty}>No projects for this period. Import completed projects to start.</p>}</div><p className={styles.muted}>*Before monthly bonuses and studio expenses. Historical figures remain estimates until reconciled with your old payment records.</p></div>
    </>}
    {view === 'payouts' && <>
      <div className={styles.hero}><div><span>UNPAID WORK THROUGH {monthLabel(payableMonth).toUpperCase()}</span><strong>{money(lines.reduce((n, l) => n + l.gross + l.extra, 0))}</strong><p>{employees.length} team members · {new Set(lines.map(l => l.projectId)).size} projects · before draft bonuses and tax</p></div><div className={styles.heroSide}><b>Unpaid work carries forward</b><small>Untick a work item to defer it. A new month never deletes money owed.</small></div></div>
      <p className={styles.warning}>Cashout records a payment you have already made. It does not send a bank transfer. Saved bonuses and extras from earlier months carry forward and are included once. Save draft changes before reviewing a payout.</p>
      <form className={styles.panel} onSubmit={async e => { e.preventDefault(); if (await mutate({ action: 'draft', employeeId: extraPay.employeeId, month: payableMonth, draft: { bonus: number(extraPay.amount), others: 0, tdsPercent: wallet.settings.tdsPercent, note: extraPay.note } }, 'Extra payout added. Review it below before cashout.')) setExtraPay({ employeeId: '', amount: '', note: '' }) }}><h2>Add a bonus-only payout</h2><div className={styles.draftGrid}><label>Team member<select required value={extraPay.employeeId} onChange={e => setExtraPay({ ...extraPay, employeeId: e.target.value })}><option value="">Select member</option>{data.artists?.filter(a => !employees.some(e => e.id === a.Employee_ID)).map(a => <option key={a.Employee_ID} value={a.Employee_ID}>{a.Name}</option>)}</select></label><label>Bonus (₹)<input required type="number" min="0.01" step="0.01" value={extraPay.amount} onChange={e => setExtraPay({ ...extraPay, amount: e.target.value })} /></label><label>Note<input required value={extraPay.note} onChange={e => setExtraPay({ ...extraPay, note: e.target.value })} /></label><div><button disabled={busy}>Add payout draft</button></div></div></form>
      {employees.length === 0 && <div className={styles.panel}><p className={styles.empty}>You’re all caught up. No unpaid work for this period.</p></div>}
      {employees.map(employee => { const c = calc(employee.id); return <article className={styles.panel} key={employee.id}><div className={styles.sectionHead}><div><span className={styles.eyebrow}>{employee.id}</span><h2>{employee.name}</h2></div><div className={styles.payoutTotal}><span>Net payable</span><b>{money(c.net)}</b></div></div><div className={styles.tableWrap}><table><thead><tr><th>Include</th><th>Project</th><th>Role / time</th><th>Gross</th><th>Project extras</th></tr></thead><tbody>{employee.lines.map(l => <tr key={l.key}><td><input type="checkbox" aria-label={`Include ${l.projectId} ${l.role} for ${employee.name}`} checked={!excluded.has(l.key)} disabled={busy} onChange={e => setExcluded(old => { const next = new Set(old); if (e.target.checked) next.delete(l.key); else next.add(l.key); return next })} /></td><td><b>{l.title}</b><small>{l.projectId} · {l.date}</small>{l.issues.length > 0 && <small className={styles.danger}>{l.issues.join('; ')}</small>}</td><td>{l.role}<small>{l.seconds ? `${l.seconds.toFixed(1)} seconds · ₹${l.rate}/min` : 'Fixed fee'}</small></td><td>{money(l.gross)}</td><td>{money(l.extra)}</td></tr>)}</tbody></table></div>{c.draft.needsReview && <p className={styles.warning}>Imported adjustments: check the bonus and other amount against old records, then Save draft to confirm them.</p>}<div className={styles.draftGrid}><label>Bonus (₹)<input type="number" min="0" step="0.01" value={Number.isFinite(c.draft.bonus) ? c.draft.bonus : ''} onChange={e => changeDraft(employee.id, 'bonus', e.target.value)} /></label><label>Other pay (₹)<input type="number" min="0" step="0.01" value={Number.isFinite(c.draft.others) ? c.draft.others : ''} onChange={e => changeDraft(employee.id, 'others', e.target.value)} /></label><label>Tax withholding (%)<input type="number" min="0" max="100" step="0.01" value={Number.isFinite(c.draft.tdsPercent) ? c.draft.tdsPercent : ''} onChange={e => changeDraft(employee.id, 'tdsPercent', e.target.value)} /></label><label>Note / reference<input value={c.draft.note} onChange={e => changeDraft(employee.id, 'note', e.target.value)} /></label></div><div className={styles.sectionHead}><p className={styles.muted}>Gross {money(c.gross)} + extras {money(c.extra + Math.round((c.draft.bonus + c.draft.others) * 100))} − tax {money(c.tds)}</p><div className={styles.actions}><button disabled={busy} onClick={() => mutate({ action: 'draft', employeeId: employee.id, month: payableMonth, draft: c.draft }, 'Payout draft saved. Profit now includes the saved bonus and extras.')}>Save draft{dirty(employee.id) ? ' *' : ''}</button><button className={styles.primary} disabled={busy || dirty(employee.id) || (!c.selected.length && !(c.net > 0)) || !!c.draft.needsReview || c.selected.some(l => l.issues.length > 0)} onClick={() => setReview(employee.id)}>Review cashout</button></div></div></article> })}
    </>}
    {view === 'history' && <div className={styles.panel}><div className={styles.sectionHead}><div><h2>Wallet history</h2><p className={styles.muted}>Permanent payment receipts and corrections · {monthLabel(month)}</p></div><button onClick={download}>Export CSV</button></div>
      {[...wallet.settlements.filter(s => month === 'all' || s.date.startsWith(month)).map(s => ({ date: s.date, id: s.id, node: <details key={s.id} className={styles.history}><summary><span className={styles.historyIcon}>↗</span><span><b>{s.name}</b><small>Team payout · {s.date} · {s.month}</small></span><strong>−{money(s.net)}</strong></summary><div className={styles.historyBody}><p>Receipt {s.id}</p><p>Gross {money(s.gross)} · bonus {money(s.bonus)} · other {money(s.others)} · withheld {money(s.tds)} · net {money(s.net)}</p><p>{s.note}</p>{s.lines.map(l => <div className={styles.metric} key={l.key}><span>{l.projectId} / {l.role}</span><b>{money(l.gross + l.extra)}</b></div>)}</div></details> })), ...wallet.entries.filter(e => month === 'all' || e.date.startsWith(month)).map(e => ({ date: e.date, id: e.id, node: <div key={e.id} className={styles.history}><div className={styles.entryRow}><span className={styles.historyIcon}>{['expense', 'withdrawal'].includes(e.kind) ? '↗' : '↙'}</span><span><b>{e.note}</b><small>{e.kind.replaceAll('_', ' ')} · {e.date}{e.projectId ? ` · ${e.projectId}` : ''}{e.reverses ? ' · correction' : ''}</small></span><strong>{money(e.amount)}</strong>{!e.reverses && !wallet.entries.some(r => r.reverses === e.id) && <button disabled={busy} onClick={() => { const note = window.prompt('Reason for reversing this transaction (the original remains in history):'); if (note) void mutate({ action: 'reverse', entryId: e.id, note }, 'Correction recorded. Original transaction preserved.') }}>Reverse</button>}</div></div> }))].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).map(item => item.node)}
      {!wallet.settlements.length && !wallet.entries.length && <p className={styles.empty}>Your first saved payment or transaction will appear here.</p>}
      {!!data.legacyPayments?.length && <details className={styles.audit}><summary>Earlier payment records · {data.legacyPayments.length}</summary><p className={styles.muted}>Original payments from your existing database. These are shown for reconciliation and are not counted again as wallet cash movement.</p><div className={styles.tableWrap}><table><thead><tr><th>Date / reference</th><th>Team member</th><th>Gross</th><th>Bonus / other</th><th>Net paid</th></tr></thead><tbody>{data.legacyPayments.filter(p => month === 'all' || p.date.startsWith(month)).map(p => <tr key={p.id}><td>{p.date || 'Date unknown'}<small>{p.reference}</small></td><td>{p.name}<small>{p.note}</small></td><td>{money(p.gross)}</td><td>{money(p.bonus + p.others)}</td><td>{money(p.net)}</td></tr>)}</tbody></table></div></details>}
      <details className={styles.audit}><summary>Change log · {wallet.audit.length} saved actions</summary>{[...wallet.audit].reverse().map(a => <div key={a.id}><b>{a.action} · {new Date(a.date).toLocaleString('en-IN')}</b><small>{a.actor}</small><p>{a.detail}</p></div>)}</details></div>}
    {view === 'settings' && <div className={styles.columns}><form className={styles.panel} onSubmit={async e => { e.preventDefault(); try { await mutate({ action: 'settings', settings: { ...settings, clientRates: parseOverrides(clientOverrides), employeeRates: parseOverrides(employeeOverrides) } }, 'Rates saved. New imports will use these rates.') } catch (e) { setError((e as Error).message) } }}><h2>Studio rates</h2><p className={styles.muted}>Amounts in rupees. Rates are saved in the database. Already settled amounts stay locked.</p><div className={styles.formGrid}>{([['clientRate', 'Default client rate / min'], ['fullRate', 'Full production rate / min'], ['animationRate', 'Animation rate / min'], ['lightingRate', 'Lighting rate / min'], ['leadFee', 'Lead fee / project'], ['tdsPercent', 'Default tax withholding %'], ['rounding', 'Round team pay to ₹ (0 = exact)']] as const).map(([key, label]) => <label key={key}>{label}<input type="number" required min="0" max={key === 'tdsPercent' ? 100 : 1000000} step="0.01" value={Number.isFinite(settings[key]) ? settings[key] : ''} onChange={e => setSettings({ ...settings, [key]: number(e.target.value) })} /></label>)}</div><label>Client/channel rates · one code=rate per line<textarea rows={4} placeholder={'plip=9000\nher=10000'} value={clientOverrides} onChange={e => setClientOverrides(e.target.value)} /></label><label>Employee rate overrides · one ID=rate per line<textarea rows={4} placeholder="EMP001=5000" value={employeeOverrides} onChange={e => setEmployeeOverrides(e.target.value)} /></label><button className={styles.primary} disabled={busy}>Save rates</button></form><div className={styles.panel}><h2>Apply saved rates</h2><p>New project imports use your saved rates. To apply changed rates or source project corrections to existing unpaid work, recalculate below.</p><p>Cashouts keep their original amounts, duration and rates. Historical paid projects can be reviewed individually.</p><button disabled={busy} onClick={() => { if (window.confirm('Recalculate all completely unpaid projects with the saved rates and latest project details? This replaces their manual cost edits. Paid projects stay locked.')) void mutate({ action: 'reprice' }, 'Unpaid project amounts recalculated. Review payouts before cashout.') }}>Recalculate unpaid projects</button><hr /><h2>How your money is counted</h2><ul><li>Project approval creates earned revenue and a team cost.</li><li>Client receipts increase cash and reduce the amount due.</li><li>Cashout clears selected team work; revenue stays intact.</li><li>Client bonuses increase both profit and recorded cash.</li><li>Owner withdrawals affect cash, not operating profit.</li><li>Unpaid work remains payable across month boundaries.</li></ul><p className={styles.muted}>Client/channel defaults come from the third part of your project ID. An employee override applies to animation and lighting work; lead fees remain separate.</p></div></div>}
    {review && (() => { const c = calc(review); return <div className={styles.modalBackdrop}><div role="dialog" aria-modal="true" aria-labelledby="cashout-title" className={styles.modal}><h2 id="cashout-title">Confirm recorded cashout</h2><p>{employees.find(e => e.id === review)?.name} · {c.selected.length} selected work items</p><strong className={styles.confirmTotal}>{money(c.net)}</strong><p>Only these work items will leave pending payouts. Earned revenue and project history will remain. This records an already completed payment.</p><div className={styles.actions}><button disabled={busy} onClick={() => setReview(null)}>Cancel</button><button disabled={busy} className={styles.primary} onClick={async () => { if (await mutate({ action: 'cashout', employeeId: review, month: payableMonth, keys: c.selected.map(l => l.key) }, 'Cashout saved. Paid work removed from pending; revenue preserved.')) { setReview(null); setExcluded(new Set()); onRefresh() } }}>{busy ? 'Saving…' : 'Record cashout'}</button></div></div></div> })()}
    {edit && <div className={styles.modalBackdrop}><form role="dialog" aria-modal="true" aria-labelledby="project-title" className={styles.modal} onSubmit={async e => { e.preventDefault(); if (await mutate({ action: 'project', projectId: edit.id, clientRate: edit.clientRate, date: edit.date, costs: edit.obligations.map(o => ({ key: o.key, gross: o.gross / 100, extra: o.extra / 100 })) }, 'Project amounts saved.')) setEdit(null) }}><h2 id="project-title">Review project amounts</h2><p>{edit.id}{edit.legacy ? ' · historical estimate' : ''}</p><label>Recognition date<input required type="date" max={today()} value={edit.date} onChange={e => setEdit({ ...edit, date: e.target.value })} /></label><label>Client rate / minute (₹)<input required type="number" min="0" step="0.01" value={edit.clientRate} onChange={e => setEdit({ ...edit, clientRate: number(e.target.value) })} /></label>{edit.obligations.map((o, i) => <div key={o.key}><p><b>{o.name} · {o.role}</b></p><div className={styles.formGrid}>{(['gross', 'extra'] as const).map(field => <label key={field}>{field === 'gross' ? 'Work cost' : 'Bonus / extra'} (₹)<input required type="number" min="0" step="0.01" value={o[field] / 100} onChange={e => setEdit({ ...edit, obligations: edit.obligations.map((item, index) => index === i ? { ...item, [field]: Math.round(number(e.target.value) * 100) } : item) })} /></label>)}</div></div>)}<div className={styles.actions}><button type="button" disabled={busy} onClick={() => setEdit(null)}>Cancel</button><button disabled={busy} className={styles.primary}>Save project</button></div></form></div>}
  </section>
}

