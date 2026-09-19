// All money is stored as integer paise. Settlements never remove earned revenue.
export type SourceProject = { Project_ID: string; Project_title?: string; Duration?: string; Status?: string; Payment_Status?: string; Employee_ID?: string; Animator?: string; Lighting_Artist?: string; Lead?: string; Bonus?: number; Other_Payment?: number; 'Date Approved'?: string; Approved_Date?: string; client_paid_date?: string; output_history?: { empId: string; seconds: number }[] }
export type Artist = { Employee_ID: string; Name: string; others_amount?: number | string }
export type Settings = { clientRate: number; fullRate: number; animationRate: number; lightingRate: number; leadFee: number; tdsPercent: number; rounding: number; clientRates: Record<string, number>; employeeRates: Record<string, number> }
export type Obligation = { key: string; employeeId: string; name: string; role: string; seconds: number; rate: number; gross: number; extra: number; settlementId?: string }
export type FinanceProject = { id: string; title: string; client: string; date: string; seconds: number; clientRate: number; revenue: number; obligations: Obligation[]; legacy: boolean; issues: string[] }
export type Draft = { bonus: number; others: number; tdsPercent: number; note: string; employeeName?: string; needsReview?: boolean }
export type Settlement = { id: string; requestId: string; date: string; month: string; employeeId: string; name: string; gross: number; bonus: number; others: number; tds: number; net: number; note: string; adjustments?: { month: string; bonus: number; others: number }[]; lines: { projectId: string; title: string; key: string; role: string; gross: number; extra: number; seconds: number; rate: number }[] }
export type Entry = { id: string; requestId: string; kind: 'receipt' | 'client_bonus' | 'expense' | 'capital' | 'withdrawal'; date: string; amount: number; note: string; projectId: string; reverses?: string }
export type Audit = { id: string; date: string; actor: string; action: string; detail: string }
export type Wallet = { version: 1; legacyImported?: boolean; settings: Settings; projects: FinanceProject[]; settlements: Settlement[]; entries: Entry[]; drafts: Record<string, Draft>; audit: Audit[] }
export const defaults: Settings = { clientRate: 0, fullRate: 5000, animationRate: 3000, lightingRate: 2000, leadFee: 1000, tdsPercent: 10, rounding: 100, clientRates: {}, employeeRates: {} }
export function emptyWallet(): Wallet { return { version: 1, settings: { ...defaults, clientRates: {}, employeeRates: {} }, projects: [], settlements: [], entries: [], drafts: {}, audit: [] } }
export function amount(value: unknown, label = 'Amount', max = 100000000): number {
  if (value === '' || value === null || typeof value === 'boolean') throw new Error(`${label} is required`)
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || n > max) throw new Error(`${label} must be between 0 and ${max}`)
  return n
}
export const paise = (n: number) => Math.round(n * 100)
export function dateKey(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) { const d = new Date(value); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : '' }
  const d = new Date(value)
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : ''
}
export function today() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) }
export function duration(raw: string, id = ''): number {
  const s = String(raw || '').trim().toLowerCase()
  if (!s) return Number(id.split('_')[1]) || 0
  if (/^\d+(?::\d{1,2}){1,2}$/.test(s)) return s.split(':').reduce((n, part) => n * 60 + Number(part), 0)
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s)
  let seconds = 0
  for (const match of s.matchAll(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/g)) seconds += Number(match[1]) * (match[2][0] === 'h' ? 3600 : match[2][0] === 'm' ? 60 : 1)
  return seconds
}
const norm = (s: string) => s.trim().toLowerCase()
export function validateSettings(input: Settings): Settings {
  const result = { ...defaults, clientRates: {}, employeeRates: {} } as Settings
  for (const key of ['clientRate', 'fullRate', 'animationRate', 'lightingRate', 'leadFee', 'rounding', 'tdsPercent'] as const) result[key] = amount(input[key], key, key === 'tdsPercent' ? 100 : 1000000)
  for (const key of ['clientRates', 'employeeRates'] as const) {
    if (!input[key] || typeof input[key] !== 'object' || Array.isArray(input[key])) throw new Error('Invalid rate overrides')
    for (const [id, rate] of Object.entries(input[key])) { if (!id.trim() || id.length > 200) throw new Error('Invalid rate name'); result[key][id.trim()] = amount(rate, 'Rate', 1000000) }
  }
  return result
}
export function snapshot(p: SourceProject, artists: Artist[], settings: Settings): FinanceProject {
  const issues: string[] = []
  const seconds = duration(p.Duration || '', p.Project_ID)
  const client = p.Project_ID.split('_')[2]?.toLowerCase() || 'default'
  const clientRate = settings.clientRates[client] ?? settings.clientRate
  if (clientRate === 0 && settings.clientRates[client] === undefined) issues.push('Client rate missing; review project rate')
  const legacy = ['paid', 'closed'].includes(norm(p.Payment_Status || '')) || ['paid', 'closed'].includes(norm(p.Status || '')) && norm(p.Payment_Status || '') !== 'client paid'
  const date = dateKey(p['Date Approved'] || p.Approved_Date || '')
  if (!date) issues.push('Approval date missing; choose a recognition date')
  if (!seconds) issues.push('Duration missing')
  const obligations: Obligation[] = []
  const find = (name: string) => artists.find(a => norm(a.Name) === norm(name))
  const ids = new Set<string>()
  if (p.Employee_ID) ids.add(p.Employee_ID)
  for (const name of String(p.Animator || '').split(',').filter(s => s.trim())) { const a = find(name); if (a) ids.add(a.Employee_ID); else issues.push(`Unknown animator: ${name}`) }
  const history = Array.isArray(p.output_history) ? p.output_history : []
  const shares = new Map<string, number>()
  for (const h of history) { if (h.empId && Number(h.seconds) > 0) shares.set(h.empId, (shares.get(h.empId) || 0) + Number(h.seconds)) }
  if (shares.size) { ids.clear(); for (const id of shares.keys()) ids.add(id) }
  const add = (id: string, name: string, role: string, sec: number, rate: number, fixed?: number) => {
    const rupees = fixed ?? sec * rate / 60
    const rounded = fixed !== undefined || settings.rounding === 0 ? rupees : Math.round(rupees / settings.rounding) * settings.rounding
    obligations.push({ key: `${p.Project_ID}::${id}::${role}`, employeeId: id, name, role, seconds: sec, rate, gross: paise(rounded), extra: 0, ...(legacy ? { settlementId: 'legacy' } : {}) })
  }
  for (const id of ids) {
    const a = artists.find(a => a.Employee_ID === id)
    if (!a) issues.push(`Unknown employee: ${id}`)
    const rate = settings.employeeRates[id] ?? (id.toUpperCase().includes('A') || p.Lighting_Artist ? settings.animationRate : settings.fullRate)
    add(id, a?.Name || id, 'Animation', shares.size ? shares.get(id)! : seconds / ids.size, rate)
  }
  if (p.Lighting_Artist) { const a = find(p.Lighting_Artist); if (a) add(a.Employee_ID, a.Name, 'Lighting', seconds, settings.employeeRates[a.Employee_ID] ?? settings.lightingRate); else issues.push(`Unknown lighting artist: ${p.Lighting_Artist}`) }
  if (p.Lead) { const a = find(p.Lead); if (a) add(a.Employee_ID, a.Name, 'Lead', 0, settings.leadFee, settings.leadFee); else issues.push(`Unknown lead: ${p.Lead}`) }
  if (!obligations.length) issues.push('No payable team member found')
  const extra = paise((Number(p.Bonus) || 0) + (Number(p.Other_Payment) || 0))
  const recipient = obligations.find(o => o.employeeId === p.Employee_ID && o.role === 'Animation') || obligations.find(o => o.role === 'Animation')
  if (recipient) recipient.extra = extra
  return { id: p.Project_ID, title: p.Project_title || p.Project_ID, client, date: date || today(), seconds, clientRate, revenue: paise(seconds * clientRate / 60), obligations, legacy, issues }
}
export function syncProjects(wallet: Wallet, projects: SourceProject[], artists: Artist[]) {
  const seen = new Set(wallet.projects.map(p => p.id))
  const added: string[] = []
  for (const p of projects) {
    if (!p.Project_ID || seen.has(p.Project_ID) || !['approved', 'paid', 'closed'].includes(norm(p.Status || ''))) continue
    wallet.projects.push(snapshot(p, artists, wallet.settings)); seen.add(p.Project_ID); added.push(p.Project_ID)
  }
  return added
}
export function pending(wallet: Wallet, month: string) {
  return wallet.projects.filter(p => p.date.slice(0, 7) <= month && !p.legacy).flatMap(p => p.obligations.filter(o => !o.settlementId).map(o => ({ ...o, projectId: p.id, title: p.title, date: p.date, issues: p.issues })))
}
export function adjustments(drafts: Record<string, Draft>, employeeId: string, month: string) {
  return Object.entries(drafts).filter(([key]) => key.slice(8) === employeeId && key.slice(0, 7) <= month).map(([key, d]) => ({ month: key.slice(0, 7), bonus: paise(amount(d.bonus)), others: paise(amount(d.others)) }))
}
export function settle(wallet: Wallet, employeeId: string, keys: string[], month: string, requestId: string, id: string): Settlement {
  const prior = wallet.settlements.find(s => s.requestId === requestId)
  if (prior) return prior
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > today().slice(0, 7)) throw new Error('Choose a valid current or previous month')
  const selected = new Set(keys)
  const lines = pending(wallet, month).filter(o => o.employeeId === employeeId && selected.has(o.key))
  if (lines.length !== selected.size) throw new Error('Projects changed or already paid. Refresh and review the payout.')
  if (lines.some(l => l.issues.length)) throw new Error('Resolve project data issues before cashout')
  const draftKey = `${month}:${employeeId}`
  const draft = wallet.drafts[draftKey] || { bonus: 0, others: 0, tdsPercent: wallet.settings.tdsPercent, note: '' }
  const gross = lines.reduce((n, l) => n + l.gross, 0)
  const extras = adjustments(wallet.drafts, employeeId, month)
  if (extras.some(d => wallet.drafts[`${d.month}:${employeeId}`]?.needsReview)) throw new Error('Review and save imported payout adjustments before cashout')
  const bonus = extras.reduce((n, d) => n + d.bonus, 0)
  const others = extras.reduce((n, d) => n + d.others, 0) + lines.reduce((n, l) => n + l.extra, 0)
  if (!lines.length && bonus + others <= 0) throw new Error('No unpaid work or saved adjustments; these items may already be paid')
  const tds = Math.round(gross * amount(draft.tdsPercent, 'TDS', 100) / 100)
  const result: Settlement = { id, requestId, date: today(), month, employeeId, name: lines[0]?.name || draft.employeeName || employeeId, gross, bonus, others, tds, net: gross + bonus + others - tds, note: draft.note, adjustments: extras, lines: lines.map(l => ({ projectId: l.projectId, title: l.title, key: l.key, role: l.role, gross: l.gross, extra: l.extra, seconds: l.seconds, rate: l.rate })) }
  wallet.settlements.push(result)
  for (const p of wallet.projects) for (const o of p.obligations) if (selected.has(o.key)) o.settlementId = id
  for (const d of extras) delete wallet.drafts[`${d.month}:${employeeId}`]
  return result
}
export function summarize(wallet: Wallet, month: string) {
  const inMonth = (date: string) => month === 'all' || date.slice(0, 7) === month
  const projects = wallet.projects.filter(p => inMonth(p.date))
  const entries = wallet.entries.filter(e => inMonth(e.date))
  const sum = (kind: Entry['kind']) => entries.filter(e => e.kind === kind).reduce((n, e) => n + e.amount, 0)
  const revenue = projects.reduce((n, p) => n + p.revenue, 0)
  const baseCost = projects.reduce((n, p) => n + p.obligations.reduce((v, o) => v + o.gross + o.extra, 0), 0)
  const additions = wallet.settlements.reduce((n, s) => n + (s.adjustments || [{ month: s.month, bonus: s.bonus, others: s.others - s.lines.reduce((v, l) => v + l.extra, 0) }]).filter(a => month === 'all' || a.month === month).reduce((v, a) => v + a.bonus + a.others, 0), 0)
    + Object.entries(wallet.drafts).filter(([key]) => month === 'all' || key.startsWith(`${month}:`)).reduce((n, [, draft]) => n + paise(draft.bonus + draft.others), 0)
  const cashPaid = wallet.settlements.filter(s => inMonth(s.date)).reduce((n, s) => n + s.net, 0)
  const tds = wallet.settlements.filter(s => inMonth(s.date)).reduce((n, s) => n + s.tds, 0)
  const bonus = sum('client_bonus'), expenses = sum('expense'), receipts = sum('receipt')
  return { revenue, bonus, expenses, teamCost: baseCost + additions, profit: revenue + bonus - baseCost - additions - expenses, receipts, cashPaid, tds, cash: receipts + bonus + sum('capital') - cashPaid - expenses - sum('withdrawal'), outstanding: revenue - receipts }
}
