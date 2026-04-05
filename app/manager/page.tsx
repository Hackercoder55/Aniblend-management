'use client'

import React, { useState, useEffect, useCallback, Fragment } from 'react'
import { useRouter } from 'next/navigation'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Project {
  Project_ID: string
  Project_title: string
  Project_link: string
  Animator: string
  Employee_ID: string
  Lead: string
  Status: string
  assigned_head?: string
  'Date Assigned': string
  'Date Approved': string
  Approved_Date: string
  Duration: string
  Payment_Status: string
  Approved_Video: string
  Thread_ID: string
  Discord_ID: string
  Discord_Username: string
  WIP: boolean
  client_paid_date: string
  paid_date?: string
  Priority?: string
  Head_Comment?: string
  progress?: string
  emp_type?: string
  warning?: string
  acknowledgement?: string
  output_history?: { date: string; empId: string; seconds: number }[]
  viewport_date?: string
  animation_revision_date?: string
  ready_to_render_date?: string
  render_qa_date?: string
}

interface Animator {
  Employee_ID: string
  Name: string
  'Current video': number
  'Total video': number
  Role: string
  Discord_ID: string
  Discord_Username: string
  Channel_ID: string
  'Interview notes': string
  'Phone Number': string
  'E-mail': string
  phone?: string
  email?: string
  'Contract Type': string
  Compensation: string
  Render: string
}

interface DashboardUser {
  id: string
  email: string
  role: string
  full_name: string
  employee_id: string
}

interface FormSubmission {
  id: number
  timestamp: string
  project_id: string
  employee_id: string
  lead_name: string
  version: string
  video_link: string
  comments: string
  title: string
  status: string
  feedback: string
  animator_notified: boolean
  discord_notified: string
  created_at: string
}

interface Payment {
  id: number
  Timestamp: string
  'Employee ID': string
  'Project ID': string
  'Contract Type': string
  'UPI ID': string
  'Account Number': string
  Name: string
  'IFSC CODE': string
  'Account Holder Name': string
  'Bank Branch'?: string
  'PAN Number': string
  'Full Name': string
  Payment_Status: string
  Discord_ID: string
  Discord_Username: string
  Discord_Notified: string
  paid_date?: string
  gross?: number          // stored on Mark Paid
  tds_percent?: number    // stored on Mark Paid
  net_paid?: number       // stored on Mark Paid
  bonus?: number          // stored on Mark Paid
  bonus_note?: string
}

interface Note {
  id: number
  created_by: string
  assigned_to: string
  content: string
  is_todo: boolean
  is_done: boolean
  priority: 'low' | 'medium' | 'high'
  created_at: string
  updated_at: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const STATUS_LABELS: Record<string, string> = {
  'Pending': 'Pending',
  'Ongoing': 'Ongoing',
  'Active': 'Animation in Progress',
  'Review': 'Viewport',
  'Changes Requested': 'Animation Revision',
  'Ready to Render': 'Ready to Render',
  'Render QA': 'Render Q/A',
  'Approved': 'Approved',
  'Paid': 'Paid',
  'Closed': 'Closed'
}

function formatDate(d?: Date): string {
  return (d || new Date()).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

/** Parse "DD MMM YYYY" or "DD MMM YY" into a Date (local midnight, cross-browser safe) */
function parseDate(s: string): Date {
  if (!s) return new Date(0)
  const MONTHS: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  }
  const parts = s.trim().split(' ')
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10)
    const mon = MONTHS[parts[1]]
    const yr = parseInt(parts[2].length === 2 ? '20' + parts[2] : parts[2], 10)
    if (!isNaN(day) && mon !== undefined && !isNaN(yr)) {
      return new Date(yr, mon, day) // local midnight — no timezone shift
    }
  }
  // ISO fallback: "2026-02-21" → local midnight via T00:00:00
  if (/^\d{4}-\d{2}-\d{2}$/.test(s.trim())) {
    const [y, m, d] = s.trim().split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  const native = new Date(s)
  return isNaN(native.getTime()) ? new Date(0) : native
}

/** Extract duration from Project_ID: "NUMBER_DURATION_CHANNEL" → "80 sec" */
function extractDuration(projectId: string): string {
  if (!projectId) return ''
  const parts = projectId.split('_')
  if (parts.length >= 2 && parts[1] && !isNaN(Number(parts[1]))) {
    return `${parts[1]} sec`
  }
  return ''
}

/** Extract channel from Project_ID: last segment, normalized to plip/her/his/other */
function extractChannel(projectId: string): string {
  if (!projectId) return 'other'
  const parts = projectId.split('_')
  if (parts.length < 2) return 'other'
  const last = parts[parts.length - 1].toLowerCase()
  if (['plip', 'her', 'his'].includes(last)) return last
  return 'other'
}

/** Parse duration value to seconds: "80 sec" → 80, "2 min" → 120 */
function parseDurationSec(duration: string, projectId?: string): number {
  const raw = duration || (projectId ? extractDuration(projectId) : '') || ''
  if (!raw) return 0
  const str = raw.toLowerCase()
  const n = parseFloat(str.replace(/[^0-9.]/g, '')) || 0
  if (str.includes('min') || str.includes('m')) return n * 60
  if (str.includes('day') || str.includes('d')) return n * 24 * 60 * 60
  if (str.includes('hr') || str.includes('h')) return n * 60 * 60
  return n
}

/** Format seconds as "Xm Ys" or "Xs" */
function formatSec(sec: number): string {
  if (!sec || sec <= 0) return '—'
  sec = Math.round(sec)
  if (sec < 60) return `${sec} sec`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (s === 0) return `${m} min`
  return `${m} min ${s} sec`
}

/** Display a Duration field: if purely numeric append " sec", else return as-is */
function formatDurationDisplay(duration: string, projectId?: string): string {
  const d = duration || (projectId ? extractDuration(projectId) : '') || ''
  if (!d) return '—'
  if (/^\d+$/.test(d.trim())) return `${d.trim()} sec`
  return d
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string }> = {
    Approved: { bg: '#dcfce7', text: '#15803d' },
    Active: { bg: '#dbeafe', text: '#1d4ed8' },
    Review: { bg: '#fef9c3', text: '#854d0e' },
    Pending: { bg: '#ede9fe', text: '#6d28d9' },
    Unassigned: { bg: '#f1f5f9', text: '#64748b' },
    'Changes Requested': { bg: '#fff1f2', text: '#be123c' },
    'Ready to Render': { bg: '#e0e7ff', text: '#4338ca' },
    'Render QA': { bg: '#ffedd5', text: '#c2410c' },
    Paid: { bg: '#dcfce7', text: '#15803d' },
    Closed: { bg: '#f1f5f9', text: '#64748b' },
  }
  const s = styles[status] || { bg: '#f1f5f9', text: '#64748b' }
  const displayLabel = STATUS_LABELS[status] || status
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.text }}>
      {displayLabel}
    </span>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastMsg { id: number; text: string; type: 'success' | 'error' }

function Toast({ toasts, onDismiss }: { toasts: ToastMsg[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id}
          className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white max-w-xs"
          style={{ background: t.type === 'success' ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#ef4444,#dc2626)' }}>
          <span>{t.type === 'success' ? '✅' : '❌'}</span>
          <span className="flex-1">{t.text}</span>
          <button onClick={() => onDismiss(t.id)} className="opacity-70 hover:opacity-100">✕</button>
        </div>
      ))}
    </div>
  )
}

function useToast() {
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const addToast = useCallback((text: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, text, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])
  const dismiss = useCallback((id: number) => setToasts(prev => prev.filter(t => t.id !== id)), [])
  return { toasts, addToast, dismiss }
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <button onClick={copy} className="ml-1 text-gray-300 hover:text-indigo-500 transition-colors" title="Copy">
      {copied
        ? <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
      }
    </button>
  )
}

// ─── Notes & Rating helpers ───────────────────────────────────────────────────

interface NoteEntry {
  id: string
  date: string
  author: string
  role: 'manager' | 'head'
  note: string
  rating?: number
}

function parseNotes(raw: string): NoteEntry[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
  } catch {
    if (raw.trim()) return [{ id: 'legacy', date: '', author: 'System', role: 'manager', note: raw.trim() }]
  }
  return []
}

function serializeNotes(entries: NoteEntry[]): string { return JSON.stringify(entries) }

function avgRating(entries: NoteEntry[]): number | null {
  const rated = entries.filter(e => e.rating != null)
  if (rated.length === 0) return null
  return Math.round((rated.reduce((s, e) => s + (e.rating ?? 0), 0) / rated.length) * 10) / 10
}

function RatingStars({ value, max = 10 }: { value: number; max?: number }) {
  const filled = Math.round(value)
  const color = filled >= 8 ? '#10b981' : filled >= 5 ? '#f59e0b' : '#ef4444'
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <svg key={i} className="w-3 h-3" viewBox="0 0 20 20" fill={i < filled ? color : '#e5e7eb'}>
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="ml-1 text-xs font-semibold" style={{ color }}>{value}/10</span>
    </span>
  )
}

function InteractiveRatingPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0)
  const display = hovered || value
  const color = display >= 8 ? '#10b981' : display >= 5 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 10 }).map((_, i) => (
        <button key={i} type="button" onClick={() => onChange(i + 1)}
          onMouseEnter={() => setHovered(i + 1)} onMouseLeave={() => setHovered(0)}
          className="transition-transform hover:scale-125">
          <svg className="w-5 h-5" viewBox="0 0 20 20" fill={i < display ? color : '#e5e7eb'}>
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
      <span className="ml-2 text-sm font-bold" style={{ color, minWidth: 32 }}>{display ? `${display}/10` : '—'}</span>
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ projects, animators }: { projects: Project[]; animators: Animator[] }) {
  const today = formatDate()
  const [activePanel, setActivePanel] = useState<string | null>(null)

  const activeProjectsList = projects.filter(p => ['Active', 'Review', 'Changes Requested'].includes(p.Status))
  const approvedTodayList = projects.filter(p => p['Date Approved'] === today)
  const workingAnimatorsList = animators.filter(a => (a['Current video'] || 0) > 0)
  const pendingProjectsList = projects.filter(p => p.Status === 'Pending')

  const days: { label: string; assigned: number; approved: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const full = formatDate(d)
    const label = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    days.push({
      label,
      assigned: projects.filter(p => p['Date Assigned'] === full).length,
      approved: projects.filter(p => p['Date Approved'] === full).length,
    })
  }

  const recent = [...projects]
    .filter(p => p['Date Assigned'])
    .sort((a, b) => parseDate(b['Date Assigned']).getTime() - parseDate(a['Date Assigned']).getTime())
    .slice(0, 5)

  const approvedList = projects.filter(p => p.Status === 'Approved')
  const uniqueProjectCount = new Set(projects.map(p => p.Project_ID)).size
  const stats = [
    { label: 'Total Projects', value: uniqueProjectCount, icon: '🗂️', color: '#374151', bg: '#f9fafb' },
    { label: 'Active Projects', value: activeProjectsList.length, icon: '🎬', color: '#667eea', bg: '#f0f0ff' },
    { label: 'Approved Today', value: approvedTodayList.length, icon: '✅', color: '#10b981', bg: '#ecfdf5' },
    { label: 'Working Animators', value: workingAnimatorsList.length, icon: '👥', color: '#f59e0b', bg: '#fffbeb' },
    { label: 'Pending Projects', value: pendingProjectsList.length, icon: '⏳', color: '#ef4444', bg: '#fef2f2' },
  ]

  const panelData: Record<string, React.ReactNode> = {
    'Total Projects': (
      <><p className="text-xs text-gray-400 mb-3">All {projects.length} projects · Approved: {approvedList.length} · Active: {activeProjectsList.length}</p>
        <table className="w-full text-sm"><thead><tr className="border-b border-gray-100">{['Project ID', 'Title', 'Animator', 'Status'].map(h => <th key={h} className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">{h}</th>)}</tr></thead>
          <tbody>{projects.map((p, i) => (
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-3 py-2 font-mono text-xs text-gray-500">{p.Project_ID}</td>
              <td className="px-3 py-2 text-xs font-medium text-gray-800 max-w-[130px] truncate">{p.Project_title || '—'}</td>
              <td className="px-3 py-2 text-xs text-gray-600">{p.Animator || '—'}</td>
              <td className="px-3 py-2"><StatusBadge status={p.Status} /></td>
            </tr>))}</tbody></table></>
    ),
    'Active Projects': (
      <><p className="text-xs text-gray-400 mb-3">Active, Review, or Changes Requested</p>
        <table className="w-full text-sm"><thead><tr className="border-b border-gray-100">{['Project ID', 'Title', 'Animator', 'Status'].map(h => <th key={h} className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">{h}</th>)}</tr></thead>
          <tbody>{activeProjectsList.length === 0 ? <tr><td colSpan={4} className="text-center py-6 text-gray-400">No active projects</td></tr> : activeProjectsList.map((p, i) => (
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-3 py-2 font-mono text-xs text-gray-500">{p.Project_ID}</td>
              <td className="px-3 py-2 text-xs font-medium text-gray-800 max-w-[130px] truncate">{p.Project_title || '—'}</td>
              <td className="px-3 py-2 text-xs text-gray-600">{p.Animator || '—'}</td>
              <td className="px-3 py-2"><StatusBadge status={p.Status} /></td>
            </tr>))}</tbody></table></>
    ),
    'Approved Today': (
      <><p className="text-xs text-gray-400 mb-3">Approved on {today}</p>
        <table className="w-full text-sm"><thead><tr className="border-b border-gray-100">{['Project ID', 'Title', 'Animator', 'Date Approved'].map(h => <th key={h} className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">{h}</th>)}</tr></thead>
          <tbody>{approvedTodayList.length === 0 ? <tr><td colSpan={4} className="text-center py-6 text-gray-400">No approvals today</td></tr> : approvedTodayList.map((p, i) => (
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-3 py-2 font-mono text-xs text-gray-500">{p.Project_ID}</td>
              <td className="px-3 py-2 text-xs font-medium text-gray-800 max-w-[130px] truncate">{p.Project_title || '—'}</td>
              <td className="px-3 py-2 text-xs text-gray-600">{p.Animator || '—'}</td>
              <td className="px-3 py-2 text-xs text-gray-500">{p['Date Approved'] || '—'}</td>
            </tr>))}</tbody></table></>
    ),
    'Working Animators': (
      <><p className="text-xs text-gray-400 mb-3">Animators with Current video &gt; 0</p>
        <table className="w-full text-sm"><thead><tr className="border-b border-gray-100">{['Name', 'Employee ID', 'Current Videos'].map(h => <th key={h} className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">{h}</th>)}</tr></thead>
          <tbody>{workingAnimatorsList.length === 0 ? <tr><td colSpan={3} className="text-center py-6 text-gray-400">No working animators</td></tr> : workingAnimatorsList.map((a, i) => (
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-3 py-2 text-xs font-medium text-gray-800">{a.Name}</td>
              <td className="px-3 py-2 font-mono text-xs text-gray-500">{a.Employee_ID}</td>
              <td className="px-3 py-2 font-bold text-amber-600">{a['Current video'] || 0}</td>
            </tr>))}</tbody></table></>
    ),
    'Pending Projects': (
      <><p className="text-xs text-gray-400 mb-3">Projects waiting to be assigned</p>
        <table className="w-full text-sm"><thead><tr className="border-b border-gray-100">{['Project ID', 'Title', 'Status'].map(h => <th key={h} className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">{h}</th>)}</tr></thead>
          <tbody>{pendingProjectsList.length === 0 ? <tr><td colSpan={3} className="text-center py-6 text-gray-400">No pending projects</td></tr> : pendingProjectsList.map((p, i) => (
            <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-3 py-2 font-mono text-xs text-gray-500">{p.Project_ID}</td>
              <td className="px-3 py-2 text-xs font-medium text-gray-800 max-w-[130px] truncate">{p.Project_title || '—'}</td>
              <td className="px-3 py-2"><StatusBadge status={p.Status} /></td>
            </tr>))}</tbody></table></>
    ),
  }


  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(s => (
          <button key={s.label} onClick={() => setActivePanel(activePanel === s.label ? null : s.label)}
            className="bg-white rounded-2xl p-5 shadow-sm border-2 text-left transition-all hover:shadow-md"
            style={{ borderColor: activePanel === s.label ? s.color : '#f1f5f9' }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3" style={{ background: s.bg }}>{s.icon}</div>
            <p className="text-3xl font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-sm text-gray-500 mt-1">{s.label}</p>
            <p className="text-xs mt-2" style={{ color: s.color }}>Click to view list →</p>
          </button>
        ))}
      </div>

      {/* Detail panel */}
      {activePanel && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">{activePanel}</h3>
            <button onClick={() => setActivePanel(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
          </div>
          <div className="overflow-x-auto">
            {panelData[activePanel]}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Project Activity (Last 14 Days)</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={days} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip /><Legend />
            <Bar dataKey="assigned" name="Assigned" fill="#667eea" radius={[4, 4, 0, 0]} />
            <Bar dataKey="approved" name="Approved" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Recent Projects</h3>
        {recent.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">No recent projects</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">
                {['Project ID', 'Title', 'Animator', 'Status', 'Date Assigned'].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {recent.map((p, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2 font-mono text-xs text-gray-500">{p.Project_ID}</td>
                    <td className="px-3 py-2 text-xs font-medium text-gray-800 max-w-[160px] truncate">{p.Project_title || '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{p.Animator || '—'}</td>
                    <td className="px-3 py-2"><StatusBadge status={p.Status} /></td>
                    <td className="px-3 py-2 text-xs text-gray-400">{p['Date Assigned'] || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}


// ─── Quick Assign Modal ───────────────────────────────────────────────────────

// ─── Group Assign Modal ───────────────────────────────────────────────────────
function GroupAssignModal({ projects, animators, onClose, onSuccess }: {
  projects: Project[]; animators: Animator[]; onClose: () => void; onSuccess: (msg: string) => void
}) {
  const [projSearch, setProjSearch] = useState('')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [animSearch, setAnimSearch] = useState('')
  const [selectedAnimators, setSelectedAnimators] = useState<Animator[]>([])
  const [leadName, setLeadName] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState('')

  const matchProj = (p: Project) => !projSearch ||
    p.Project_ID.toLowerCase().includes(projSearch.toLowerCase()) ||
    (p.Project_title || '').toLowerCase().includes(projSearch.toLowerCase())
  const displayedProjects = projSearch ? projects.filter(matchProj) : projects.slice(0, 80)
  const filteredAnims = animators.filter(a => !animSearch || a.Name.toLowerCase().includes(animSearch.toLowerCase()))

  const toggleAnimator = (a: Animator) => {
    setSelectedAnimators(prev =>
      prev.find(x => x.Employee_ID === a.Employee_ID)
        ? prev.filter(x => x.Employee_ID !== a.Employee_ID)
        : [...prev, a]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProject) { setError('Select a project first.'); return }
    if (selectedAnimators.length < 1) { setError('Select at least one animator.'); return }
    setAssigning(true); setError('')
    const duration = extractDuration(selectedProject.Project_ID) || selectedProject.Duration || null
    let ok = 0; let failMsg = ''

    // Remove any existing unassigned row for this project to avoid duplicates
    await apiClient.from('projects').delete().eq('Project_ID', selectedProject.Project_ID).eq('Employee_ID', null)

    for (const animator of selectedAnimators) {
      const { error: err } = await apiClient.from('projects').insert({
        Project_ID: selectedProject.Project_ID,
        Project_title: selectedProject.Project_title || null,
        Project_link: selectedProject.Project_link || null,
        Duration: duration,
        Animator: animator.Name,
        Employee_ID: animator.Employee_ID,
        Discord_ID: animator.Discord_ID || null,
        Discord_Username: animator.Discord_Username || null,
        Lead: leadName || selectedProject.Lead || null,
        Status: 'Pending',
        'Date Assigned': formatDate(),
        Thread_ID: null,
        WIP: false,
      })
      if (!err) {
        await apiClient.from('animators').update({ 'Current video': (animator['Current video'] || 0) + 1 }).eq('Employee_ID', animator.Employee_ID)
        ok++
      } else { failMsg = err.message }
    }
    if (ok > 0) {
      onSuccess(`Group workspace: ${ok} animator${ok > 1 ? 's' : ''} assigned to "${selectedProject.Project_title || selectedProject.Project_ID}"`)
      onClose()
    } else { setError(`Failed: ${failMsg}`); setAssigning(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-bold text-gray-800 text-lg">👥 Group Assign</h3>
            <p className="text-xs text-gray-400 mt-0.5">Pick one project + multiple animators → creates one row per animator</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex min-h-0">
          {/* LEFT — project picker */}
          <div className="w-1/2 border-r border-gray-100 flex flex-col overflow-hidden">
            <div className="px-3 py-2.5 border-b border-gray-100 flex-shrink-0">
              <input type="text" value={projSearch} onChange={e => setProjSearch(e.target.value)}
                placeholder="Search project ID or title…"
                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none text-gray-800" />
            </div>
            <p className="px-4 py-2 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-100 flex-shrink-0">
              Select Project ({displayedProjects.length} shown)
            </p>
            <div className="overflow-y-auto p-2 space-y-1 flex-1">
              {displayedProjects.length === 0
                ? <p className="text-xs text-gray-400 text-center py-6">No projects found</p>
                : displayedProjects.map(p => (
                  <button key={p.Project_ID + p.Animator} type="button" onClick={() => setSelectedProject(p)}
                    className="w-full text-left p-2.5 rounded-lg text-xs transition-all border"
                    style={{ borderColor: selectedProject?.Project_ID === p.Project_ID ? '#667eea' : 'transparent', backgroundColor: selectedProject?.Project_ID === p.Project_ID ? '#f0f0ff' : 'transparent' }}>
                    <p className="font-mono text-gray-400">{p.Project_ID}</p>
                    <p className="font-medium text-gray-800 truncate mt-0.5">{p.Project_title || '—'}</p>
                    {p.Animator && <p className="text-gray-400 mt-0.5">Currently: {p.Animator}</p>}
                  </button>
                ))}
            </div>
          </div>

          {/* RIGHT — animators multi-select + lead */}
          <div className="w-1/2 flex flex-col overflow-hidden">
            {selectedProject && (
              <div className="mx-4 mt-4 p-3 bg-indigo-50 rounded-xl text-xs border border-indigo-100 flex-shrink-0">
                <p className="font-semibold text-indigo-800 truncate">{selectedProject.Project_title || selectedProject.Project_ID}</p>
                <p className="font-mono text-indigo-400 mt-0.5">{selectedProject.Project_ID}</p>
              </div>
            )}
            <div className="px-4 pt-4 pb-2 flex-shrink-0">
              <p className="text-xs font-semibold text-gray-700 mb-1.5">
                Animators <span className="text-indigo-500 font-bold">{selectedAnimators.length > 0 ? `(${selectedAnimators.length} selected)` : '(select multiple)'}</span>
              </p>
              <input type="text" value={animSearch} onChange={e => setAnimSearch(e.target.value)}
                placeholder="Search animator…"
                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none text-gray-800 mb-2" />
              <div className="border border-gray-200 rounded-lg overflow-y-auto" style={{ maxHeight: '200px' }}>
                {filteredAnims.map(a => {
                  const checked = !!selectedAnimators.find(x => x.Employee_ID === a.Employee_ID)
                  const load = a['Current video'] || 0
                  const entries = parseNotes(a['Interview notes'])
                  const avg = avgRating(entries)
                  return (
                    <button key={a.Employee_ID} type="button" onClick={() => toggleAnimator(a)}
                      className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 border-b border-gray-50 last:border-0 transition-all"
                      style={{ backgroundColor: checked ? '#f0f0ff' : 'transparent' }}>
                      <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all`}
                        style={{ borderColor: checked ? '#667eea' : '#d1d5db', backgroundColor: checked ? '#667eea' : 'transparent' }}>
                        {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <span className="flex-1 text-sm font-medium text-gray-800 truncate">{a.Name}</span>
                      <span className="flex items-center gap-1.5 flex-shrink-0">
                        {avg !== null && (
                          <span className="text-xs font-bold px-1 py-0.5 rounded-full"
                            style={{ backgroundColor: avg >= 7 ? '#dcfce7' : avg >= 5 ? '#fef9c3' : '#fee2e2', color: avg >= 7 ? '#15803d' : avg >= 5 ? '#854d0e' : '#b91c1c' }}>
                            ⭐{avg}
                          </span>
                        )}
                        <span className="text-xs" style={{ color: load === 0 ? '#10b981' : load === 1 ? '#f59e0b' : '#ef4444' }}>{load}▪</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
            {selectedAnimators.length > 0 && (
              <div className="px-4 pb-1 flex gap-1 flex-wrap flex-shrink-0">
                {selectedAnimators.map(a => (
                  <span key={a.Employee_ID} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full flex items-center gap-1">
                    {a.Name}
                    <button type="button" onClick={() => toggleAnimator(a)} className="text-indigo-400 hover:text-indigo-700">✕</button>
                  </span>
                ))}
              </div>
            )}
            <div className="px-4 pb-4 mt-2 space-y-2 flex-shrink-0">
              <input type="text" value={leadName} onChange={e => setLeadName(e.target.value)}
                placeholder="Lead name…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none text-gray-800" />
              {error && <p className="text-xs text-red-500 bg-red-50 p-2 rounded-lg">{error}</p>}
              <button type="submit" disabled={assigning || !selectedProject || selectedAnimators.length === 0}
                className="w-full py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                {assigning ? 'Creating…' : `Create Group Workspace (${selectedAnimators.length} animator${selectedAnimators.length !== 1 ? 's' : ''})`}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

function QuickAssignModal({ projects, animators, onClose, onSuccess }: {
  projects: Project[]; animators: Animator[]; onClose: () => void; onSuccess: (msg: string) => void
}) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [projSearch, setProjSearch] = useState('')
  const [animSearch, setAnimSearch] = useState('')
  const [selectedAnimator, setSelectedAnimator] = useState<Animator | null>(null)
  const [leadName, setLeadName] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState('')

  const available = projects.filter(p => p.Status === 'Unassigned' || (p.Status === 'Pending' && !p.Employee_ID))
  const allAssigned = projects.filter(p => p.Employee_ID)
  const matchProj = (p: Project) => !projSearch ||
    p.Project_ID.toLowerCase().includes(projSearch.toLowerCase()) ||
    (p.Project_title || '').toLowerCase().includes(projSearch.toLowerCase())
  const filteredAvailable = available.filter(matchProj)
  // When searching: scan ALL assigned projects (no cap) so nothing is missed
  const filteredAssigned = projSearch
    ? allAssigned.filter(matchProj)
    : allAssigned.slice(0, 60)

  const filteredAnims = animators.filter(a => !animSearch || a.Name.toLowerCase().includes(animSearch.toLowerCase()))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProject || !selectedAnimator) { setError('Select a project and an animator.'); return }
    setAssigning(true); setError('')
    const duration = extractDuration(selectedProject.Project_ID)

    if (selectedProject.Employee_ID && selectedProject.Thread_ID) {
      try { await fetch(`/api/discord/thread?threadId=${selectedProject.Thread_ID}`, { method: 'DELETE' }) } catch { }
    }

    const { error: err } = await apiClient.from('projects').update({
      Employee_ID: selectedAnimator.Employee_ID,
      Animator: selectedAnimator.Name,
      Discord_ID: selectedAnimator.Discord_ID || null,
      Discord_Username: selectedAnimator.Discord_Username || null,
      Lead: leadName || selectedProject.Lead,
      Status: 'Pending',
      'Date Assigned': formatDate(),
      Duration: duration || selectedProject.Duration,
      Thread_ID: null
    }).eq('Project_ID', selectedProject.Project_ID)
    if (!err) {
      await apiClient.from('animators')
        .update({ 'Current video': (selectedAnimator['Current video'] || 0) + 1 })
        .eq('Employee_ID', selectedAnimator.Employee_ID)
      onSuccess(`Assigned "${selectedProject.Project_title || selectedProject.Project_ID}" to ${selectedAnimator.Name}`)
      onClose()
    } else {
      setError('Failed to assign. Please try again.')
      setAssigning(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-bold text-gray-800 text-lg">⚡ Quick Assign</h3>
            <p className="text-xs text-gray-400 mt-0.5">Select a project then pick an animator</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex min-h-0">
          {/* LEFT: project lists */}
          <div className="w-1/2 border-r border-gray-100 flex flex-col overflow-hidden">
            {/* Project search */}
            <div className="px-3 py-2.5 border-b border-gray-100 flex-shrink-0">
              <input type="text" value={projSearch} onChange={e => setProjSearch(e.target.value)}
                placeholder="Search project ID or title…"
                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none text-gray-800" />
            </div>
            {/* Available */}
            <div className="px-4 py-2 bg-green-50 border-b border-green-100 flex-shrink-0">
              <p className="text-xs font-semibold text-green-800">✅ Available ({filteredAvailable.length})</p>
            </div>
            <div className="overflow-y-auto p-2 space-y-1" style={{ maxHeight: '200px' }}>
              {filteredAvailable.length === 0
                ? <p className="text-xs text-gray-400 text-center py-4">No available projects</p>
                : filteredAvailable.map(p => (
                  <button key={p.Project_ID} onClick={() => setSelectedProject(p)}
                    className="w-full text-left p-2.5 rounded-lg text-xs transition-all border"
                    style={{ borderColor: selectedProject?.Project_ID === p.Project_ID ? '#667eea' : 'transparent', backgroundColor: selectedProject?.Project_ID === p.Project_ID ? '#f0f0ff' : 'transparent' }}>
                    <p className="font-mono text-gray-400">{p.Project_ID}</p>
                    <p className="font-medium text-gray-800 truncate mt-0.5">{p.Project_title || '—'}</p>
                  </button>
                ))}
            </div>
            {/* Already assigned */}
            <div className="px-4 py-2 bg-gray-50 border-b border-t border-gray-100 flex-shrink-0">
              <p className="text-xs font-semibold text-gray-600">📌 Already Assigned ({filteredAssigned.length})</p>
            </div>
            <div className="overflow-y-auto p-2 space-y-1" style={{ maxHeight: '170px' }}>
              {filteredAssigned.map(p => (
                <button key={p.Project_ID} onClick={() => setSelectedProject(p)}
                  className="w-full text-left p-2.5 rounded-lg text-xs transition-all border"
                  style={{ borderColor: selectedProject?.Project_ID === p.Project_ID ? '#667eea' : 'transparent', backgroundColor: selectedProject?.Project_ID === p.Project_ID ? '#f0f0ff' : 'transparent' }}>
                  <p className="font-mono text-gray-400">{p.Project_ID}</p>
                  <p className="text-gray-600 truncate mt-0.5">{p.Animator || '—'} · {p.Project_title || '—'}</p>
                </button>
              ))}
            </div>
          </div>

          {/* RIGHT: form */}
          <div className="w-1/2 p-5 flex flex-col gap-4 overflow-y-auto">
            {selectedProject && (
              <div className="p-3 bg-indigo-50 rounded-xl text-xs border border-indigo-100">
                <p className="font-semibold text-indigo-800 truncate">{selectedProject.Project_title || selectedProject.Project_ID}</p>
                <p className="font-mono text-indigo-500 mt-0.5">{selectedProject.Project_ID}</p>
                {extractDuration(selectedProject.Project_ID) && (
                  <p className="text-indigo-400 mt-0.5">⏱ {extractDuration(selectedProject.Project_ID)}</p>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 flex-1">
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Animator</label>
                <input type="text" placeholder="Search animator name..." value={animSearch}
                  onChange={e => setAnimSearch(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none text-gray-800 mb-1" />
                <div className="border border-gray-200 rounded-lg overflow-y-auto" style={{ maxHeight: '180px' }}>
                  {filteredAnims.map(a => {
                    const load = a['Current video'] || 0
                    const loadColor = load === 0 ? '#10b981' : load === 1 ? '#f59e0b' : '#ef4444'
                    const entries = parseNotes(a['Interview notes'])
                    const avg = avgRating(entries)
                    const textNotes = entries.map(n => n.note).join('\n')
                    return (
                      <button key={a.Employee_ID} type="button" onClick={() => setSelectedAnimator(a)}
                        title={textNotes}
                        className="w-full text-left px-3 py-2.5 flex items-center justify-between transition-all border-b border-gray-50 last:border-0"
                        style={{ backgroundColor: selectedAnimator?.Employee_ID === a.Employee_ID ? '#f0f0ff' : 'transparent' }}>
                        <div>
                          <span className="text-sm font-medium text-gray-800 block">{a.Name}</span>
                          <span className="text-xs text-gray-400 font-mono block">{a.Employee_ID}</span>
                        </div>
                        <span className="flex items-center gap-2 flex-shrink-0">
                          {avg !== null && (
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                              style={{ backgroundColor: avg >= 7 ? '#dcfce7' : avg >= 5 ? '#fef9c3' : '#fee2e2', color: avg >= 7 ? '#15803d' : avg >= 5 ? '#854d0e' : '#b91c1c' }}>
                              ⭐{avg}
                            </span>
                          )}
                          <span className="text-xs font-bold" style={{ color: loadColor }}>{load} active</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                {selectedAnimator && (() => {
                  const entries = parseNotes(selectedAnimator['Interview notes'])
                  const avg = avgRating(entries)
                  const load = selectedAnimator['Current video'] || 0
                  const loadColor = load === 0 ? '#10b981' : load === 1 ? '#f59e0b' : '#ef4444'
                  return (
                    <div className="mt-2 p-2.5 bg-indigo-50 rounded-xl border border-indigo-100 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-indigo-800">{selectedAnimator.Name}</p>
                        <p className="text-xs text-indigo-400 mt-0.5">{selectedAnimator.Role || 'Animator'}</p>
                      </div>
                      <div className="flex gap-3 flex-shrink-0">
                        <div className="text-center">
                          <p className="text-sm font-bold" style={{ color: loadColor }}>{load}</p>
                          <p className="text-xs text-gray-400">active</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-bold text-gray-600">{selectedAnimator['Total video'] || 0}</p>
                          <p className="text-xs text-gray-400">total</p>
                        </div>
                        {avg !== null && (
                          <div className="text-center">
                            <p className="text-sm font-bold" style={{ color: avg >= 7 ? '#10b981' : avg >= 5 ? '#f59e0b' : '#ef4444' }}>{avg}/10</p>
                            <p className="text-xs text-gray-400">rating</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })()}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1">Lead Name</label>
                <input type="text" value={leadName} onChange={e => setLeadName(e.target.value)}
                  placeholder="Enter lead name"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none text-gray-800" />
              </div>

              {error && <p className="text-xs text-red-500 bg-red-50 p-2 rounded-lg">{error}</p>}

              <button type="submit" disabled={assigning || !selectedProject || !selectedAnimator}
                className="w-full py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-50 mt-auto"
                style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                {assigning ? 'Assigning...' : 'Assign Project'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Assign Projects Tab ──────────────────────────────────────────────────────

function AssignTab({ projects, animators, onRefresh }: {
  projects: Project[]; animators: Animator[]; onRefresh: () => void
}) {
  const { toasts, addToast, dismiss } = useToast()
  const [showQuickAssign, setShowQuickAssign] = useState(false)
  const [showGroupAssign, setShowGroupAssign] = useState(false)

  // Per-animator assign modal state
  const [assignModal, setAssignModal] = useState<Animator | null>(null)
  const [projectSearch, setProjectSearch] = useState('')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [leadName, setLeadName] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [groupAssigning, setGroupAssigning] = useState(false)
  const [threadConflict, setThreadConflict] = useState<Project | null>(null)

  // Animators list search/sort
  const [animSearch, setAnimSearch] = useState('')
  const [sortBy, setSortBy] = useState<'mostActive' | 'leastActive' | 'nameAZ' | 'available'>('nameAZ')

  const unassignedProjects = projects.filter(p => p.Status === 'Unassigned' || (p.Status === 'Pending' && !p.Employee_ID))

  // When searching: scan ALL projects so nothing is missed; no search = show unassigned only
  const filteredUnassigned = projectSearch
    ? projects.filter(p =>
      p.Project_ID.toLowerCase().includes(projectSearch.toLowerCase()) ||
      (p.Project_title || '').toLowerCase().includes(projectSearch.toLowerCase())
    )
    : unassignedProjects

  const sortedAnimators = [...animators]
    .filter(a => !animSearch || a.Name.toLowerCase().includes(animSearch.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'mostActive') return (b['Current video'] || 0) - (a['Current video'] || 0)
      if (sortBy === 'leastActive') return (a['Current video'] || 0) - (b['Current video'] || 0)
      return a.Name.localeCompare(b.Name)
    })

  const handleOpenModal = (animator: Animator) => {
    setAssignModal(animator)
    setProjectSearch(''); setSelectedProject(null); setLeadName(''); setThreadConflict(null)
  }

  const doAssign = async (animator: Animator, project: Project, lead: string, clearThread: boolean) => {
    setAssigning(true)
    const duration = extractDuration(project.Project_ID)
    const updateData: Record<string, string | null> = {
      Employee_ID: animator.Employee_ID,
      Animator: animator.Name,
      Discord_ID: animator.Discord_ID || null,
      Discord_Username: animator.Discord_Username || null,
      Lead: lead || project.Lead,
      Status: 'Pending',
      'Date Assigned': formatDate(),
      Duration: duration || project.Duration,
    }
    if (clearThread) updateData.Thread_ID = null

    // Track old animator to decrement their count
    const oldAnimatorId = project.Employee_ID && project.Employee_ID !== animator.Employee_ID ? project.Employee_ID : null

    const { error } = await apiClient.from('projects').update(updateData).eq('Project_ID', project.Project_ID)
    if (!error) {
      // Increment new animator
      await apiClient.from('animators')
        .update({ 'Current video': (animator['Current video'] || 0) + 1 })
        .eq('Employee_ID', animator.Employee_ID)

      // Decrement old animator if changed
      if (oldAnimatorId) {
        const { data: oldAnim } = await apiClient.from('animators').select('*').eq('Employee_ID', oldAnimatorId).single()
        if (oldAnim) {
          await apiClient.from('animators')
            .update({ 'Current video': Math.max(0, (oldAnim['Current video'] || 1) - 1) })
            .eq('Employee_ID', oldAnimatorId)
        }
      }

      addToast(`Assigned "${project.Project_title || project.Project_ID}" to ${animator.Name}`)
      setAssignModal(null); setThreadConflict(null)
      onRefresh()
    } else {
      addToast('Failed to assign project.', 'error')
    }
    setAssigning(false)
  }

  const doGroupWorkspace = async (animator: Animator, project: Project, lead: string) => {
    setGroupAssigning(true)
    // Insert a new row with the SAME Project_ID — bot sees two rows with same ID,
    // deletes the old thread from private workspace, creates a group workspace for both.
    // Requires Project_ID to NOT be a primary key in Supabase (use a separate id column).
    const duration = extractDuration(project.Project_ID) || project.Duration || null
    const { error } = await apiClient.from('projects').insert({
      Project_ID: project.Project_ID,          // same as original
      Project_title: project.Project_title || null,  // same
      Project_link: project.Project_link || null,    // same
      Duration: duration,                            // same
      Animator: animator.Name,                       // new animator
      Employee_ID: animator.Employee_ID,             // new animator's ID
      Discord_ID: animator.Discord_ID || null,       // new animator's Discord
      Discord_Username: animator.Discord_Username || null,
      Lead: lead || project.Lead || null,
      Status: 'Pending',
      'Date Assigned': formatDate(),
      Thread_ID: null,   // bot picks this up to create group workspace thread
      WIP: false,
    })
    if (!error) {
      await apiClient.from('animators')
        .update({ 'Current video': (animator['Current video'] || 0) + 1 })
        .eq('Employee_ID', animator.Employee_ID)
      addToast(`Group workspace: Added ${animator.Name} to "${project.Project_title || project.Project_ID}"`)
      setAssignModal(null); setThreadConflict(null)
      onRefresh()
    } else {
      addToast(`Failed: ${error.message}`, 'error')
    }
    setGroupAssigning(false)
  }

  const handleSubmitAssign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!assignModal || !selectedProject) return
    if (selectedProject.Thread_ID) {
      setThreadConflict(selectedProject)
    } else {
      await doAssign(assignModal, selectedProject, leadName, false)
    }
  }

  return (
    <div className="space-y-6">
      <Toast toasts={toasts} onDismiss={dismiss} />

      {/* Quick Assign Modal */}
      {showQuickAssign && (
        <QuickAssignModal
          projects={projects}
          animators={animators}
          onClose={() => setShowQuickAssign(false)}
          onSuccess={(msg) => { addToast(msg); onRefresh() }}
        />
      )}

      {/* Group Assign Modal */}
      {showGroupAssign && (
        <GroupAssignModal
          projects={projects}
          animators={animators}
          onClose={() => setShowGroupAssign(false)}
          onSuccess={(msg) => { addToast(msg); onRefresh() }}
        />
      )}

      {/* Per-Animator Assign Modal */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="font-bold text-gray-800">Assign Project</h3>
                <p className="text-xs text-gray-400 mt-0.5">To: <span className="font-medium text-indigo-600">{assignModal.Name}</span></p>
              </div>
              <button onClick={() => setAssignModal(null)} className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Animator stats */}
            {(() => {
              const load = assignModal['Current video'] || 0
              const loadColor = load === 0 ? '#10b981' : load === 1 ? '#f59e0b' : '#ef4444'
              const entries = parseNotes(assignModal['Interview notes'])
              const avg = avgRating(entries)
              return (
                <div className="px-5 pt-4 pb-2 grid grid-cols-3 gap-3 flex-shrink-0">
                  {[
                    { label: 'Current', value: load, color: loadColor },
                    { label: 'Total', value: assignModal['Total video'] || 0, color: '#374151' },
                    { label: 'Rating', value: avg !== null ? `${avg}/10` : '—', color: avg !== null ? (avg >= 7 ? '#10b981' : avg >= 5 ? '#f59e0b' : '#ef4444') : '#cbd5e1' },
                  ].map(s => (
                    <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
                      <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              )
            })()}

            <div className="flex-1 overflow-y-auto">
              <form onSubmit={handleSubmitAssign} className="p-5 pt-2 space-y-4">
                {/* Project search */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Search & Select Project <span className="text-red-400">*</span></label>
                  <input type="text" value={projectSearch}
                    onChange={e => { setProjectSearch(e.target.value); setSelectedProject(null); setThreadConflict(null) }}
                    placeholder="Type project ID or title..."
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 text-gray-800" />
                  {!selectedProject && (
                    <div className="mt-1 border border-gray-200 rounded-lg overflow-y-auto" style={{ maxHeight: '200px' }}>
                      {filteredUnassigned.length === 0
                        ? <p className="p-3 text-xs text-gray-400 text-center">No pending projects available</p>
                        : filteredUnassigned.slice(0, 50).map(p => (
                          <button key={p.Project_ID} type="button"
                            onClick={() => { setSelectedProject(p); setProjectSearch(p.Project_ID); setThreadConflict(null) }}
                            className="w-full text-left px-3 py-2 hover:bg-indigo-50 transition-colors border-b border-gray-50 last:border-0">
                            <p className="font-mono text-xs text-gray-500">{p.Project_ID}</p>
                            <p className="text-xs font-medium text-gray-800 truncate">{p.Project_title || '—'}</p>
                          </button>
                        ))}
                    </div>
                  )}
                  {selectedProject && (
                    <div className="mt-2 p-2.5 bg-indigo-50 rounded-lg text-xs border border-indigo-100">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-indigo-500">{selectedProject.Project_ID}</p>
                        <button type="button" onClick={() => { setSelectedProject(null); setProjectSearch(''); setThreadConflict(null) }}
                          className="text-indigo-300 hover:text-indigo-600 text-xs">✕ clear</button>
                      </div>
                      <p className="font-medium text-indigo-800 mt-0.5">{selectedProject.Project_title || '—'}</p>
                      {extractDuration(selectedProject.Project_ID) && (
                        <p className="text-indigo-400 mt-0.5">⏱ Auto-duration: <strong>{extractDuration(selectedProject.Project_ID)}</strong></p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lead Name <span className="text-red-400">*</span></label>
                  <input type="text" value={leadName} onChange={e => setLeadName(e.target.value)} required
                    placeholder="Enter lead name"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 text-gray-800" />
                </div>

                {/* Thread conflict */}
                {threadConflict && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <p className="text-sm font-semibold text-amber-800">⚠️ This project has an active thread</p>
                    <p className="text-xs text-amber-600 font-mono mt-1 mb-3">Thread ID: {threadConflict.Thread_ID}</p>
                    <p className="text-xs font-semibold text-amber-800 mb-2">Choose action:</p>
                    <div className="flex flex-col gap-2">
                      <button type="button" onClick={() => doAssign(assignModal, threadConflict, leadName, true)} disabled={assigning}
                        className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                        style={{ backgroundColor: '#ef4444' }}>
                        {assigning ? '...' : '🔄 Reassign — delete old thread, assign only to this animator'}
                      </button>
                      <button type="button" onClick={() => doGroupWorkspace(assignModal, threadConflict, leadName)} disabled={groupAssigning}
                        className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                        style={{ backgroundColor: '#667eea' }}>
                        {groupAssigning ? '...' : '👥 Group Workspace — keep old animator + add this one'}
                      </button>
                      <button type="button" onClick={() => setThreadConflict(null)}
                        className="w-full px-3 py-2 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {!threadConflict && (
                  <button type="submit" disabled={assigning || !selectedProject}
                    className="w-full py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                    {assigning ? 'Assigning...' : 'Assign Project'}
                  </button>
                )}
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-800">All Animators</h3>
          <p className="text-sm text-gray-400 mt-0.5">{unassignedProjects.length} unassigned projects · {animators.length} animators</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowGroupAssign(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Group Assign
          </button>
          <button onClick={() => setShowQuickAssign(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm"
            style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Quick Assign
          </button>
        </div>
      </div>

      {/* Animators list */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" placeholder="Search animators..." value={animSearch} onChange={e => setAnimSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none text-gray-800" />
            </div>
            <div className="flex gap-2 flex-wrap">
              {([
                { key: 'nameAZ', label: 'Name A–Z' },
                { key: 'leastActive', label: 'Least Active' },
                { key: 'mostActive', label: 'Most Active' },
                { key: 'available', label: 'Available (0 active)' },
              ] as const).map(s => (
                <button key={s.key} onClick={() => setSortBy(s.key)}
                  className="px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
                  style={{ backgroundColor: sortBy === s.key ? '#667eea' : '#f1f5f9', color: sortBy === s.key ? 'white' : '#64748b' }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
          {sortedAnimators.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-6">No animators found</p>
          ) : sortedAnimators.map(a => {
            const load = a['Current video'] || 0
            const loadColor = load === 0 ? '#10b981' : load === 1 ? '#f59e0b' : '#ef4444'
            const entries = parseNotes(a['Interview notes'])
            const avg = avgRating(entries)
            return (
              <div key={a.Employee_ID} className="p-4 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                    {(a.Name || '?')[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{a.Name}</p>
                    <p className="text-xs text-gray-400">{a.Role || 'Animator'} · {a.Employee_ID}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="text-center">
                    <p className="text-sm font-bold" style={{ color: loadColor }}>{load}</p>
                    <p className="text-xs text-gray-400">active</p>
                  </div>
                  {avg !== null && (
                    <div className="text-center">
                      <p className="text-sm font-bold" style={{ color: avg >= 7 ? '#10b981' : avg >= 5 ? '#f59e0b' : '#ef4444' }}>{avg}</p>
                      <p className="text-xs text-gray-400">rating</p>
                    </div>
                  )}
                  <button onClick={() => handleOpenModal(a)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all"
                    style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                    Assign
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}




// ─── Projects Tab ──────────────────────────────────────────────────────────────

function ProjectsTab({ projects, onRefresh, user }: { projects: Project[]; onRefresh: () => void; user: DashboardUser }) {
  const { toasts, addToast, dismiss } = useToast()
  const isHead = user.role === 'head'
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [animatorFilter, setAnimatorFilter] = useState('')
  const [leadFilter, setLeadFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'priority'>('newest')
  const [approving, setApproving] = useState<string | null>(null)

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [newStatus, setNewStatus] = useState<string>('')
  const [newPriority, setNewPriority] = useState<string>('Low')
  const [newComment, setNewComment] = useState<string>('')
  const [newAssignedHead, setNewAssignedHead] = useState<string>('')
  const [newProgress, setNewProgress] = useState<string>('')
  const [newEmpType, setNewEmpType] = useState<string>('')
  const [newWarning, setNewWarning] = useState<string>('')
  const [newAcknowledgement, setNewAcknowledgement] = useState<string>('')
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [leadsList, setLeadsList] = useState<string[]>(['Divya', 'Ayush', 'Khushi'])

  useEffect(() => {
    // Hardcoded per user request, bypassing `leads` table fetch
  }, [])

  const PRIORITY_RANK: Record<string, number> = {
    'Urgent': 5,
    'Concern': 4,
    'High': 3,
    'Medium': 2,
    'Low': 1
  }

  const filtered = projects.filter(p => {
    const matchSearch = !search ||
      (p.Project_title || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.Project_ID || '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'All'
      ? true
      : statusFilter === 'Ongoing'
        ? !['Approved', 'Pending', 'Paid', 'Closed'].includes(p.Status)
        : p.Status === statusFilter
    const matchAnimator = !animatorFilter || (p.Animator || '').toLowerCase().includes(animatorFilter.toLowerCase())
    const matchLead = !leadFilter || (p.Lead || '').toLowerCase().includes(leadFilter.toLowerCase())
    let matchDate = true
    if (dateFrom || dateTo) {
      const d = parseDate(p['Date Assigned'])
      if (!p['Date Assigned'] || d.getTime() === 0) {
        matchDate = false // exclude items with no date when filter is active
      } else {
        if (dateFrom) {
          // Parse ISO date as local midnight to avoid UTC shift
          const [fy, fm, fd] = dateFrom.split('-').map(Number)
          const from = new Date(fy, fm - 1, fd, 0, 0, 0, 0)
          if (d < from) matchDate = false
        }
        if (dateTo) {
          const [ty, tm, td] = dateTo.split('-').map(Number)
          const to = new Date(ty, tm - 1, td, 23, 59, 59, 999)
          if (d > to) matchDate = false
        }
      }
    }
    return matchSearch && matchStatus && matchAnimator && matchLead && matchDate
  }).sort((a, b) => {
    if (sortOrder === 'priority') {
      const rankA = PRIORITY_RANK[a.Priority || 'Low'] || 0
      const rankB = PRIORITY_RANK[b.Priority || 'Low'] || 0
      if (rankA !== rankB) return rankB - rankA // Highest first
      // Fallback to newest date if priorities match
      return parseDate(b['Date Assigned']).getTime() - parseDate(a['Date Assigned']).getTime()
    }
    const diff = parseDate(b['Date Assigned']).getTime() - parseDate(a['Date Assigned']).getTime()
    return sortOrder === 'newest' ? diff : -diff
  })

  const handleApprove = async (project: Project) => {
    setApproving(project.Project_ID)
    // Use both Project_ID + Animator to be specific (handles duplicate Project_IDs for group workspaces)
    let query = apiClient.from('projects').update({
      Status: 'Approved',
      'Date Approved': formatDate(),
      Approved_Date: formatDate(),
    }).eq('Project_ID', project.Project_ID)
    if (project.Animator) query = query.eq('Animator', project.Animator)
    const { error } = await query
    if (!error) {
      if (project.Employee_ID) {
        const { data: anim } = await apiClient.from('animators').select('*').eq('Employee_ID', project.Employee_ID).single()
        if (anim) {
          await apiClient.from('animators')
            .update({ 'Current video': Math.max(0, (anim['Current video'] || 1) - 1), 'Total video': (anim['Total video'] || 0) + 1 })
            .eq('Employee_ID', project.Employee_ID)
        }
      }
      // Sync Approved_Date to payments table for this project
      await apiClient.from('payments')
        .update({ Approved_Date: formatDate() })
        .eq('Project ID', project.Project_ID)
      addToast(`✅ Approved: ${project.Project_title || project.Project_ID}`)
      onRefresh()
    } else {
      addToast(`❌ Approve failed: ${error.message}`, 'error')
    }
    setApproving(null)
  }

  const [loggingOutputProject, setLoggingOutputProject] = useState<Project | null>(null)

  function LogOutputModal({ project, onClose, onRefresh }: { project: Project, onClose: () => void, onRefresh: () => void }) {
    const [seconds, setSeconds] = useState('')
    const [saving, setSaving] = useState(false)
    const dateStr = formatDate() // Today's date
    const history = project.output_history || []

    // Default to the animator directly assigned in this row if possible
    const [selectedEmpId, setSelectedEmpId] = useState(project.Employee_ID || '')

    const handleLog = async (e: React.FormEvent) => {
      e.preventDefault()
      if (!selectedEmpId || !seconds || isNaN(Number(seconds))) return

      setSaving(true)
      const secNum = Number(seconds)
      const newEntry = { date: dateStr, empId: selectedEmpId, seconds: secNum }
      const newHistory = [...history, newEntry]

      const { error } = await apiClient
        .from('projects')
        .update({ output_history: newHistory })
        .eq('Project_ID', project.Project_ID)

      setSaving(false)
      if (error) {
        addToast(`❌ Failed to log output: ${error.message}`, 'error')
      } else {
        addToast(`✅ Logged ${secNum} sec for today.`)
        onRefresh()
        onClose()
      }
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-gray-800">Log Daily Output</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>
          <form onSubmit={handleLog} className="p-4 space-y-4">
            <div>
              <p className="text-xs text-gray-400 font-mono mb-2">{project.Project_ID}</p>
              <label className="block text-sm font-medium text-gray-700 mb-1">Animator</label>
              <input type="text" value={project.Animator || 'No Animator Assigned'} disabled
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Completed Today (Seconds)</label>
              <input type="number" min="1" value={seconds} onChange={e => setSeconds(e.target.value)} required autoFocus
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" />
            </div>
            <button type="submit" disabled={saving || !selectedEmpId}
              className="w-full py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
              {saving ? 'Saving...' : `Save for ${dateStr}`}
            </button>

            {history.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Recent Output</p>
                <div className="max-h-32 overflow-auto space-y-2">
                  {history.slice().reverse().map((h, i) => (
                    <div key={i} className="flex justify-between items-center text-xs">
                      <span className="text-gray-400">{h.date}</span>
                      <span className="font-bold text-gray-700">{h.seconds} sec</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
    )
  }

  const handleSaveStatus = async (project: Project) => {
    if (newStatus === project.Status && newPriority === (project.Priority || 'Low') && newComment === (project.Head_Comment || '') && newAssignedHead === (project.assigned_head || '') && newProgress === (project.progress || '') && newEmpType === (project.emp_type || '') && newWarning === (project.warning || '') && newAcknowledgement === (project.acknowledgement || '')) {
      setEditingProjectId(null)
      return
    }
    setIsUpdating(true)
    let payload: any = { Status: newStatus }
    if (!isHead) {
      payload['assigned_head'] = newAssignedHead
    }
    payload['Priority'] = newPriority
    payload['Head_Comment'] = newComment
    payload['progress'] = newProgress
    payload['emp_type'] = newEmpType
    payload['warning'] = newWarning
    payload['acknowledgement'] = newAcknowledgement

    if (newStatus === 'Review' && project.Status !== 'Review') {
      payload['viewport_date'] = formatDate()
    }
    if (newStatus === 'Approved') {
      payload['Date Approved'] = formatDate()
      payload['Approved_Date'] = formatDate()
      payload['approval_notified'] = true  // mark immediately — bot loop will skip, we notify directly below
    }
    const { error } = await apiClient.from('projects').update(payload).eq('Project_ID', project.Project_ID)
    if (!error) {
      if (newStatus === 'Approved' && project.Status !== 'Approved') {
        if (project.Employee_ID) {
          const { data: anim } = await apiClient.from('animators').select('*').eq('Employee_ID', project.Employee_ID).single()
          if (anim) {
            await apiClient.from('animators')
              .update({ 'Current video': Math.max(0, (anim['Current video'] || 1) - 1), 'Total video': (anim['Total video'] || 0) + 1 })
              .eq('Employee_ID', project.Employee_ID)
          }
          await apiClient.from('payments')
            .update({ Approved_Date: formatDate() })
            .eq('Project ID', project.Project_ID)
        }

        // Send Discord approval notification immediately
        try {
          if (project.Thread_ID) {
            const animTag = project.Discord_ID ? `<@${project.Discord_ID}>` : '@Animator'
            const titleLine = project.Project_title
              ? `**Project:** ${project.Project_title} (\`${project.Project_ID}\`)\n`
              : `**Project ID:** \`${project.Project_ID}\`\n`
            const msg = `━━━━━━━━━━━━━━━━━━━━━━━━\n✅ **PROJECT APPROVED!**\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n🎉 Congratulations ${animTag}!\n\n${titleLine}Your video has been reviewed and officially approved! 🙌\n\n💰 **Regarding Payment:**\nThere is no need to fill any payment form. Your payment will be automatically processed and released at the **end of the month**.\n\nWe will notify you here once the payment has been sent. Thank you for your excellent work! 🚀\n━━━━━━━━━━━━━━━━━━━━━━━━`
            await fetch('/api/discord/send-message', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ threadId: project.Thread_ID, message: msg }),
            })
          }
        } catch {
          // Notification failure doesn't block the status update
        }
      }
      addToast(`✅ Status updated to ${newStatus}`)
      onRefresh()
    } else {
      addToast(`❌ Update failed: ${error.message}`, 'error')
    }
    setIsUpdating(false)
    setEditingProjectId(null)
  }

  const handleDeleteProject = async (project: Project) => {
    setIsUpdating(true)

    const empId = project.Employee_ID
    const isActiveStatus = ['Pending', 'Active', 'Review', 'Changes Requested'].includes(project.Status)

    const { error } = await apiClient.from('projects').delete().eq('Project_ID', project.Project_ID)
    if (!error) {
      if (empId) {
        // Decrement counts for the animator
        const { data: oldAnim } = await apiClient.from('animators').select('*').eq('Employee_ID', empId).single()
        if (oldAnim) {
          const updates: any = {}
          if (oldAnim['Total video'] && oldAnim['Total video'] > 0) {
            updates['Total video'] = oldAnim['Total video'] - 1
          }
          if (isActiveStatus) {
            updates['Current video'] = Math.max(0, (oldAnim['Current video'] || 1) - 1)
          }
          if (Object.keys(updates).length > 0) {
            await apiClient.from('animators').update(updates).eq('Employee_ID', empId)
          }
        }
      }
      addToast(`✅ Deleted project ${project.Project_ID}`)
      onRefresh()
    } else {
      addToast(`❌ Delete failed: ${error.message}`, 'error')
    }
    setIsUpdating(false)
    setDeletingProjectId(null)
  }

  const handleRemoveAnimator = async (project: Project) => {
    if (!window.confirm(`Are you sure you want to remove ${project.Animator || 'the animator'} from this project?`)) return
    setIsUpdating(true)

    if (project.Thread_ID) {
      try { await fetch(`/api/discord/thread?threadId=${project.Thread_ID}`, { method: 'DELETE' }) } catch { }
    }

    const { error } = await apiClient.from('projects').update({
      Status: 'Pending',
      Employee_ID: null,
      Animator: null,
      Thread_ID: null,
      Discord_ID: null,
      Discord_Username: null
    }).eq('Project_ID', project.Project_ID)

    if (!error) {
      addToast(`✅ Removed animator from ${project.Project_ID}`)
      onRefresh()
    } else {
      addToast(`❌ Remove failed: ${error.message}`, 'error')
    }
    setIsUpdating(false)
  }

  const statuses = ['All', 'Ongoing', 'Pending', 'Active', 'Review', 'Changes Requested', 'Ready to Render', 'Render QA', 'Approved', 'Paid', 'Closed']

  return (
    <div className="space-y-4">
      <Toast toasts={toasts} onDismiss={dismiss} />
      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <input type="text" placeholder="Search by project title or ID..." value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none text-gray-800" />
          <input type="text" placeholder="Animator name..." value={animatorFilter} onChange={e => setAnimatorFilter(e.target.value)}
            className="w-full sm:w-40 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none text-gray-800" />
          <input type="text" placeholder="Lead name..." value={leadFilter} onChange={e => setLeadFilter(e.target.value)}
            className="w-full sm:w-40 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none text-gray-800" />
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span className="text-xs font-medium whitespace-nowrap">Date Assigned:</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none" />
            <span className="text-xs text-gray-400">to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none" />
          </div>
          <div className="flex gap-2 ml-auto">
            <button onClick={() => setSortOrder('priority')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ backgroundColor: sortOrder === 'priority' ? '#667eea' : '#f1f5f9', color: sortOrder === 'priority' ? 'white' : '#64748b' }}>
              High Priority
            </button>
            <button onClick={() => setSortOrder('newest')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ backgroundColor: sortOrder === 'newest' ? '#667eea' : '#f1f5f9', color: sortOrder === 'newest' ? 'white' : '#64748b' }}>
              Newest First
            </button>
            <button onClick={() => setSortOrder('oldest')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ backgroundColor: sortOrder === 'oldest' ? '#667eea' : '#f1f5f9', color: sortOrder === 'oldest' ? 'white' : '#64748b' }}>
              Oldest First
            </button>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {statuses.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ backgroundColor: statusFilter === s ? '#667eea' : '#f1f5f9', color: statusFilter === s ? 'white' : '#64748b' }}>
              {STATUS_LABELS[s] || s}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['ID', 'Title', 'Link', 'Animator', 'Log Output', 'Assigned Manager', 'Progress', 'Emp Type', 'Warning', 'Date Approved', 'Priority', 'Comment', 'Status', 'Date Assigned', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={15} className="text-center py-8 text-gray-400">No projects found</td></tr>
              ) : filtered.map((p, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.Project_ID}</td>
                  <td className="px-4 py-3"><p className="font-medium text-gray-800 max-w-xs truncate">{p.Project_title || '—'}</p></td>
                  <td className="px-4 py-3 text-xs">
                    {p.Project_link ? <a href={p.Project_link} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 hover:underline font-medium">Link</a> : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{p.Animator || '—'}</td>

                  {/* LOG OUTPUT COLUMN */}
                  <td className="px-4 py-3">
                    <button onClick={() => setLoggingOutputProject(p)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors whitespace-nowrap">
                      Log Output
                    </button>
                  </td>

                  <td className="px-4 py-3 text-xs">
                    {editingProjectId === p.Project_ID && !isHead ? (
                      <select
                        value={newAssignedHead}
                        onChange={e => setNewAssignedHead(e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none bg-white min-w-[100px]"
                      >
                        <option value="">None</option>
                        {leadsList.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    ) : (
                      <span className="text-gray-600">{p.assigned_head || '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingProjectId === p.Project_ID ? (
                      <input
                        type="text"
                        value={newProgress}
                        onChange={e => setNewProgress(e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none bg-white min-w-[100px] w-full"
                        placeholder="Progress..."
                      />
                    ) : (
                      <p className="text-xs text-gray-500 max-w-[120px] truncate" title={p.progress || ''}>
                        {p.progress || '—'}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingProjectId === p.Project_ID ? (
                      <input
                        type="text"
                        value={newEmpType}
                        onChange={e => setNewEmpType(e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none bg-white min-w-[100px] w-full"
                        placeholder="Emp Type..."
                      />
                    ) : (
                      <p className="text-xs text-gray-500 max-w-[120px] truncate" title={p.emp_type || ''}>
                        {p.emp_type || '—'}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingProjectId === p.Project_ID ? (
                      <input
                        type="text"
                        value={newWarning}
                        onChange={e => setNewWarning(e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none bg-white min-w-[100px] w-full"
                        placeholder="Warning..."
                      />
                    ) : (
                      <p className="text-xs text-gray-500 max-w-[120px] truncate" title={p.warning || ''}>
                        {p.warning || '—'}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{p['Date Approved'] || '—'}</td>
                  <td className="px-4 py-3">
                    {editingProjectId === p.Project_ID ? (
                      <select
                        value={newPriority}
                        onChange={e => setNewPriority(e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none bg-white min-w-[80px]"
                      >
                        {['Low', 'Medium', 'High', 'Urgent', 'Concern'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                        style={{
                          backgroundColor: p.Priority === 'Urgent' ? '#fee2e2' : p.Priority === 'High' ? '#fed7aa' : p.Priority === 'Medium' ? '#fef08a' : p.Priority === 'Concern' ? '#e0e7ff' : '#f1f5f9',
                          color: p.Priority === 'Urgent' ? '#b91c1c' : p.Priority === 'High' ? '#c2410c' : p.Priority === 'Medium' ? '#a16207' : p.Priority === 'Concern' ? '#4338ca' : '#64748b'
                        }}>
                        {p.Priority || 'Low'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingProjectId === p.Project_ID ? (
                      <input
                        type="text"
                        value={newComment}
                        onChange={e => setNewComment(e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none bg-white min-w-[100px] w-full"
                        placeholder="Add comment..."
                      />
                    ) : (
                      <p className="text-xs text-gray-500 max-w-[120px] truncate" title={p.Head_Comment || ''}>
                        {p.Head_Comment || '—'}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingProjectId === p.Project_ID ? (
                      <select
                        value={newStatus}
                        onChange={e => setNewStatus(e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none bg-white min-w-[120px]"
                      >
                        {statuses.filter(s => s !== 'All' && s !== 'Ongoing').map(s => <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>)}
                      </select>
                    ) : (
                      <StatusBadge status={p.Status} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{p['Date Assigned'] || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 items-center flex-wrap">
                      {deletingProjectId === p.Project_ID ? (
                        <>
                          <button onClick={() => handleDeleteProject(p)} disabled={isUpdating} className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors">Confirm Delete</button>
                          <button onClick={() => setDeletingProjectId(null)} disabled={isUpdating} className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-xs font-medium transition-colors">Cancel</button>
                        </>
                      ) : editingProjectId === p.Project_ID ? (
                        <>
                          <button onClick={() => handleSaveStatus(p)} disabled={isUpdating} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors">Save</button>
                          <button onClick={() => setEditingProjectId(null)} disabled={isUpdating} className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-xs font-medium transition-colors">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => {
                            setEditingProjectId(p.Project_ID);
                            setNewStatus(p.Status);
                            setNewPriority(p.Priority || 'Low');
                            setNewComment(p.Head_Comment || '');
                            setNewAssignedHead(p.assigned_head || '');
                            setNewProgress(p.progress || '');
                            setNewEmpType(p.emp_type || '');
                            setNewWarning(p.warning || '');
                            setNewAcknowledgement(p.acknowledgement || '');
                            setDeletingProjectId(null)
                          }} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors">Edit</button>
                          {!isHead && (
                            <button onClick={() => { setDeletingProjectId(p.Project_ID); setEditingProjectId(null) }} className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-medium transition-colors">Delete</button>
                          )}
                          {!isHead && p.Animator && (
                            <button onClick={() => handleRemoveAnimator(p)} disabled={isUpdating} className="px-3 py-1 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-lg text-xs font-medium transition-colors">Remove Animator</button>
                          )}
                          {p.Status === 'Review' && !isHead && (
                            <button onClick={() => handleApprove(p)} disabled={approving === p.Project_ID}
                              className="px-3 py-1 rounded-lg text-xs font-medium text-white transition-colors hover:bg-emerald-600"
                              style={{ backgroundColor: '#10b981' }}>
                              {approving === p.Project_ID ? '...' : 'Approve'}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
          Showing {filtered.length} of {projects.length} projects
        </div>
      </div>

      {loggingOutputProject && (
        <LogOutputModal
          project={loggingOutputProject}
          onClose={() => setLoggingOutputProject(null)}
          onRefresh={onRefresh}
        />
      )}
    </div>
  )
}


// ─── Animator Detail Modal ────────────────────────────────────────────────────

function AnimatorModal({ animator, projects, user, onClose, onRefresh, onShowProjects }: {
  animator: Animator; projects: Project[]; user: DashboardUser; onClose: () => void; onRefresh: () => void; onShowProjects?: (title: string, projects: Project[]) => void
}) {
  const [deboarding, setDeboarding] = useState(false)
  const [confirmDeboard, setConfirmDeboard] = useState(false)
  const [noteEntries, setNoteEntries] = useState<NoteEntry[]>(() => parseNotes(animator['Interview notes']))
  const [newNote, setNewNote] = useState('')
  const [newRating, setNewRating] = useState(0)
  const [savingNote, setSavingNote] = useState(false)
  const [noteMsg, setNoteMsg] = useState('')
  const [activeSection, setActiveSection] = useState<'projects' | 'notes' | 'earnings'>('projects')
  const [unassigningId, setUnassigningId] = useState<string | null>(null)

  const [invoices, setInvoices] = useState<any[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(false)

  useEffect(() => {
    if (activeSection === 'earnings' && invoices.length === 0) {
      setLoadingInvoices(true)
      apiClient.from('invoices')
        .select('month_label, invoice_date, total_amount, tds_amount, bonus_amount, net_payable, status')
        .eq('employee_id', animator.Employee_ID)
        .order('id', { ascending: false })
        .then((res: any) => {
          setInvoices((res.data as any[]) || [])
          setLoadingInvoices(false)
        })
    }
  }, [activeSection, animator.Employee_ID, invoices.length])

  // Match by Employee_ID (solo) OR Animator name containing this animator (group workspace)
  const matchesAnim = (p: Project) =>
    p.Employee_ID === animator.Employee_ID ||
    (p.Animator || '').toLowerCase().split(',').map(s => s.trim()).includes(animator.Name.toLowerCase())
  const activeProjects = projects.filter(p => matchesAnim(p) && ['Pending', 'Active', 'Review'].includes(p.Status))
  const allProjects = projects.filter(p => matchesAnim(p))

  const joinedDate = allProjects
    .map(p => p['Date Assigned'] ? new Date(p['Date Assigned']).getTime() : Infinity)
    .filter(d => d !== Infinity)
    .sort((a, b) => a - b)[0]
  const joinedDateStr = joinedDate ? new Date(joinedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null

  const load = animator['Current video'] || 0
  const loadColor = load === 0 ? '#10b981' : load === 1 ? '#f59e0b' : '#ef4444'
  const avg = avgRating(noteEntries)
  const isHead = user.role === 'head'
  const ratingLabel = (r: number) => r >= 9 ? 'Exceptional' : r >= 7 ? 'Great' : r >= 5 ? 'Good' : r >= 3 ? 'Average' : 'Needs Work'

  const handleAddNote = async () => {
    if (!newNote.trim()) return
    if (isHead && newRating === 0) { setNoteMsg('Please select a rating.'); return }
    setSavingNote(true); setNoteMsg('')
    const entry: NoteEntry = {
      id: Date.now().toString(), date: formatDate(),
      author: user.full_name || user.email, role: user.role as 'manager' | 'head',
      note: newNote.trim(), ...(isHead && newRating > 0 ? { rating: newRating } : {}),
    }
    const updated = [...noteEntries, entry]
    const { error } = await apiClient.from('animators')
      .update({ 'Interview notes': serializeNotes(updated) }).eq('Employee_ID', animator.Employee_ID)
    if (!error) { setNoteEntries(updated); setNewNote(''); setNewRating(0); setNoteMsg('✅ Note saved!'); setTimeout(() => setNoteMsg(''), 2500) }
    else setNoteMsg('❌ Failed to save note.')
    setSavingNote(false)
  }

  const handleDeleteNote = async (id: string) => {
    const updated = noteEntries.filter(e => e.id !== id)
    await apiClient.from('animators').update({ 'Interview notes': serializeNotes(updated) }).eq('Employee_ID', animator.Employee_ID)
    setNoteEntries(updated)
  }

  const handleDeboard = async () => {
    setDeboarding(true)

    // Step 1: Delete Discord threads for active projects before clearing them
    const activeProjects = projects.filter(p => p.Employee_ID === animator.Employee_ID && ['Pending', 'Active', 'Review'].includes(p.Status))
    for (const project of activeProjects) {
      if (project.Thread_ID) {
        try { await fetch(`/api/discord/thread?threadId=${project.Thread_ID}`, { method: 'DELETE' }) } catch { }
      }
    }

    // Step 2: Unassign projects (and clear Thread_ID)
    await apiClient.from('projects').update({ Employee_ID: null, Animator: null, Discord_ID: null, Discord_Username: null, Status: 'Pending', Thread_ID: null })
      .eq('Employee_ID', animator.Employee_ID).in('Status', ['Pending', 'Active', 'Review'])

    // Step 3: Delete the animator entirely from the database
    await apiClient.from('animators').delete().eq('Employee_ID', animator.Employee_ID)

    setDeboarding(false); onRefresh(); onClose()
  }

  const handleUnassignProject = async (project: Project) => {
    setUnassigningId(project.Project_ID)

    if (project.Thread_ID) {
      try { await fetch(`/api/discord/thread?threadId=${project.Thread_ID}`, { method: 'DELETE' }) } catch { }
    }

    const { error } = await apiClient.from('projects').update({
      Employee_ID: null,
      Animator: null,
      Discord_ID: null,
      Discord_Username: null,
      Status: 'Pending',
      Thread_ID: null,
      'Date Assigned': null
    }).eq('Project_ID', project.Project_ID)

    if (!error) {
      // Decrement the animator's current video count
      const { data: currentAnim } = await apiClient.from('animators').select('*').eq('Employee_ID', animator.Employee_ID).single()
      if (currentAnim) {
        await apiClient.from('animators')
          .update({ 'Current video': Math.max(0, (currentAnim['Current video'] || 1) - 1) })
          .eq('Employee_ID', animator.Employee_ID)
      }
      onRefresh()
    }
    setUnassigningId(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-start justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
              {(animator.Name || '?')[0]}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-gray-800">{animator.Name}</h2>
                {avg !== null && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                    style={{ backgroundColor: avg >= 7 ? '#dcfce7' : avg >= 5 ? '#fef9c3' : '#fee2e2', color: avg >= 7 ? '#15803d' : avg >= 5 ? '#854d0e' : '#b91c1c' }}>
                    ⭐ {avg}/10
                  </span>
                )}
              </div>
              {animator.Discord_Username && <p className="text-xs mt-0.5" style={{ color: '#818cf8' }}>@{animator.Discord_Username}</p>}
              <div className="flex gap-4 mt-2">
                {animator.phone && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="font-medium text-gray-700">Phone:</span>
                    <span>{animator.phone}</span>
                    <CopyButton value={animator.phone} />
                  </div>
                )}
                {animator.email && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="font-medium text-gray-700">Email:</span>
                    <span>{animator.email}</span>
                    <CopyButton value={animator.email} />
                  </div>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Stats */}
        <div className="px-5 pt-4 pb-0 flex-shrink-0">
          <div className="grid grid-cols-4 gap-3">
            {[
              { id: 'curr', label: 'Current', value: load, color: loadColor },
              { id: 'tot', label: 'Total', value: animator['Total video'] || 0, color: '#374151' },
              { id: 'act', label: 'Active', value: activeProjects.length, color: '#667eea' },
              { id: 'rat', label: 'Rating', value: avg !== null ? avg : '—', color: avg !== null ? (avg >= 7 ? '#10b981' : avg >= 5 ? '#f59e0b' : '#ef4444') : '#cbd5e1' },
            ].map(s => {
              const content = (
                <>
                  <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
                </>
              )
              if ((s.id === 'curr' || s.id === 'tot') && onShowProjects) {
                return (
                  <button key={s.label} className="bg-gray-50 rounded-xl p-3 text-center transition-colors hover:bg-gray-100"
                    onClick={() => {
                      if (s.id === 'curr') onShowProjects(`${animator.Name} - Active Projects`, activeProjects)
                      else if (s.id === 'tot') onShowProjects(`${animator.Name} - Total Projects`, allProjects.filter(p => ['Approved', 'Paid', 'Closed'].includes(p.Status)))
                    }}>
                    {content}
                  </button>
                )
              }
              return (
                <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
                  {content}
                </div>
              )
            })}
          </div>
        </div>

        {/* Tabs */}
        <div className="px-5 pt-4 flex gap-1 flex-shrink-0 border-b border-gray-100">
          {([{ id: 'projects', label: `Projects (${allProjects.length})` }, { id: 'notes', label: `Notes & Ratings (${noteEntries.length})` }, { id: 'earnings', label: 'Earnings History' }] as const).map(t => (
            <button key={t.id} onClick={() => setActiveSection(t.id)}
              className="px-4 py-2 text-sm font-medium rounded-t-lg transition-all -mb-px border-b-2"
              style={{ borderBottomColor: activeSection === t.id ? '#667eea' : 'transparent', color: activeSection === t.id ? '#667eea' : '#94a3b8', backgroundColor: activeSection === t.id ? '#f8f7ff' : 'transparent' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeSection === 'projects' && (
            <>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Active Now</p>
                {activeProjects.length === 0
                  ? <div className="bg-gray-50 rounded-xl p-4 text-center text-sm text-gray-400">No active projects</div>
                  : <div className="space-y-2">{activeProjects.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50">
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-[10px] text-indigo-500 mb-0.5">{p.Project_ID}</p>
                        <p className="text-sm font-medium text-gray-800 truncate">{p.Project_title || p.Project_ID}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Assigned: {p['Date Assigned'] || '—'}{p.Duration ? ` · ${p.Duration}` : ''}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <StatusBadge status={p.Status} />
                        {isHead || (
                          <button
                            onClick={() => handleUnassignProject(p)}
                            disabled={unassigningId === p.Project_ID}
                            className="text-[10px] font-medium text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                          >
                            {unassigningId === p.Project_ID ? 'Removing...' : 'Unassign'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}</div>
                }
              </div>
              {allProjects.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">All Projects ({allProjects.length})</p>
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {allProjects.map((p, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100">
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-[10px] text-indigo-500 mb-0.5">{p.Project_ID}</p>
                          <p className="text-sm font-medium text-gray-800 truncate">{p.Project_title || p.Project_ID}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{p['Date Assigned'] || '—'}</p>
                        </div>
                        <StatusBadge status={p.Status} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {activeSection === 'notes' && (
            <>
              {avg !== null && (
                <div className="rounded-xl p-4 flex items-center justify-between"
                  style={{ background: avg >= 7 ? 'linear-gradient(135deg, #ecfdf5, #d1fae5)' : avg >= 5 ? 'linear-gradient(135deg, #fffbeb, #fef3c7)' : 'linear-gradient(135deg, #fef2f2, #fee2e2)' }}>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Average Efficiency Rating</p>
                    <p className="text-3xl font-bold mt-0.5" style={{ color: avg >= 7 ? '#15803d' : avg >= 5 ? '#92400e' : '#b91c1c' }}>{avg} <span className="text-base font-medium">/10</span></p>
                    <p className="text-xs mt-0.5" style={{ color: avg >= 7 ? '#166534' : avg >= 5 ? '#92400e' : '#b91c1c' }}>{ratingLabel(avg)} · {noteEntries.filter(e => e.rating != null).length} rating(s)</p>
                  </div>
                  <RatingStars value={avg} />
                </div>
              )}

              <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-100">
                <p className="text-sm font-semibold text-gray-700">{isHead ? '✍️ Add Note & Rating' : '✍️ Add Note'}</p>
                <textarea value={newNote} onChange={e => setNewNote(e.target.value)} rows={3}
                  placeholder={isHead ? 'Write your observations...' : 'Write a note...'}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none resize-none text-gray-800 bg-white" />
                {isHead && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1.5 font-medium">Efficiency Rating (1–10) <span className="text-red-400">*</span></p>
                    <InteractiveRatingPicker value={newRating} onChange={setNewRating} />
                    {newRating > 0 && <p className="text-xs mt-1" style={{ color: newRating >= 7 ? '#15803d' : newRating >= 5 ? '#92400e' : '#b91c1c' }}>{ratingLabel(newRating)}</p>}
                  </div>
                )}
                {noteMsg && <p className={`text-xs font-medium ${noteMsg.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>{noteMsg}</p>}
                <button onClick={handleAddNote} disabled={savingNote || !newNote.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                  {savingNote ? 'Saving...' : 'Save Note'}
                </button>
              </div>

              <div className="space-y-3">
                {noteEntries.length === 0
                  ? <div className="text-center py-6 text-gray-400 text-sm">No notes yet</div>
                  : [...noteEntries].reverse().map(entry => (
                    <div key={entry.id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={{ backgroundColor: entry.role === 'head' ? '#fdf4ff' : '#eff6ff', color: entry.role === 'head' ? '#7e22ce' : '#1d4ed8' }}>
                            {entry.role === 'head' ? '👑 Head' : '🧑‍💼 Manager'}
                          </span>
                          <span className="text-xs font-medium text-gray-700">{entry.author}</span>
                          {entry.date && <span className="text-xs text-gray-400">{entry.date}</span>}
                        </div>
                        {(isHead || entry.author === (user.full_name || user.email)) && entry.id !== 'legacy' && (
                          <button onClick={() => handleDeleteNote(entry.id)} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0" title="Delete">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{entry.note}</p>
                      {entry.rating != null && (
                        <div className="mt-2 pt-2 border-t border-gray-50 flex items-center gap-2">
                          <RatingStars value={entry.rating} />
                          <span className="text-xs text-gray-400">— {ratingLabel(entry.rating)}</span>
                        </div>
                      )}
                    </div>
                  ))
                }
              </div>
            </>
          )}

          {activeSection === 'earnings' && (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Month-wise Earnings</p>
              {loadingInvoices ? (
                <div className="flex justify-center py-10">
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : invoices.length === 0 ? (
                <div className="bg-gray-50 rounded-xl p-6 text-center text-sm text-gray-400 border border-gray-100">
                  No payout/invoice records found for {animator.Name}.
                </div>
              ) : (
                <div className="space-y-3">
                  {invoices.map((inv, idx) => (
                    <div key={idx} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm flex flex-col gap-2">
                      <div className="flex items-center justify-between border-b border-gray-50 pb-2">
                        <span className="font-bold text-gray-800 text-sm">
                          📅 {inv.month_label || 'Unknown Month'}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${inv.status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                          {inv.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-1">
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase font-semibold">Gross</p>
                          <p className="text-xs font-mono text-gray-700">₹{(inv.total_amount || 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase font-semibold">Bonus</p>
                          <p className="text-xs font-mono text-green-600" title={inv.bonus_note || 'No note'}>
                            ₹{(inv.bonus_amount || 0).toLocaleString()}
                            {inv.bonus_note && (
                              <span className="ml-1 text-[9px] bg-amber-100 text-amber-800 px-1 py-[2px] rounded uppercase tracking-wider block mt-1 overflow-hidden text-ellipsis whitespace-nowrap max-w-full">
                                {inv.bonus_note}
                              </span>
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase font-semibold">TDS (-)</p>
                          <p className="text-xs font-mono text-red-500">₹{(inv.tds_amount || 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase font-semibold">Net Earned</p>
                          <p className="text-sm font-bold text-indigo-600">₹{(inv.net_payable || 0).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — Deboard (manager only) */}
        {!isHead && (
          <div className="p-4 border-t border-gray-100 flex-shrink-0">
            {confirmDeboard ? (
              <div className="space-y-3">
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                  <p className="font-semibold">⚠️ Confirm Deboard</p>
                  <p className="mt-1 text-xs">Unassign all {activeProjects.length} active project(s) and reset video count to 0.</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={handleDeboard} disabled={deboarding}
                    className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-60">
                    {deboarding ? 'Processing...' : 'Yes, Deboard'}
                  </button>
                  <button onClick={() => setConfirmDeboard(false)} className="flex-1 py-2 rounded-xl text-sm font-medium text-gray-600 bg-gray-100">Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmDeboard(true)}
                className="w-full py-2.5 rounded-xl text-sm font-medium border-2 border-red-200 text-red-500 hover:bg-red-50">
                Deboard {animator.Name}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Add Animator Modal ───────────────────────────────────────────────────────

function AddAnimatorModal({ onClose, onRefresh }: { onClose: () => void; onRefresh: () => void }) {
  const [form, setForm] = useState({ Name: '', Employee_ID: '', Role: 'Animator', Discord_ID: '', Discord_Username: '', phoneNumber: '', emailAddress: '' })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setMsg('')
    const { error } = await apiClient.from('animators').insert({
      Employee_ID: form.Employee_ID, Name: form.Name, Role: form.Role,
      Discord_ID: form.Discord_ID || null, Discord_Username: form.Discord_Username || null,
      'Phone Number': form.phoneNumber || null, 'E-mail': form.emailAddress || null,
      'Current video': 0, 'Total video': 0, Channel_ID: null, 'Interview notes': '',
    })
    if (!error) { setMsg('✅ Animator added!'); setTimeout(() => { onRefresh(); onClose() }, 1000) }
    else setMsg('❌ ' + (error.message || 'Failed'))
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-800">Add New Animator</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {[
            { key: 'Name', label: 'Name', required: true },
            { key: 'Employee_ID', label: 'Employee ID', required: true },
            { key: 'Discord_ID', label: 'Discord ID', required: false },
            { key: 'Discord_Username', label: 'Discord Username', required: false },
            { key: 'phoneNumber', label: 'Phone Number', required: false },
            { key: 'emailAddress', label: 'E-mail', required: false },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}{f.required && <span className="text-red-400 ml-1">*</span>}</label>
              <input type="text" value={form[f.key as keyof typeof form]} required={f.required}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none text-gray-800" />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select value={form.Role} onChange={e => setForm(prev => ({ ...prev, Role: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none text-gray-800">
              <option>Animator</option>
              <option>Lead Animator</option>
              <option>Senior Animator</option>
            </select>
          </div>
          {msg && <p className={`text-sm ${msg.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>{msg}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
            {loading ? 'Adding...' : 'Add Animator'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Animators Tab ───────────────────────────────────────────────────────────

function ProjectListModal({ title, projects, onClose }: { title: string; projects: Project[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-5 border-b border-gray-100 flexitems-center justify-between flex-shrink-0">
          <h3 className="font-bold text-gray-800 text-lg">{title} ({projects.length})</h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {projects.length === 0 ? (
            <div className="text-center py-10 text-gray-500">No projects found.</div>
          ) : (
            <div className="grid gap-3">
              {projects.map(p => (
                <div key={p.Project_ID} className="bg-gray-50 border border-gray-100 p-4 rounded-xl flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-mono text-xs text-indigo-500">{p.Project_ID}</span>
                      <p className="font-semibold text-gray-800 text-sm">{p.Project_title || 'Untitled'}</p>
                    </div>
                    <StatusBadge status={p.Status} />
                  </div>
                  <div className="text-xs text-gray-500 flex gap-4">
                    {p.Animator && <span>Animator: {p.Animator}</span>}
                    {p.assigned_head && <span>Lead: {p.assigned_head}</span>}
                    {p['Date Assigned'] && <span>Assigned: {p['Date Assigned']}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function OutputHistoryModal({ animator, avgInfo, onClose }: { animator: Animator; avgInfo: { historicalApprovedSec: number, daysSinceJoined: number, totalSec: number, days: number, entries: { date: string, seconds: number, projectId: string, title: string }[] }; onClose: () => void }) {
  // State for the currently viewed month. Default to current month.
  const [viewDate, setViewDate] = useState(new Date())

  // Helper to change month
  const handlePrevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))
  const handleNextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))

  // Determine all days in the currently selected month
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const monthDays = Array.from({ length: daysInMonth }, (_, i) => {
    // Format as YYYY-MM-DD to match the logs
    const y = year
    const m = String(month + 1).padStart(2, '0')
    const d = String(i + 1).padStart(2, '0')
    return `${y}-${m}-${d}`
  })

  // Filter entries to only show ones from the selected month
  const selectedMonthStr = `${year}-${String(month + 1).padStart(2, '0')}`
  const monthEntries = avgInfo.entries.filter(e => e.date.startsWith(selectedMonthStr))
  const sortedMonthEntries = [...monthEntries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Map each date to the total seconds logged on that date (across ALL history for the heatmap to be accurate if we navigate)
  const dateMap: Record<string, number> = {}
  avgInfo.entries.forEach(e => {
    dateMap[e.date] = (dateMap[e.date] || 0) + e.seconds
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-bold text-gray-800 text-lg">Daily Output History</h3>
            <p className="text-sm font-medium text-gray-500">{animator.Name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-5 bg-orange-50 border-b border-orange-100 flex justify-around flex-shrink-0 text-center">
          <div>
            <p className="text-3xl font-bold text-orange-600">{avgInfo.historicalApprovedSec > 0 ? formatSec(Math.round(avgInfo.historicalApprovedSec / avgInfo.daysSinceJoined)) : '0s'}</p>
            <p className="text-[10px] text-orange-500 uppercase tracking-wider font-semibold mt-1">Average / Day</p>
          </div>
          <div className="group relative cursor-help">
            <p className="text-3xl font-bold text-gray-800">{formatSec(avgInfo.historicalApprovedSec)}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mt-1 border-b border-dashed border-gray-300 inline-block pb-0.5">Total Approved</p>

            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 p-2 bg-gray-800 text-white text-[10px] rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 pointer-events-none">
              "Total Approved" means the combined duration of all Approved, Paid, and Closed projects.
            </div>
          </div>
          <div className="group relative cursor-help">
            <p className="text-3xl font-bold text-gray-800">{avgInfo.daysSinceJoined}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mt-1 border-b border-dashed border-gray-300 inline-block pb-0.5">Days Since Joined</p>

            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 p-2 bg-gray-800 text-white text-[10px] rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 pointer-events-none">
              "Days Since Joined" means the number of days passed since their first assigned project date.
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-5">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Activity Heatmap</h4>
              <div className="flex items-center gap-3">
                <button onClick={handlePrevMonth} className="text-gray-400 hover:text-orange-600 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <span className="text-sm font-bold text-gray-700 w-24 text-center">
                  {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                </span>
                <button onClick={handleNextMonth} className="text-gray-400 hover:text-orange-600 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-[10px] text-center text-gray-400 font-semibold uppercase">{day}</div>
              ))}

              {/* Empty padding boxes for the first row to align to the correct day of the week */}
              {Array.from({ length: new Date(year, month, 1).getDay() }).map((_, i) => (
                <div key={`empty-${i}`} className="w-full aspect-square" />
              ))}

              {monthDays.map(dateStr => {
                const secs = dateMap[dateStr] || 0
                const isToday = dateStr === new Date().toISOString().split('T')[0]

                // Determine color intensity based on seconds
                let bgClass = "bg-gray-100"
                if (secs > 0 && secs <= 30) bgClass = "bg-orange-200"
                else if (secs > 30 && secs <= 90) bgClass = "bg-orange-300"
                else if (secs > 90 && secs <= 180) bgClass = "bg-orange-400"
                else if (secs > 180) bgClass = "bg-orange-500"

                return (
                  <div
                    key={dateStr}
                    className={`w-full aspect-square rounded-md ${bgClass} cursor-help transition-all hover:ring-2 hover:ring-orange-600 ring-offset-1 flex items-center justify-center relative group`}
                  >
                    {/* Day Number Overlay */}
                    <span className={`text-[10px] font-bold ${secs > 90 ? 'text-white' : 'text-gray-500'} opacity-30 group-hover:opacity-100 z-10 transition-opacity`}>
                      {parseInt(dateStr.split('-')[2])}
                    </span>
                    {/* Today Highlight Indicator */}
                    {isToday && <div className="absolute inset-0 border-2 border-indigo-500 rounded-md pointer-events-none"></div>}

                    {/* Desktop Tooltip */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max px-2 py-1 bg-gray-800 text-white text-[10px] rounded shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 pointer-events-none">
                      {dateStr}: {secs > 0 ? formatSec(secs) : 'No output'}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2 items-center justify-end mt-3 text-[10px] text-gray-400 font-medium">
              <span>Less</span>
              <div className="flex gap-1">
                <div className="w-3 h-3 rounded-sm bg-gray-50 border border-gray-100"></div>
                <div className="w-3 h-3 rounded-sm bg-orange-200"></div>
                <div className="w-3 h-3 rounded-sm bg-orange-300"></div>
                <div className="w-3 h-3 rounded-sm bg-orange-400"></div>
                <div className="w-3 h-3 rounded-sm bg-orange-500"></div>
              </div>
              <span>More</span>
            </div>
          </div>

          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 border-t border-gray-100 pt-4">
            Detailed Log: {viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </h4>

          {sortedMonthEntries.length === 0 ? (
            <div className="text-center py-6 text-gray-500 text-sm">
              No output logged in {viewDate.toLocaleString('default', { month: 'long' })}.
            </div>
          ) : (
            <div className="grid gap-3">
              {sortedMonthEntries.map((e, i) => (
                <div key={i} className="bg-white border border-gray-100 p-4 rounded-xl shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-lg flex flex-col items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold uppercase">{new Date(e.date).toLocaleString('default', { month: 'short' })}</span>
                      <span className="text-lg font-black leading-none">{new Date(e.date).getDate()}</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">{e.title || 'Untitled Project'}</p>
                      <p className="text-xs font-mono text-gray-400 mt-0.5">{e.projectId}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-3 py-1 bg-emerald-50 text-emerald-600 font-bold text-sm rounded-lg">
                      +{formatSec(e.seconds)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function GlobalAnimatorReportModal({ animators, projects, onClose }: { animators: Animator[]; projects: Project[]; onClose: () => void }) {
  const [reportType, setReportType] = useState<'monthly' | 'all-time'>('monthly')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  // Destructure selected year and month
  const [selYear, selMonth] = selectedMonth.split('-').map(Number)

  // Calculate stats for all animators
  const reportData = animators.map(a => {
    const aProjects = projects.filter(p => {
      // Must belong to animator
      const belongs = p.Employee_ID === a.Employee_ID || (p.Animator || '').toLowerCase().split(',').map(s => s.trim()).includes(a.Name.toLowerCase())
      if (!belongs) return false

      // Must be approved/completed
      if (!['Approved', 'Paid', 'Closed'].includes(p.Status)) return false

      // If 'all-time' is selected, include all approved projects regardless of whether a date is cleanly parsable
      if (reportType === 'all-time') return true;

      // Check date (only heavily enforced for monthly views)
      const dateStr = p['Date Approved'] || p.Approved_Date || p.paid_date || p.client_paid_date
      if (!dateStr) return false

      const d = parseDate(dateStr)
      if (d.getTime() === 0) return false

      return d.getFullYear() === selYear && (d.getMonth() + 1) === selMonth
    })

    const totalSecs = aProjects.reduce((sum, p) => {
      // 1. If output_history exists for this animator on this project, sum those seconds
      if (p.output_history && p.output_history.length > 0) {
        const myOutput = p.output_history.filter(h => h.empId === a.Employee_ID).reduce((acc, h) => acc + h.seconds, 0)
        if (myOutput > 0) return sum + myOutput
      }

      // 2. Fallback: If no history exists, use the old calculation
      const baseSec = parseDurationSec(p.Duration || extractDuration(p.Project_ID) || '0', p.Project_ID)
      const anims = (p.Animator || '').split(',').map(s => s.trim()).filter(Boolean)
      const isGroup = anims.length > 1
      if (isGroup) {
        return sum + Math.round(baseSec / anims.length)
      } else {
        return sum + baseSec
      }
    }, 0)

    return {
      animator: a,
      projectsCount: aProjects.length,
      totalSecs,
      projects: aProjects
    }
  }).filter(r => r.projectsCount > 0).sort((a, b) => b.totalSecs - a.totalSecs)

  const handleDownloadCSV = () => {
    const reportTitle = reportType === 'all-time' ? 'Global All-Time Report for Animators' : 'Global Monthly Report for Animators';
    const reportPeriod = reportType === 'all-time' ? 'All Time' : selectedMonth;

    const rows = [
      [reportTitle],
      ['Period:', reportPeriod],
      [],
      ['Animator Name', 'Employee ID', 'Total Projects', 'Total Minutes', 'Projects List (IDs)']
    ]
    reportData.forEach(r => {
      const pList = r.projects.map(p => p.Project_ID).join('; ')
      rows.push([
        `"${r.animator.Name}"`,
        `"${r.animator.Employee_ID}"`,
        r.projectsCount.toString(),
        formatSec(r.totalSecs),
        `"${pList}"`
      ])
    })

    rows.push([])
    rows.push(['--- Project Breakdown ---'])
    rows.push(['Project ID', 'Project Title', 'Project Link', 'Animator', 'Assigned Date', 'Approved Date', 'Duration (mins)'])
    reportData.forEach(r => {
      r.projects.forEach(p => {
        const mins = formatSec(parseDurationSec(p.Duration || extractDuration(p.Project_ID) || '0', p.Project_ID))
        rows.push([
          `"${p.Project_ID}"`,
          `"${p.Project_title || ''}"`,
          `"${p.Project_link || ''}"`,
          `"${r.animator.Name}"`,
          `"${p['Date Assigned'] || ''}"`,
          `"${p['Date Approved'] || p.Approved_Date || p.paid_date || p.client_paid_date || ''}"`,
          mins
        ])
      })
    })

    const csvStr = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Animator_${reportType === 'all-time' ? 'All_Time' : 'Monthly'}_Report_${reportType === 'monthly' ? selectedMonth : 'Total'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <h3 className="font-bold text-gray-800 text-lg">Global Report (Animators)</h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-5 border-b border-gray-50 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <select value={reportType} onChange={e => setReportType(e.target.value as 'monthly' | 'all-time')} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none bg-white font-semibold text-gray-700">
              <option value="monthly">Monthly</option>
              <option value="all-time">All Time</option>
            </select>
            {reportType === 'monthly' && (
              <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none" />
            )}
          </div>
          <button onClick={handleDownloadCSV} disabled={reportData.length === 0}
            className="flex flex-shrink-0 items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 hover:opacity-90 min-w-max"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Download CSV
          </button>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {reportData.length === 0 ? (
            <div className="text-center py-10 text-gray-500">No approved projects found {reportType === 'monthly' ? `in ${selectedMonth}` : 'ever'}.</div>
          ) : (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 p-5 rounded-2xl shadow-sm flex items-center justify-between mb-6">
                <div>
                  <h4 className="font-bold text-indigo-900 text-lg">Grand Total</h4>
                  <p className="text-xs text-indigo-600 font-medium">{reportType === 'monthly' ? new Date(selYear, selMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' }) : 'All Time'}</p>
                </div>
                <div className="flex gap-6 text-right">
                  <div>
                    <p className="text-2xl font-black text-indigo-600">{reportData.reduce((acc, r) => acc + r.projectsCount, 0)}</p>
                    <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider mt-0.5">Projects</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-emerald-600">{formatSec(reportData.reduce((acc, r) => acc + r.totalSecs, 0))}</p>
                    <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider mt-0.5">Duration</p>
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Summary by Animator</p>
              {reportData.map(r => (
                <div key={r.animator.Employee_ID} className="bg-white border border-gray-100 p-4 rounded-xl shadow-sm flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-sm flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                      {(r.animator.Name || '?')[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 text-sm truncate">{r.animator.Name}</p>
                      <p className="text-xs text-gray-500 font-mono mt-0.5">{r.animator.Employee_ID}</p>
                    </div>
                  </div>
                  <div className="flex gap-6 text-right flex-shrink-0">
                    <div>
                      <p className="text-xl font-bold text-indigo-600">{r.projectsCount}</p>
                      <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Projects</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-emerald-600">{formatSec(r.totalSecs)}</p>
                      <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Duration</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TeamTab({ animators, projects, user, onRefresh }: {
  animators: Animator[]; projects: Project[]; user: DashboardUser; onRefresh: () => void
}) {
  const [selectedAnimator, setSelectedAnimator] = useState<Animator | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)
  const [search, setSearch] = useState('')
  const [sortOrder, setSortOrder] = useState<'none' | 'az' | 'za' | 'leastActive' | 'mostActive' | 'available' | 'mostAvgDay' | 'leastAvgDay'>('none')
  const isHead = user.role === 'head'

  const [listModalProps, setListModalProps] = useState<{ title: string; sortedProjects: Project[] } | null>(null)
  const [outputHistoryProps, setOutputHistoryProps] = useState<{ animator: Animator; avgInfo: { historicalApprovedSec: number, daysSinceJoined: number, totalSec: number, days: number, entries: { date: string, seconds: number, projectId: string, title: string }[] } } | null>(null)

  const [earnedData, setEarnedData] = useState<Record<string, number>>({})

  useEffect(() => {
    let mounted = true
    apiClient.from('invoices').select('employee_id, net_payable').eq('status', 'Paid')
      .then((res: any) => {
        if (!mounted || !res.data) return
        const acc: Record<string, number> = {}
        res.data.forEach((inv: any) => acc[inv.employee_id] = (acc[inv.employee_id] || 0) + (inv.net_payable || 0))
        setEarnedData(acc)
      })
    return () => { mounted = false }
  }, [])

  const getAvgDay = useCallback((a: Animator) => {
    const joinedMs = projects
      .filter(p => (p.Employee_ID === a.Employee_ID || (p.Animator || '').toLowerCase().includes(a.Name.toLowerCase())) && p['Date Assigned'])
      .map(p => new Date(p['Date Assigned']).getTime())
      .sort((x, y) => x - y)[0]
    const daysSinceJoined = joinedMs ? Math.max(1, Math.floor((Date.now() - joinedMs) / (1000 * 60 * 60 * 24))) : 1
    const historicalApprovedSec = projects
      .filter(p => (p.Employee_ID === a.Employee_ID || (p.Animator || '').toLowerCase().includes(a.Name.toLowerCase())) && ['Approved', 'Paid', 'Closed'].includes(p.Status))
      .reduce((sum, p) => {
        if (p.output_history && p.output_history.length > 0) {
          const myOut = p.output_history.filter(h => h.empId === a.Employee_ID).reduce((acc, h) => acc + h.seconds, 0)
          if (myOut > 0) return sum + myOut
        }
        const baseSec = parseDurationSec(p.Duration || extractDuration(p.Project_ID) || '0', p.Project_ID)
        const anims = (p.Animator || '').split(',').map(s => s.trim()).filter(Boolean)
        if (anims.length > 1) return sum + Math.round(baseSec / anims.length)
        return sum + baseSec
      }, 0)
    return Math.round(historicalApprovedSec / daysSinceJoined)
  }, [projects])

  const filtered = animators
    .filter(a => {
      if (sortOrder === 'available' && (a['Current video'] || 0) > 0) return false
      return !search || a.Name.toLowerCase().includes(search.toLowerCase()) || a.Employee_ID.toLowerCase().includes(search.toLowerCase())
    })
    .sort((a, b) => {
      const aDep = (a.Role || '').toLowerCase().includes('depart')
      const bDep = (b.Role || '').toLowerCase().includes('depart')
      if (aDep && !bDep) return 1
      if (!aDep && bDep) return -1
      if (sortOrder === 'leastActive') return (a['Current video'] || 0) - (b['Current video'] || 0)
      if (sortOrder === 'mostActive') return (b['Current video'] || 0) - (a['Current video'] || 0)
      if (sortOrder === 'mostAvgDay') return getAvgDay(b) - getAvgDay(a)
      if (sortOrder === 'leastAvgDay') return getAvgDay(a) - getAvgDay(b)
      if (sortOrder === 'az') return a.Name.localeCompare(b.Name)
      if (sortOrder === 'za') return b.Name.localeCompare(a.Name)
      return 0
    })

  return (
    <div className="space-y-4">
      {outputHistoryProps && (
        <OutputHistoryModal
          animator={outputHistoryProps.animator}
          avgInfo={outputHistoryProps.avgInfo}
          onClose={() => setOutputHistoryProps(null)}
        />
      )}
      {listModalProps && (
        <ProjectListModal title={listModalProps.title} projects={listModalProps.sortedProjects} onClose={() => setListModalProps(null)} />
      )}
      {showReportModal && (
        <GlobalAnimatorReportModal animators={animators} projects={projects} onClose={() => setShowReportModal(false)} />
      )}
      {selectedAnimator && (
        <AnimatorModal animator={selectedAnimator} projects={projects} user={user}
          onClose={() => setSelectedAnimator(null)}
          onRefresh={() => { onRefresh(); setSelectedAnimator(null) }}
          onShowProjects={(title, propsProjects) => setListModalProps({ title, sortedProjects: propsProjects })} />
      )}
      {showAddModal && <AddAnimatorModal onClose={() => setShowAddModal(false)} onRefresh={onRefresh} />}

      {/* Search + Sort + Add */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="Search by name or ID..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none text-gray-800 shadow-sm" />
        </div>
        {/* Sort buttons */}
        <div className="flex gap-2 flex-wrap">
          {([{ key: 'none', label: 'Default' }, { key: 'mostAvgDay', label: 'Most Avg/Day' }, { key: 'leastAvgDay', label: 'Least Avg/Day' }, { key: 'az', label: 'A→Z' }, { key: 'za', label: 'Z→A' }, { key: 'leastActive', label: 'Least Active' }, { key: 'mostActive', label: 'Most Active' }, { key: 'available', label: 'Available (0 active)' }] as const).map(s => (
            <button key={s.key} onClick={() => setSortOrder(s.key as any)}
              className="px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
              style={{ backgroundColor: sortOrder === s.key ? '#667eea' : '#f1f5f9', color: sortOrder === s.key ? 'white' : '#64748b' }}>
              {s.label}
            </button>
          ))}
        </div>
        {!isHead && (
          <div className="flex gap-2">
            <button onClick={() => setShowReportModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border-2 border-indigo-100 text-indigo-600 hover:bg-indigo-50 flex-shrink-0 transition-colors">
              📊 Monthly Report
            </button>
            <button onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white flex-shrink-0 transition-colors hover:shadow-md"
              style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Animator
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">Showing {filtered.length} of {animators.length} animators</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.length === 0 ? (
          <p className="text-gray-400 col-span-3 text-center py-12">No animators found</p>
        ) : filtered.map(a => {
          const DONE = ['Approved', 'Paid', 'Closed']
          const isActive = (p: Project) => !DONE.includes(p.Status) && (p.Employee_ID === a.Employee_ID || (p.Animator || '').split(',').map(s => s.trim().toLowerCase()).includes(a.Name.toLowerCase()))
          const activeCount = projects.filter(isActive).length
          const load = a['Current video'] || 0
          const loadColor = load === 0 ? '#10b981' : load === 1 ? '#f59e0b' : '#ef4444'
          const entries = parseNotes(a['Interview notes'])
          const avg = avgRating(entries)

          // Check Date Joined
          const joinedMs = projects
            .filter(p => (p.Employee_ID === a.Employee_ID || (p.Animator || '').split(',').map(s => s.trim().toLowerCase()).includes(a.Name.toLowerCase())) && p['Date Assigned'])
            .map(p => new Date(p['Date Assigned']).getTime())
            .sort((x, y) => x - y)[0]

          const daysSinceJoined = joinedMs ? Math.max(1, Math.floor((Date.now() - joinedMs) / (1000 * 60 * 60 * 24))) : 1

          // Calculate Historical Approved Duration (for Total box & Average box)
          const historicalApprovedSec = projects
            .filter(p => (p.Employee_ID === a.Employee_ID || (p.Animator || '').split(',').map(s => s.trim().toLowerCase()).includes(a.Name.toLowerCase())) && ['Approved', 'Paid', 'Closed'].includes(p.Status))
            .reduce((sum, p) => {
              if (p.output_history && p.output_history.length > 0) {
                const myOut = p.output_history.filter(h => h.empId === a.Employee_ID).reduce((a, h) => a + h.seconds, 0)
                if (myOut > 0) return sum + myOut
              }
              const baseSec = parseDurationSec(p.Duration || extractDuration(p.Project_ID) || '0', p.Project_ID)
              const anims = (p.Animator || '').split(',').map(s => s.trim()).filter(Boolean)
              if (anims.length > 1) return sum + Math.round(baseSec / anims.length)
              return sum + baseSec
            }, 0)

          // Calculate Explicit Logged Output Data
          const animProjects = projects.filter(p => p.Employee_ID === a.Employee_ID || (p.Animator || '').split(',').map(s => s.trim().toLowerCase()).includes(a.Name.toLowerCase()))
          let totalSec = 0
          const activeDays = new Set<string>()
          const historyEntries: { date: string, seconds: number, projectId: string, title: string }[] = []

          animProjects.forEach(p => {
            if (p.output_history && p.output_history.length > 0) {
              p.output_history.forEach(h => {
                if (h.empId === a.Employee_ID) {
                  totalSec += h.seconds
                  activeDays.add(h.date)
                  historyEntries.push({
                    date: h.date,
                    seconds: h.seconds,
                    projectId: p.Project_ID,
                    title: p.Project_title || ''
                  })
                }
              })
            }
          })

          const avgInfo = {
            historicalApprovedSec,
            daysSinceJoined,
            totalSec,
            days: activeDays.size,
            entries: historyEntries
          }

          return (
            <div key={a.Employee_ID} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold text-white flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                    {(a.Name || '?')[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">{a.Name}</p>
                    <p className="text-[10px] text-gray-400 font-medium tracking-wide">{a.Employee_ID}</p>
                    {joinedMs ? (
                      <p className="text-[10px] text-gray-500 mt-0.5">Joined: {new Date(joinedMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs px-2 py-1 rounded-full bg-purple-50 text-purple-600 font-medium flex-shrink-0">{a.Role || 'Animator'}</span>
                  {(a['Phone Number'] || a.phone) && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[10px] text-gray-400">📱 {a['Phone Number'] || a.phone}</span>
                      <CopyButton value={a['Phone Number'] || a.phone || ''} />
                    </div>
                  )}
                  {(a['E-mail'] || a.email) && (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-400" title={a['E-mail'] || a.email}>✉️ {(a['E-mail'] || a.email || '').slice(0, 15)}{(a['E-mail'] || a.email || '').length > 15 ? '...' : ''}</span>
                      <CopyButton value={a['E-mail'] || a.email || ''} />
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
                <button
                  onClick={() => setListModalProps({ title: `${a.Name} - Active Projects`, sortedProjects: projects.filter(isActive) })}
                  className="bg-gray-50 rounded-xl p-2 text-center hover:bg-gray-100 transition-colors flex flex-col items-center justify-center">
                  <p className="text-xl font-bold" style={{ color: loadColor }}>{load}</p>
                  <p className="text-[9px] text-gray-500 mt-1 uppercase tracking-wider font-semibold">Active</p>
                  {(() => {
                    const durationSec = projects
                      .filter(p => isActive(p))
                      .reduce((sum, p) => {
                        if (p.output_history && p.output_history.length > 0) {
                          const myOut = p.output_history.filter(h => h.empId === a.Employee_ID).reduce((a, h) => a + h.seconds, 0)
                          if (myOut > 0) return sum + myOut
                        }
                        const baseSec = parseDurationSec(p.Duration || extractDuration(p.Project_ID) || '0', p.Project_ID)
                        const anims = (p.Animator || '').split(',').map(s => s.trim()).filter(Boolean)
                        if (anims.length > 1) return sum + Math.round(baseSec / anims.length)
                        return sum + baseSec
                      }, 0)
                    return <p className={`text-[10px] font-semibold mt-1 ${durationSec > 0 ? 'text-indigo-600' : 'text-gray-400'}`}>{durationSec > 0 ? formatSec(durationSec) : '0s'}</p>
                  })()}
                </button>
                <button
                  onClick={() => setListModalProps({ title: `${a.Name} - Total Projects`, sortedProjects: projects.filter(p => (p.Employee_ID === a.Employee_ID || (p.Animator || '').toLowerCase().includes(a.Name.toLowerCase())) && ['Approved', 'Paid', 'Closed'].includes(p.Status)) })}
                  className="bg-gray-50 rounded-xl p-2 text-center hover:bg-gray-100 transition-colors flex flex-col items-center justify-center">
                  <p className="text-xl font-bold text-gray-700">{a['Total video'] || 0}</p>
                  <p className="text-[9px] text-gray-500 mt-1 uppercase tracking-wider font-semibold">Total</p>
                  <p className={`text-[10px] font-semibold mt-1 ${historicalApprovedSec > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                    {historicalApprovedSec > 0 ? formatSec(historicalApprovedSec) : '0s'}
                  </p>
                </button>
                <button
                  onClick={() => setOutputHistoryProps({ animator: a, avgInfo })}
                  className="bg-orange-50 rounded-xl p-2 text-center flex flex-col items-center justify-center hover:bg-orange-100 transition-colors hover:shadow-inner">
                  {(() => {
                    const avg = Math.round(historicalApprovedSec / daysSinceJoined)
                    return (
                      <>
                        <p className="text-xl font-bold text-orange-600">{historicalApprovedSec > 0 ? formatSec(avg) : '0s'}</p>
                        <p className="text-[9px] text-orange-500 mt-1 uppercase tracking-wider font-semibold">Avg/Day</p>
                        <p className="text-[10px] font-semibold mt-1 text-orange-600">{daysSinceJoined} days</p>
                      </>
                    )
                  })()}
                </button>
                <button
                  onClick={() => setSelectedAnimator(a)}
                  className="bg-indigo-50 rounded-xl p-2 text-center flex flex-col items-center justify-center hover:bg-indigo-100 transition-colors hover:shadow-inner">
                  {(() => {
                    const totalEarnedNet = earnedData[a.Employee_ID] || 0
                    return (
                      <>
                        <p className="text-[13px] font-bold text-indigo-700">₹{totalEarnedNet.toLocaleString('en-IN')}</p>
                        <p className="text-[9px] text-indigo-500 mt-1 uppercase tracking-wider font-semibold">Earned</p>
                        <p className="text-[10px] font-semibold mt-1 text-indigo-600">Net Paid (w/ Bonus)</p>
                      </>
                    )
                  })()}
                </button>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-400 mb-4">
                <span>{activeCount} active project{activeCount !== 1 ? 's' : ''}</span>
                <div className="flex items-center gap-2">
                  {avg !== null
                    ? <span className="font-semibold" style={{ color: avg >= 7 ? '#10b981' : avg >= 5 ? '#f59e0b' : '#ef4444' }}>
                      ⭐ {avg}/10
                    </span>
                    : <span style={{ color: loadColor }}>{load === 0 ? 'Available' : 'Working'}</span>
                  }
                  {entries.length > 0 && (
                    <div className="text-gray-400 hover:text-indigo-500 transition-colors cursor-help flex items-center" title={entries.map(n => `${n.author || 'System'}: ${n.note}`).join('\n')}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                  )}
                </div>
              </div>

              <button onClick={() => setSelectedAnimator(a)}
                className="w-full py-2 rounded-xl text-sm font-semibold text-white transition-all mt-auto"
                style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                View Profile
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Create Project Tab ───────────────────────────────────────────────────────

/**
 * Project ID format: DDMPPP_dur_channel
 *   DD  = date (2 digits)
 *   M   = month (1 digit, e.g. 2 = Feb)
 *   PPP = project sequence number (1+ digits, e.g. 1 = first, 20 = twentieth)
 * Example: 2021_80_plip → date=20, month=Feb, seq=1
 *          20220_80_plip → date=20, month=Feb, seq=20
 *
 * Returns a numeric sort key: month * 10000 + day * 100 + seq
 */
function parseProjectSeq(projectId: string): number {
  const prefix = projectId.split('_')[0] || ''
  if (!/^\d+$/.test(prefix)) return 0
  
  const firstTwo = parseInt(prefix.slice(0, 2), 10);
  let day, month, seq;
  
  if (firstTwo > 31) {
    day = parseInt(prefix.slice(0, 1), 10);       // e.g. "4" from "441"
    month = parseInt(prefix.slice(1, 2), 10);     // e.g. "4" from "441"
    seq = parseInt(prefix.slice(2) || '0', 10);   // e.g. "1" from "441"
  } else {
    day = firstTwo;                               // e.g. "24" from "24322"
    month = parseInt(prefix.slice(2, 3) || '0', 10);
    seq = parseInt(prefix.slice(3) || '0', 10);
  }
  
  if (isNaN(day)) day = 0;
  if (isNaN(month)) month = 0;
  if (isNaN(seq)) seq = 0;

  return month * 100000 + day * 1000 + seq;
}

function CreateProjectTab({ onRefresh, projects = [] }: { onRefresh: () => void; projects: Project[] }) {
  const [form, setForm] = useState({ Project_ID: '', Project_title: '', Project_link: '', Lead: '', Duration: '' })
  const [loading, setLoading] = useState(false)
  const [successInfo, setSuccessInfo] = useState<{ title: string; id: string } | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [recentOpen, setRecentOpen] = useState(true)

  // Only Pending projects, sorted by true chronological mathematical sequence (latest = highest seq), top 3
  const recentPending = [...projects]
    .filter(p => p.Project_ID && p.Status === 'Pending')
    .sort((a, b) => parseProjectSeq(b.Project_ID) - parseProjectSeq(a.Project_ID))
    .slice(0, 3)

  const handleProjectIdChange = (val: string) => {
    const dur = extractDuration(val)
    setForm(prev => ({ ...prev, Project_ID: val, Duration: dur || prev.Duration }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setSuccessInfo(null); setErrorMsg('')
    const { error } = await apiClient.from('projects').insert({
      Project_ID: form.Project_ID,
      Project_title: form.Project_title,
      Project_link: form.Project_link,
      Lead: form.Lead,
      Status: 'Pending',
      Duration: form.Duration || null,
    })
    if (error) {
      setErrorMsg(error.message || 'Failed to create project')
    } else {
      setSuccessInfo({ title: form.Project_title, id: form.Project_ID })
      setForm({ Project_ID: '', Project_title: '', Project_link: '', Lead: '', Duration: '' })
      onRefresh()
      setTimeout(() => setSuccessInfo(null), 6000)
    }
    setLoading(false)
  }

  return (
    <div className="flex items-start justify-center">
      <div className="w-full max-w-lg">

        {/* Success banner */}
        {successInfo && (
          <div className="mb-5 rounded-2xl border border-green-200 bg-green-50 p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0 text-lg">✅</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-green-800">Project added successfully!</p>
              <p className="text-xs text-green-700 mt-0.5 truncate">
                <span className="font-medium">{successInfo.title}</span>
                <span className="mx-1 text-green-400">·</span>
                <span className="font-mono opacity-80">{successInfo.id}</span>
              </p>
              <p className="text-xs text-green-600 mt-1 opacity-70">Status set to <strong>Pending</strong> · Ready to be assigned</p>
            </div>
            <button onClick={() => setSuccessInfo(null)} className="text-green-400 hover:text-green-600 flex-shrink-0">✕</button>
          </div>
        )}

        {/* Error banner */}
        {errorMsg && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0 text-lg">❌</div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">Failed to create project</p>
              <p className="text-xs text-red-600 mt-0.5">{errorMsg}</p>
            </div>
            <button onClick={() => setErrorMsg('')} className="text-red-400 hover:text-red-600 flex-shrink-0">✕</button>
          </div>
        )}

        {/* Form card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-3"
              style={{ background: 'linear-gradient(135deg, #f0f0ff, #e8e8ff)' }}>🎬</div>
            <h3 className="text-xl font-semibold text-gray-800">Create New Project</h3>
            <p className="text-sm text-gray-400 mt-1">Project will be created with status <strong>Pending</strong></p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project ID <span className="text-red-400">*</span></label>
              <input type="text" value={form.Project_ID} onChange={e => handleProjectIdChange(e.target.value)} required
                placeholder="e.g. 2022_80_plip"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none text-gray-800" />
              {form.Duration && <p className="text-xs text-indigo-500 mt-1">Auto-detected duration: <strong>{form.Duration}</strong></p>}
            </div>
            {[
              { key: 'Project_title', label: 'Project Title', placeholder: 'Enter project title', required: true },
              { key: 'Project_link', label: 'Project Link', placeholder: 'https://', required: false },
              { key: 'Lead', label: 'Lead Name', placeholder: 'Enter lead name', required: true },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}{f.required && <span className="text-red-400 ml-1">*</span>}</label>
                <input type="text" value={form[f.key as keyof typeof form]} required={f.required} placeholder={f.placeholder}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none text-gray-800" />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
              <input type="text" value={form.Duration} onChange={e => setForm(prev => ({ ...prev, Duration: e.target.value }))}
                placeholder="e.g. 80 sec (auto-filled from Project ID)"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none text-gray-800" />
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-600 border border-blue-100">
              🎥 Project will be saved as <strong>Pending</strong>. Assign an animator later via the Assign Projects tab.
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-60 transition-all"
              style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </form>
        </div>

        {/* ── Collapsible Recent Pending Projects (below form) ── */}
        {recentPending.length > 0 && (
          <div className="mt-4 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Header / toggle */}
            <button onClick={() => setRecentOpen(o => !o)}
              className="w-full flex items-center gap-2 px-5 py-3.5 text-left hover:bg-gray-50 transition-colors">
              <span className="text-sm">🕐</span>
              <span className="text-sm font-semibold text-gray-700 flex-1">Recently Created — Pending</span>
              <span className="text-xs text-gray-400 mr-2">{recentPending.length} project{recentPending.length > 1 ? 's' : ''}</span>
              {/* Chevron arrow */}
              <svg className="w-4 h-4 text-gray-400 transition-transform flex-shrink-0"
                style={{ transform: recentOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Expandable content */}
            {recentOpen && (
              <div className="border-t border-gray-100 divide-y divide-gray-50">
                {recentPending.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-indigo-50 transition-colors">
                    <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                      {parseProjectSeq(p.Project_ID) % 100 || i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{p.Project_title || '—'}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{p.Project_ID}</p>
                    </div>
                    <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: '#ede9fe', color: '#6d28d9' }}>Pending</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Form Submissions Tab ─────────────────────────────────────────────────────

function FormSubmissionsTab({ animators, userRole, userLead }: { animators: Animator[]; userRole: string; userLead?: string }) {
  const [submissions, setSubmissions] = useState<FormSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [editStatus, setEditStatus] = useState('')
  const [editFeedback, setEditFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  const loadSubmissions = async () => {
    setLoading(true)
    const { data } = await apiClient.from('form_submissions').select('*').order('created_at', { ascending: false })
    let rows = (data as FormSubmission[]) || []
    // Head should see all forms just like Manager, so we don't filter by lead_name for Head here
    setSubmissions(rows)
    setLoading(false)
  }

  useEffect(() => { loadSubmissions() }, [userRole, userLead]) // eslint-disable-line react-hooks/exhaustive-deps

  const animatorMap = Object.fromEntries(animators.map(a => [a.Employee_ID, a.Name]))
  const statuses = ['All', 'Pending', 'Review', 'Approved', 'Changes Requested']
  const filtered = submissions.filter(s => {
    const matchStatus = statusFilter === 'All' || s.status === statusFilter
    const matchSearch = !search ||
      (s.project_id || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.title || '').toLowerCase().includes(search.toLowerCase()) ||
      (animatorMap[s.employee_id] || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.lead_name || '').toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  const startEdit = (s: FormSubmission) => {
    setEditingId(s.id); setEditStatus(s.status || 'Pending'); setEditFeedback(s.feedback || ''); setSaveMsg('')
  }

  const handleSave = async (id: number) => {
    setSaving(true); setSaveMsg('')
    const sub = submissions.find(s => s.id === id)
    const { error } = await apiClient.from('form_submissions').update({ status: editStatus, feedback: editFeedback, animator_notified: true }).eq('id', id)
    if (!error) {
      // If moving to Approved or Changes Requested, also update project + notify Discord thread
      if ((editStatus === 'Approved' || editStatus === 'Changes Requested') && sub?.project_id) {
        const todayStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

        const projectUpdate: Record<string, any> = { Status: editStatus }
        if (editStatus === 'Approved') {
          projectUpdate['Date Approved'] = todayStr
          projectUpdate['Approved_Date'] = todayStr
          projectUpdate['approval_notified'] = true  // prevent bot loop from double-notifying
        }
        await apiClient.from('projects').update(projectUpdate).eq('Project_ID', sub.project_id)

        // Send Discord notification to the animator's thread
        try {
          const { data: projData } = await apiClient.from('projects').select('Thread_ID, Discord_ID, Project_title').eq('Project_ID', sub.project_id).single()
          if (projData?.Thread_ID) {
            const animTag = projData.Discord_ID ? `<@${projData.Discord_ID}>` : '@Animator'
            const titleLine = projData.Project_title
              ? `**Project:** ${projData.Project_title} (\`${sub.project_id}\`)\n`
              : `**Project ID:** \`${sub.project_id}\`\n`
            const feedbackLine = editFeedback ? `**Notes:**\n> ${editFeedback}\n\n` : ''

            let msg = ''
            if (editStatus === 'Approved') {
              msg = `━━━━━━━━━━━━━━━━━━━━━━━━\n✅ **PROJECT APPROVED!**\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n🎉 Congratulations ${animTag}!\n\n${titleLine}${feedbackLine}Your video has been reviewed and officially approved! 🙌\n\n💰 **Regarding Payment:**\nThere is no need to fill any payment form. Your payment will be automatically processed and released at the **end of the month**.\n\nWe will notify you here once the payment has been sent. Thank you for your excellent work! 🚀\n━━━━━━━━━━━━━━━━━━━━━━━━`
            } else {
              msg = `━━━━━━━━━━━━━━━━━━━━━━━━\n📢 **REVISION REQUESTED**\n━━━━━━━━━━━━━━━━━━━━━━━━\n\nHey ${animTag}, your submission has been reviewed.\n\n${titleLine}${feedbackLine}📌 Please go through the feedback carefully, make the necessary changes, and resubmit your updated draft.\n\nIf you have any questions about the feedback, feel free to ask here.\n━━━━━━━━━━━━━━━━━━━━━━━━`
            }

            await fetch('/api/discord/send-message', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ threadId: projData.Thread_ID, message: msg }),
            })
          }
        } catch {
          // Notification failure doesn't block the save
        }
      }
      setSaveMsg('Saved!')
      setSubmissions(prev => prev.map(s => s.id === id ? { ...s, status: editStatus, feedback: editFeedback } : s))
      setTimeout(() => { setEditingId(null); setSaveMsg('') }, 800)
    } else setSaveMsg('Failed')
    setSaving(false)
  }

  const handleDelete = async (id: number) => {
    setSaving(true)
    const { error } = await apiClient.from('form_submissions').delete().eq('id', id)
    if (!error) {
      setSubmissions(prev => prev.filter(s => s.id !== id))
      setDeletingId(null)
      setEditingId(null)
    } else {
      setSaveMsg(`Delete failed: ${error.message}`)
    }
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3">
        <input type="text" placeholder="Search submissions..." value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none text-gray-800" />
        <div className="flex gap-2 flex-wrap">
          {statuses.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ backgroundColor: statusFilter === s ? '#667eea' : '#f1f5f9', color: statusFilter === s ? 'white' : '#64748b' }}>{s}</button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400">
            <svg className="animate-spin h-6 w-6 mx-auto mb-2" style={{ color: '#667eea' }} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading submissions...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['#', 'Project / Title', 'Animator', 'Lead', 'Ver', 'Video', 'Comments', 'Status', 'Date', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-8 text-gray-400">No submissions found</td></tr>
                ) : filtered.flatMap((s, i) => {
                  const dateStr = s.created_at ? new Date(s.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
                  const isEditing = editingId === s.id
                  const rows = [
                    <tr key={`row-${i}`} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{s.id}</td>
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs text-gray-600">{s.project_id}</p>
                        {s.title && <p className="text-xs text-gray-500 truncate max-w-[100px]">{s.title}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{animatorMap[s.employee_id] || s.employee_id || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{s.lead_name || '—'}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-xs font-medium">{s.version || '—'}</span></td>
                      <td className="px-4 py-3">
                        {s.video_link ? (
                          <a href={s.video_link} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 font-medium">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                            View
                          </a>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-[120px]">
                        <p className="truncate" title={s.comments || ''}>{s.comments || '—'}</p>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={s.status || 'Pending'} /></td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{dateStr}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => isEditing ? setEditingId(null) : startEdit(s)}
                          className="px-3 py-1 rounded-lg text-xs font-medium"
                          style={{ backgroundColor: isEditing ? '#f1f5f9' : '#ede9fe', color: isEditing ? '#64748b' : '#6d28d9' }}>
                          {isEditing ? 'Cancel' : 'Edit'}
                        </button>
                      </td>
                    </tr>
                  ]
                  if (isEditing) rows.push(
                    <tr key={`edit-${i}`} className="bg-purple-50 border-b border-purple-100">
                      <td colSpan={10} className="px-4 py-3">
                        <div className="flex flex-col sm:flex-row gap-3 items-start">
                          <div className="flex-shrink-0">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                            <select value={editStatus} onChange={e => setEditStatus(e.target.value)}
                              className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 bg-white focus:outline-none">
                              {['Pending', 'Review', 'Approved', 'Changes Requested'].map(st => <option key={st}>{st}</option>)}
                            </select>
                          </div>
                          <div className="flex-1 min-w-0">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Feedback (optional)</label>
                            <textarea value={editFeedback} onChange={e => setEditFeedback(e.target.value)} rows={2}
                              placeholder="Add feedback for animator..."
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 bg-white focus:outline-none resize-none" />
                          </div>
                          <div className="flex items-end gap-2 flex-shrink-0">
                            {deletingId === s.id ? (
                              <>
                                <button onClick={() => handleDelete(s.id)} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60">Confirm Delete</button>
                                <button onClick={() => setDeletingId(null)} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 disabled:opacity-60">Cancel</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => handleSave(s.id)} disabled={saving}
                                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                                  style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                                  {saving ? '...' : 'Save'}
                                </button>
                                <button onClick={() => setDeletingId(s.id)} disabled={saving}
                                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-60">
                                  Delete
                                </button>
                              </>
                            )}
                            {saveMsg && <span className="text-xs font-medium" style={{ color: saveMsg === 'Saved!' ? '#10b981' : '#ef4444' }}>{saveMsg}</span>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                  return rows
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
          Showing {filtered.length} of {submissions.length} submissions
        </div>
      </div>
    </div>
  )
}

// ─── Payments Tab ─────────────────────────────────────────────────────────────

function PaymentsTab({ animators, projects }: { animators: Animator[]; projects: Project[] }) {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [bulkUpdating, setBulkUpdating] = useState(false)

  // Generate last 13 months as filter options
  const monthOptions = (() => {
    const opts: string[] = []
    const now = new Date()
    for (let i = 0; i < 13; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      opts.push(d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }))
    }
    return opts
  })()
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0])

  const loadPayments = async () => {
    setLoading(true)
    const { data } = await apiClient.from('payments').select('*')
    const sorted = ((data as Payment[]) || []).sort((a, b) => {
      const ta = a.Timestamp ? new Date(a.Timestamp).getTime() : 0
      const tb = b.Timestamp ? new Date(b.Timestamp).getTime() : 0
      return tb - ta
    })
    setPayments(sorted)
    setLoading(false)
  }

  useEffect(() => { loadPayments() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const animatorMap = Object.fromEntries(animators.map(a => [a.Employee_ID, a.Name]))
  const projectMap = Object.fromEntries(projects.map(p => [p.Project_ID, p.Project_title]))

  const handleStatusChange = async (id: number, newStatus: string) => {
    setUpdatingId(id)
    await apiClient.from('payments').update({ Payment_Status: newStatus }).eq('id', id)
    setPayments(prev => prev.map(p => p.id === id ? { ...p, Payment_Status: newStatus } : p))
    setUpdatingId(null)
  }

  const handleBulkMarkPaid = async () => {
    if (selected.size === 0) return
    setBulkUpdating(true)
    const ids = Array.from(selected)
    await apiClient.from('payments').update({ Payment_Status: 'Paid' }).in('id', ids)
    setPayments(prev => prev.map(p => selected.has(p.id) ? { ...p, Payment_Status: 'Paid' } : p))
    setSelected(new Set())
    setBulkUpdating(false)
  }

  const toggleSelect = (id: number) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const handleExportCSV = () => {
    if (filtered.length === 0) return
    const headers = [
      'Project ID', 'Project Title', 'Employee ID', 'Full Name',
      'Contract Type', 'UPI ID', 'Account Number', 'IFSC Code',
      'Account Holder', 'Bank Branch', 'PAN Number',
      'Payment Status', 'Paid Date', 'Timestamp'
    ]
    const rows = filtered.map(p => [
      p['Project ID'] || '',
      projectMap[p['Project ID']] || '',
      p['Employee ID'] || '',
      p['Full Name'] || '',
      p['Contract Type'] || '',
      p['UPI ID'] || '',
      p['Account Number'] || '',
      p['IFSC CODE'] || '',
      p['Account Holder Name'] || '',
      p['Bank Branch'] || '',
      p['PAN Number'] || '',
      p.Payment_Status || 'Pending',
      p.paid_date || '',
      p.Timestamp ? new Date(p.Timestamp).toLocaleString() : ''
    ])

    // Escape quotes and commas
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('url')
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payments_${selectedMonth ? selectedMonth.replace(' ', '_') : 'all'}_${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const statuses = ['All', 'Pending', 'Paid', 'Closed']

  // Helper: check if a "DD MMM YYYY" date string is within a "MMM YYYY" month
  const inMonth = (dateStr: string, month: string) =>
    !!dateStr && !!month && dateStr.includes(month)

  const filtered = payments.filter(p => {
    const matchStatus = statusFilter === 'All' || p.Payment_Status === statusFilter
    const matchSearch = !search ||
      (p['Project ID'] || '').toLowerCase().includes(search.toLowerCase()) ||
      (p['Employee ID'] || '').toLowerCase().includes(search.toLowerCase()) ||
      (animatorMap[p['Employee ID']] || '').toLowerCase().includes(search.toLowerCase()) ||
      (p['Full Name'] || '').toLowerCase().includes(search.toLowerCase())

    // Filter by selected month using 'paid_date' (fallback to Timestamp if not Paid but we still want to see Activity?)
    // Requirements specifically say "based on paid_date". 
    // Wait, if it's pending it might not have paid_date. If selectedMonth is set, only show cases where paid_date matches, OR date assigned/created?
    // Let's filter specifically on `paid_date`. If not set, fallback to `Timestamp`.
    const dateSource = p.paid_date || p.Timestamp
    const dateToMatch = dateSource ? new Date(dateSource).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
    const matchMonth = selectedMonth ? inMonth(dateToMatch, selectedMonth) : true

    return matchStatus && matchSearch && matchMonth
  })

  const payStatusColors: Record<string, { bg: string; text: string }> = {
    Paid: { bg: '#dcfce7', text: '#15803d' },
    Pending: { bg: '#fef9c3', text: '#854d0e' },
    Closed: { bg: '#f1f5f9', text: '#64748b' },
  }

  return (
    <div className="space-y-4">
      {/* Filters + bulk actions */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col sm:flex-row gap-3 items-center flex-wrap">
        <input type="text" placeholder="Search payments..." value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none text-gray-800" />

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500">Month:</span>
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none bg-white">
            <option value="">All Time</option>
            {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <button onClick={handleExportCSV} disabled={filtered.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 transition-colors disabled:opacity-50">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          Export CSV
        </button>

        <div className="flex gap-2 flex-wrap">
          {statuses.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)} className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ backgroundColor: statusFilter === s ? '#667eea' : '#f1f5f9', color: statusFilter === s ? 'white' : '#64748b' }}>{s}</button>
          ))}
        </div>

        {selected.size > 0 && (
          <button onClick={handleBulkMarkPaid} disabled={bulkUpdating}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-white whitespace-nowrap disabled:opacity-60 flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
            {bulkUpdating ? 'Updating...' : `✅ Mark ${selected.size} as Paid`}
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {(['Pending', 'Paid', 'Closed'] as const).map(s => {
          const c = payStatusColors[s]
          const count = filtered.filter(p => p.Payment_Status === s).length
          return (
            <div key={s} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
              <p className="text-2xl font-bold" style={{ color: c.text }}>{count}</p>
              <p className="text-xs mt-1" style={{ color: c.text }}>{s}</p>
            </div>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-gray-400">
            <svg className="animate-spin h-6 w-6 mx-auto mb-2" style={{ color: '#667eea' }} fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading payments...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['', 'ID', 'Project', 'Animator', 'Contract', 'UPI / Account', 'PAN', 'Status', 'Discord', 'Date', 'Update'].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-8 text-gray-400">No payments found</td></tr>
                ) : filtered.map((pay, i) => {
                  const animName = animatorMap[pay['Employee ID']] || pay['Employee ID'] || '—'
                  const projTitle = projectMap[pay['Project ID']] || pay['Project ID'] || '—'
                  const dateStr = pay.Timestamp ? new Date(pay.Timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
                  const sc = payStatusColors[pay.Payment_Status] || { bg: '#f1f5f9', text: '#64748b' }

                  return (
                    <tr key={i} className={`border-b border-gray-50 transition-colors ${selected.has(pay.id) ? 'bg-purple-50' : 'hover:bg-gray-50'}`}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(pay.id)} onChange={() => toggleSelect(pay.id)}
                          className="w-4 h-4 rounded accent-indigo-600 cursor-pointer" />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{pay.id}</td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold text-gray-800 truncate max-w-[110px]" title={projTitle}>{projTitle}</p>
                        <p className="text-xs text-gray-400 font-mono">{pay['Project ID']}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-medium text-gray-700">{animName}</p>
                        <p className="text-xs text-gray-400">{pay['Full Name'] || pay['Employee ID']}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">{pay['Contract Type'] || '—'}</td>
                      <td className="px-4 py-3">
                        {pay['UPI ID'] && (
                          <div className="flex items-center text-xs text-gray-600 mb-0.5">
                            <span className="truncate max-w-[100px]">{pay['UPI ID']}</span>
                            <CopyButton value={pay['UPI ID']} />
                          </div>
                        )}
                        {pay['Account Number'] && (
                          <div className="flex items-center text-xs text-gray-400">
                            <span className="font-mono">{'•'.repeat(4)}{pay['Account Number'].slice(-4)}</span>
                            <CopyButton value={pay['Account Number']} />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {pay['PAN Number'] && (
                          <div className="flex items-center text-xs text-gray-600">
                            <span className="font-mono">{pay['PAN Number'].slice(0, 3)}•••{pay['PAN Number'].slice(-2)}</span>
                            <CopyButton value={pay['PAN Number']} />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: sc.bg, color: sc.text }}>
                          {pay.Payment_Status || 'Pending'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{pay.Discord_Notified || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{dateStr}</td>
                      <td className="px-4 py-3">
                        <select
                          value={pay.Payment_Status || 'Pending'}
                          onChange={e => handleStatusChange(pay.id, e.target.value)}
                          disabled={updatingId === pay.id}
                          className="px-2 py-1 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none bg-white disabled:opacity-50">
                          <option>Pending</option>
                          <option>Paid</option>
                          <option>Closed</option>
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
          Showing {filtered.length} of {payments.length} payments
        </div>
      </div>
    </div>
  )
}

// ─── Analytics Tab ────────────────────────────────────────────────────────────

function AnalyticsTab({ projects, animators }: { projects: Project[]; animators: Animator[] }) {
  // Generate last 13 months as filter options
  const monthOptions = (() => {
    const opts: string[] = []
    const now = new Date()
    for (let i = 0; i < 13; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      opts.push(d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }))
    }
    return opts
  })()
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0])

  const [listModalProps, setListModalProps] = useState<{ title: string; sortedProjects: Project[] } | null>(null)

  // Helper: check if a "DD MMM YYYY" date string is within a "MMM YYYY" month
  const inMonth = (dateStr: string, month: string) =>
    !!dateStr && !!month && dateStr.includes(month)

  // Deduplicate by Project_ID (first occurrence wins) for all stats
  const dedupMap = new Map<string, Project>()
  projects.forEach(p => { if (!dedupMap.has(p.Project_ID)) dedupMap.set(p.Project_ID, p) })
  const dedupedAll: Project[] = Array.from(dedupMap.values())

  // Filtered sets based on selected month
  const filteredByAssigned = selectedMonth
    ? dedupedAll.filter(p => inMonth(p['Date Assigned'], selectedMonth))
    : dedupedAll
  const filteredByApproved = selectedMonth
    ? dedupedAll.filter(p => inMonth(p['Date Approved'], selectedMonth))
    : dedupedAll

  // Stat counts (deduped + filtered)
  const totalProjects = filteredByAssigned.length
  const inProgress = filteredByAssigned.filter(p => ['Active', 'Review', 'Changes Requested'].includes(p.Status)).length
  const approved = filteredByApproved.filter(p => ['Approved', 'Paid', 'Closed'].includes(p.Status)).length
  // This Month Approved (reached Viewport/Revision/Ready/QA & Approved in selectedMonth, or same month if all time)
  const thisMonthViewportAndApproved = selectedMonth
    ? dedupedAll.filter(p => {
        if (!['Approved', 'Paid', 'Closed'].includes(p.Status)) return false;
        if (!inMonth(p['Date Approved'], selectedMonth)) return false;
        
        // It must have hit at least viewport or later during this month
        const hitStage = inMonth(p.render_qa_date || '', selectedMonth) || 
                         inMonth(p.ready_to_render_date || '', selectedMonth) ||
                         inMonth(p.animation_revision_date || '', selectedMonth) ||
                         inMonth(p.viewport_date || '', selectedMonth);
        return hitStage;
      })
    : dedupedAll.filter(p => {
        if (!['Approved', 'Paid', 'Closed'].includes(p.Status)) return false;
        if (!p['Date Approved']) return false;
        
        const stageDate = p.render_qa_date || p.ready_to_render_date || p.animation_revision_date || p.viewport_date;
        if (!stageDate) return false;

        const vParts = stageDate.trim().split(' ');
        const aParts = p['Date Approved'].trim().split(' ');
        if (vParts.length >= 3 && aParts.length >= 3) {
          return vParts[1] === aParts[1] && vParts[2] === aParts[2];
        }
        return false;
      })
  const thisMonthApprovedCount = thisMonthViewportAndApproved.length

  // Duration stats (filtered approved, parsed as minutes)
  const durationThisMonthMins = filteredByApproved
    .filter(p => ['Approved', 'Paid', 'Closed'].includes(p.Status))
    .reduce((s, p) => s + parseDurationSec(p.Duration, p.Project_ID), 0)

  // Lifetime stats (all deduped, unfiltered)
  const lifetimeTotal = dedupedAll.length
  const lifetimeApproved = dedupedAll.filter(p => ['Approved', 'Paid', 'Closed'].includes(p.Status)).length
  const lifetimeDurationMins = dedupedAll
    .filter(p => ['Approved', 'Paid', 'Closed'].includes(p.Status))
    .reduce((s, p) => s + parseDurationSec(p.Duration, p.Project_ID), 0)

  // Daily Work Trend — deduplicated per day, filtered to selected month or last 30 days
  const trend: { label: string; assigned: number; approved: number; projected?: number; projectedMins?: number }[] = []
  let runRate = 0
  let runRateMins = 0
  let projectedTotal = 0
  let projectedMinsTotal = 0
  let next7Total = 0
  let next7MinsTotal = 0

  if (selectedMonth) {
    const MONTHS: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }
    const [mon, yr] = selectedMonth.split(' ')
    const monthIdx = MONTHS[mon]
    const year = parseInt(yr, 10)
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate()

    // Calculate run rate based on stages for remaining days
    const now = new Date()
    const isCurrentMonth = now.getFullYear() === year && now.getMonth() === monthIdx
    let daysPassed = daysInMonth
    if (isCurrentMonth) {
      daysPassed = now.getDate()
    } else if (year > now.getFullYear() || (year === now.getFullYear() && monthIdx > now.getMonth())) {
      daysPassed = 0
    }
    const remainingDays = daysInMonth - daysPassed

    // Stage-based velocity weights (higher means closer to approval)
    const weights = { 'Changes Requested': 0.8, 'Review': 0.6, 'Active': 0.4, 'Pending': 0.2 }
    let pipelineValue = 0
    let pipelineMins = 0
    filteredByAssigned.forEach(p => {
      if (weights[p.Status as keyof typeof weights]) {
        const w = weights[p.Status as keyof typeof weights]
        pipelineValue += w
        pipelineMins += parseDurationSec(p.Duration, p.Project_ID) * w
      }
    })

    // Base rate from already approved
    runRate = daysPassed > 0 ? (approved / daysPassed) : 0
    runRateMins = daysPassed > 0 ? (durationThisMonthMins / daysPassed) : 0

    // Adjusted rate for the future includes pipeline clearing
    const futureRate = remainingDays > 0 ? runRate + (pipelineValue / remainingDays) : runRate
    const futureRateMins = remainingDays > 0 ? runRateMins + (pipelineMins / remainingDays) : runRateMins

    projectedTotal = Math.round(futureRate * remainingDays)
    projectedMinsTotal = Math.round(futureRateMins * remainingDays)

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, monthIdx, day)
      const full = formatDate(d)
      const label = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
      const assignedIds = new Set(projects.filter(p => p['Date Assigned'] === full).map(p => p.Project_ID))
      const approvedIds = new Set(projects.filter(p => p['Date Approved'] === full).map(p => p.Project_ID))

      let projVideos = undefined
      let projMins = undefined

      if (isCurrentMonth && day > daysPassed) {
        // Future prediction per day
        projVideos = parseFloat(futureRate.toFixed(1))
        projMins = parseFloat(futureRateMins.toFixed(1))
      } else if (!isCurrentMonth || day <= daysPassed) {
        // Past run rate context
        projVideos = parseFloat(runRate.toFixed(1))
        projMins = parseFloat(runRateMins.toFixed(1))
      }

      trend.push({
        label,
        assigned: assignedIds.size,
        approved: approvedIds.size,
        projected: projVideos,
        projectedMins: projMins
      })
    }
  } else {
    // Last 30 days logic (simplified future projection not typically used here, but keeping structure)
    let last30Approved = 0
    let last30Mins = 0
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const full = formatDate(d)
      const label = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
      const assignedIds = new Set(projects.filter(p => p['Date Assigned'] === full).map(p => p.Project_ID))
      const approvedIds = new Set(projects.filter(p => p['Date Approved'] === full).map(p => p.Project_ID))
      last30Approved += approvedIds.size

      const dayMins = dedupedAll.filter(p => p['Date Approved'] === full && ['Approved', 'Paid', 'Closed'].includes(p.Status)).reduce((s, p) => s + parseDurationSec(p.Duration, p.Project_ID), 0)
      last30Mins += dayMins

      trend.push({ label, assigned: assignedIds.size, approved: approvedIds.size })
    }

    // Pipeline value
    const weights = { 'Changes Requested': 0.8, 'Review': 0.6, 'Active': 0.4, 'Pending': 0.2 }
    let pipelineValue = 0
    let pipelineMins = 0
    filteredByAssigned.forEach(p => {
      if (weights[p.Status as keyof typeof weights]) {
        const w = weights[p.Status as keyof typeof weights]
        pipelineValue += w
        pipelineMins += parseDurationSec(p.Duration, p.Project_ID) * w
      }
    })

    // For "All time", projection is based on next 30 days
    runRate = last30Approved / 30
    runRateMins = last30Mins / 30

    const futureRate = runRate + (pipelineValue / 30)
    const futureRateMins = runRateMins + (pipelineMins / 30)

    projectedTotal = Math.round(futureRate * 30)
    projectedMinsTotal = Math.round(futureRateMins * 30)

    next7Total = Math.round(futureRate * 7)
    next7MinsTotal = Math.round(futureRateMins * 7)

    trend.forEach(t => {
      t.projected = parseFloat(runRate.toFixed(1))
      t.projectedMins = parseFloat(runRateMins.toFixed(1))
    })
  }

  // Status breakdown (deduped all)
  const statusMap: Record<string, number> = {}
  dedupedAll.forEach(p => { statusMap[p.Status] = (statusMap[p.Status] || 0) + 1 })
  const statusData = Object.entries(statusMap).map(([name, value]) => ({ name, value }))

  // Workload distribution
  const workloadData = animators.map(a => ({
    name: a.Name, current: a['Current video'] || 0, total: a['Total video'] || 0,
  })).filter(a => a.total > 0).slice(0, 10)

  // Channel-wise analytics (deduped all)
  const channelMap: Record<string, { total: number; inProgress: number; completed: number; totalDuration: number; completedDuration: number; inProgressDuration: number; completedCount: number }> = {}
  dedupedAll.forEach(p => {
    const ch = extractChannel(p.Project_ID)
    if (!channelMap[ch]) channelMap[ch] = { total: 0, inProgress: 0, completed: 0, totalDuration: 0, completedDuration: 0, inProgressDuration: 0, completedCount: 0 }
    channelMap[ch].total++
    const durMins = parseDurationSec(p.Duration, p.Project_ID)
    if (durMins > 0) channelMap[ch].totalDuration += durMins
    if (['Pending', 'Active', 'Review'].includes(p.Status)) {
      channelMap[ch].inProgress++
      if (durMins > 0) channelMap[ch].inProgressDuration += durMins
    }
    if (['Approved', 'Paid', 'Closed'].includes(p.Status)) {
      channelMap[ch].completed++
      channelMap[ch].completedCount++
      if (durMins > 0) channelMap[ch].completedDuration += durMins
    }
  })
  const channelData = Object.entries(channelMap)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, v]) => ({ name: name.toUpperCase(), ...v }))

  const PIE_COLORS = ['#667eea', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

  return (
    <div className="space-y-6">
      {listModalProps && (
        <ProjectListModal title={listModalProps.title} projects={listModalProps.sortedProjects} onClose={() => setListModalProps(null)} />
      )}

      {/* Month Filter */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-gray-700">📅 Filter by Month:</span>
        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none bg-white">
          <option value="">All Time</option>
          {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {selectedMonth && (
          <button onClick={() => setSelectedMonth('')}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100">
            Clear ✕
          </button>
        )}
        <span className="text-xs text-gray-400 ml-auto">
          {selectedMonth ? `Showing data for ${selectedMonth}` : 'Showing all-time data'}
        </span>
      </div>

      {/* Summary row 1 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6 border-b border-gray-50 pb-6 mb-6">
        {[
          { label: 'Total Projects', value: totalProjects, color: '#667eea', sub: null, projects: filteredByAssigned },
          { label: 'Approved', value: approved, color: '#10b981', sub: null, projects: filteredByApproved.filter(p => ['Approved', 'Paid', 'Closed'].includes(p.Status)) },
          { label: 'This Month Approved', value: thisMonthApprovedCount, color: '#059669', sub: 'Viewport & Appr in month', projects: thisMonthViewportAndApproved },
          { label: 'In Progress', value: inProgress, color: '#f59e0b', sub: null, projects: filteredByAssigned.filter(p => ['Active', 'Review', 'Changes Requested'].includes(p.Status)) },
          {
            label: selectedMonth ? 'Projected' : 'Projected (30d)',
            value: projectedTotal,
            color: '#3b82f6',
            sub: selectedMonth
              ? `${formatSec(projectedMinsTotal)}`
              : `${formatSec(projectedMinsTotal)} | 7d: ${next7Total}`,
            projects: null
          },
          { label: 'Total Animators', value: animators.length, color: '#8b5cf6', sub: null, projects: null },
        ].map(s => {
          const content = (
            <>
              <p className="text-3xl font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-1" style={{minHeight: "16px"}}>{s.label}</p>
              {s.sub && <p className="text-[10px] font-semibold text-indigo-500 mt-0.5">{s.sub}</p>}
            </>
          )

          if (s.projects) {
            return (
              <button key={s.label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center hover:bg-gray-50 transition-colors"
                onClick={() => setListModalProps({ title: `${s.label} ${selectedMonth ? `(${selectedMonth})` : '(All Time)'}`, sortedProjects: s.projects! })}>
                {content}
              </button>
            )
          }

          return (
            <div key={s.label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center">
              {content}
            </div>
          )
        })}
      </div>

      {/* Duration cards */}
      <div className="grid grid-cols-2 gap-4">
        {[
          {
            label: selectedMonth ? `Total Duration (${selectedMonth})` : 'Total Duration This Month',
            value: durationThisMonthMins > 0 ? `${formatSec(durationThisMonthMins)}` : '—',
            sub: `approved projects${selectedMonth ? ` in ${selectedMonth}` : ''}`,
            color: '#06b6d4',
          },
          {
            label: 'Total Duration Overall',
            value: lifetimeDurationMins > 0 ? `${formatSec(lifetimeDurationMins)}` : '—',
            sub: `${lifetimeApproved} approved total`,
            color: '#8b5cf6',
          },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 text-center">
            <p className="text-3xl font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Daily Work Trend */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Daily Work Trend {selectedMonth ? `— ${selectedMonth}` : '(Last 30 Days)'}
        </h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={trend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={4} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip /><Legend />
            <Line type="monotone" dataKey="assigned" name="Assigned" stroke="#667eea" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="approved" name="Approved" stroke="#10b981" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="projected" name="Projected Rate" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Lifetime Report */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-1">📋 Lifetime Report</h3>
        <p className="text-xs text-gray-400 mb-4">All-time totals — not affected by the month filter</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: 'Total Projects (Ever)', value: lifetimeTotal, color: '#667eea' },
            { label: 'Total Approved (Ever)', value: lifetimeApproved, color: '#10b981' },
            { label: 'Total Animators', value: animators.length, color: '#8b5cf6' },
            { label: 'Total Duration (Ever)', value: lifetimeDurationMins > 0 ? `${formatSec(lifetimeDurationMins)}` : '—', color: '#06b6d4' },
          ].map(s => (
            <div key={s.label} className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Channel-wise Analytics */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-1">Channel-wise Analytics</h3>
        <p className="text-xs text-gray-400 mb-4">Extracted from Project ID (e.g. 20223_80_plip → PLIP)</p>
        {channelData.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">No channel data available</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={channelData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip /><Legend />
                <Bar dataKey="total" name="Total" fill="#667eea" radius={[4, 4, 0, 0]} />
                <Bar dataKey="inProgress" name="In Progress" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" name="Completed" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Channel', 'Total', 'In Progress', 'Completed', 'Total Duration', 'In Progress Duration', 'Completed Duration', 'Completion %'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {channelData.map((ch, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold text-gray-700">{ch.name}</td>
                      <td className="px-3 py-2 text-gray-600">{ch.total}</td>
                      <td className="px-3 py-2"><span className="text-amber-600 font-medium">{ch.inProgress}</span></td>
                      <td className="px-3 py-2"><span className="text-green-600 font-medium">{ch.completed}</span></td>
                      <td className="px-3 py-2"><span className="text-indigo-600 font-medium">{formatSec(ch.totalDuration)}</span></td>
                      <td className="px-3 py-2"><span className="text-amber-600 font-medium">{formatSec(ch.inProgressDuration)}</span></td>
                      <td className="px-3 py-2"><span className="text-green-600 font-medium">{formatSec(ch.completedDuration)}</span></td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${ch.total > 0 ? Math.round((ch.completed / ch.total) * 100) : 0}%` }} />
                          </div>
                          <span className="text-xs text-gray-500 w-8">{ch.total > 0 ? Math.round((ch.completed / ch.total) * 100) : 0}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Status Bar Chart */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Projects by Status</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={statusData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" name="Count" fill="#667eea" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie Chart */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Animator Workload</h3>
          {workloadData.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-12">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={workloadData} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                  label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                  labelLine={false}>
                  {workloadData.map((_, index) => <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(value) => [value, 'Total Videos']} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Notes Tab ────────────────────────────────────────────────────────────────

function NotesTab({ user }: { user: DashboardUser }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [leads, setLeads] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [rlsError, setRlsError] = useState('')
  // Quick note state
  const [quickNote, setQuickNote] = useState('')
  const [savingQuick, setSavingQuick] = useState(false)
  // New todo state
  const [todoContent, setTodoContent] = useState('')
  const [todoAssignee, setTodoAssignee] = useState('')
  const [todoPriority, setTodoPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [addingTodo, setAddingTodo] = useState(false)

  const loadData = async () => {
    setLoading(true)
    const [{ data: notesData, error: notesErr }, { data: leadsData }] = await Promise.all([
      apiClient.from('notes').select('*').order('created_at', { ascending: false }),
      apiClient.from('leads').select('Head_Name'),
    ])
    if (notesErr) setRlsError(notesErr.message)
    else setRlsError('')
    setNotes((notesData as Note[]) || [])
    setLeads(((leadsData || []) as { Head_Name: string }[]).map(l => l.Head_Name).filter(Boolean))
    setLoading(false)
  }

  useEffect(() => { loadData() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const saveQuickNote = async () => {
    if (!quickNote.trim()) return
    setSavingQuick(true)
    const { error } = await apiClient.from('notes').insert({
      content: quickNote.trim(),
      created_by: user.full_name || user.email,
      assigned_to: null,
      is_todo: false,
      is_done: false,
      priority: 'low',
    })
    if (!error) {
      setQuickNote('')
      await loadData()
    } else {
      setRlsError(error.message)
      setTimeout(() => setRlsError(''), 4000)
    }
    setSavingQuick(false)
  }

  const addTodo = async () => {
    if (!todoContent.trim()) return
    setAddingTodo(true)
    const { error } = await apiClient.from('notes').insert({
      content: todoContent.trim(),
      created_by: user.full_name || user.email,
      assigned_to: todoAssignee || null,
      is_todo: true,
      is_done: false,
      priority: todoPriority,
    })
    if (!error) { setTodoContent(''); setTodoAssignee(''); setTodoPriority('medium'); await loadData() }
    setAddingTodo(false)
  }

  const toggleDone = async (note: Note) => {
    await apiClient.from('notes').update({ is_done: !note.is_done }).eq('id', note.id)
    setNotes(prev => prev.map(n => n.id === note.id ? { ...n, is_done: !n.is_done } : n))
  }

  const deleteNote = async (id: number) => {
    await apiClient.from('notes').delete().eq('id', id)
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  const priorityConfig = {
    high: { label: 'High', color: '#ef4444', bg: '#fef2f2' },
    medium: { label: 'Medium', color: '#f59e0b', bg: '#fffbeb' },
    low: { label: 'Low', color: '#10b981', bg: '#f0fdf4' },
  }

  const myName = user.full_name || user.email
  const myNotes = notes.filter(n => n.created_by === myName && !n.is_todo)
  const myTodos = notes.filter(n => n.created_by === myName && n.is_todo)
  const teamTasks = notes.filter(n => n.assigned_to === myName)

  return (
    <div className="space-y-5">
      {rlsError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          Database error: {rlsError}
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT PANEL */}
        <div className="space-y-5">
          {/* Quick Note */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-3">My Notes</h3>
            <textarea
              value={quickNote}
              onChange={e => setQuickNote(e.target.value)}
              rows={3}
              placeholder="Write a quick note…"
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none resize-none"
            />
            <div className="flex items-center gap-2 mt-2">
              <button onClick={saveQuickNote} disabled={savingQuick || !quickNote.trim()}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                {savingQuick ? 'Saving…' : 'Save Note'}
              </button>
              {savingQuick && <p className="text-xs text-gray-400">Saving…</p>}
            </div>
            {myNotes.length > 0 && (
              <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
                {myNotes.map(n => (
                  <div key={n.id} className="flex items-start gap-2 p-2.5 bg-gray-50 rounded-lg">
                    <p className="flex-1 text-xs text-gray-700">{n.content}</p>
                    <button onClick={() => deleteNote(n.id)} className="text-gray-300 hover:text-red-400 flex-shrink-0">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Todo List */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-3">Todo List</h3>
            <div className="space-y-2 mb-4">
              <input value={todoContent} onChange={e => setTodoContent(e.target.value)}
                placeholder="Task description…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" />
              <div className="flex gap-2">
                <select value={todoAssignee} onChange={e => setTodoAssignee(e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none">
                  <option value="">Assign to (optional)</option>
                  {leads.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <div className="flex gap-1">
                  {(['low', 'medium', 'high'] as const).map(p => {
                    const c = priorityConfig[p]
                    return (
                      <button key={p} type="button" onClick={() => setTodoPriority(p)}
                        className="px-2 py-1 rounded-full text-xs font-medium border transition-all"
                        style={{ backgroundColor: todoPriority === p ? c.bg : 'white', color: c.color, borderColor: todoPriority === p ? c.color : '#e5e7eb' }}>
                        {c.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <button onClick={addTodo} disabled={addingTodo || !todoContent.trim()}
                className="w-full py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                {addingTodo ? 'Adding…' : '+ Add Todo'}
              </button>
            </div>
            {loading ? (
              <p className="text-xs text-gray-400 text-center py-4">Loading…</p>
            ) : myTodos.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No todos yet</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {myTodos.map(n => {
                  const pc = priorityConfig[n.priority] || priorityConfig.medium
                  return (
                    <div key={n.id} className={`flex items-start gap-2 p-3 rounded-xl border ${n.is_done ? 'opacity-60 bg-gray-50 border-gray-100' : 'border-gray-100 hover:border-indigo-100'}`}>
                      <button onClick={() => toggleDone(n)}
                        className="mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                        style={{ borderColor: n.is_done ? '#10b981' : '#d1d5db', backgroundColor: n.is_done ? '#10b981' : 'transparent' }}>
                        {n.is_done && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${n.is_done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{n.content}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: pc.bg, color: pc.color }}>{pc.label}</span>
                          {n.assigned_to && <span className="text-xs text-gray-400">→ {n.assigned_to}</span>}
                        </div>
                      </div>
                      <button onClick={() => deleteNote(n.id)} className="text-gray-300 hover:text-red-400 flex-shrink-0 p-0.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL — Team Tasks assigned to me */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-800 mb-1">Team Tasks</h3>
          <p className="text-xs text-gray-400 mb-4">Tasks assigned to you</p>
          {loading ? (
            <p className="text-xs text-gray-400 text-center py-8">Loading…</p>
          ) : teamTasks.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-3xl mb-2">✅</p>
              <p className="text-sm text-gray-400">No tasks assigned to you</p>
            </div>
          ) : (
            <div className="space-y-3">
              {teamTasks.map(n => {
                const pc = priorityConfig[n.priority] || priorityConfig.medium
                return (
                  <div key={n.id} className={`p-3 rounded-xl border ${n.is_done ? 'opacity-60 bg-gray-50 border-gray-100' : 'border-gray-100 hover:border-indigo-100'}`}>
                    <div className="flex items-start gap-2">
                      <button onClick={() => toggleDone(n)}
                        className="mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                        style={{ borderColor: n.is_done ? '#10b981' : '#d1d5db', backgroundColor: n.is_done ? '#10b981' : 'transparent' }}>
                        {n.is_done && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${n.is_done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{n.content}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: pc.bg, color: pc.color }}>{pc.label}</span>
                          <span className="text-xs text-gray-400">from {n.created_by}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Progress Tracker Tab (Project Kanban) ──────────────────────────────

function BudgetTrackerTab({ projects, onRefresh }: { projects: Project[]; onRefresh: () => void }) {
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [dateFieldFilters, setDateFieldFilters] = useState<string[]>(['Date Assigned'])
  const [showDateFieldDropdown, setShowDateFieldDropdown] = useState(false)
  const DATE_FIELD_OPTIONS = [
    { label: 'Date Assigned', key: 'Date Assigned' },
    { label: 'Viewport', key: 'viewport_date' },
    { label: 'Ready to Render', key: 'ready_to_render_date' },
    { label: 'Render QA', key: 'render_qa_date' },
    { label: 'Approved', key: 'Date Approved' },
  ]
  const [channelFilter, setChannelFilter] = useState('all')
  const [projSearch, setProjSearch] = useState('')
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [reportModalStage, setReportModalStage] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [msgType, setMsgType] = useState<'success' | 'error'>('success')

  const toast = (text: string, type: 'success' | 'error' = 'success') => {
    setMsg(text); setMsgType(type)
    setTimeout(() => setMsg(''), 4000)
  }

  const dedup = (list: Project[]): Project[] => {
    const seen = new Map<string, Project>()
    list.forEach(p => { if (!seen.has(p.Project_ID)) seen.set(p.Project_ID, p) })
    return Array.from(seen.values())
  }

  const isBetweenDates = (dateStr: string, fromStr: string, toStr: string) => {
    if (!fromStr && !toStr) return true
    if (!dateStr) return false
    const d = parseDate(dateStr)
    if (d.getTime() === 0) return false
    if (fromStr) {
      const [fy, fm, fd] = fromStr.split('-').map(Number)
      const from = new Date(fy, fm - 1, fd, 0, 0, 0, 0)
      if (d < from) return false
    }
    if (toStr) {
      const [ty, tm, td] = toStr.split('-').map(Number)
      const to = new Date(ty, tm - 1, td, 23, 59, 59, 999)
      if (d > to) return false
    }
    return true
  }

  const getDateForStage = (p: Project, stage: string) => {
    if (stage === 'Approved') return p['Date Approved']
    if (stage === 'Paid') return p.client_paid_date
    if (stage === 'Render QA') return p.render_qa_date || p.viewport_date || p['Date Assigned']
    if (stage === 'Ready to Render') return p.ready_to_render_date || p.viewport_date || p['Date Assigned']
    if (stage === 'Changes Requested') return p.animation_revision_date || p.viewport_date || p['Date Assigned']
    if (stage === 'Review') return p.viewport_date || p['Date Assigned']
    return p['Date Assigned']
  }

  const getChannel = (id: string) => (id || '').split('_')[2]?.toLowerCase() || ''
  const byChannel = (list: Project[]) =>
    channelFilter === 'all' ? list : list.filter(p => getChannel(p.Project_ID) === channelFilter)

  const availableChannels = Array.from(
    new Set(projects.map(p => getChannel(p.Project_ID)).filter(Boolean))
  ).sort()

  const matchProj = (p: Project) =>
    !projSearch ||
    p.Project_ID.toLowerCase().includes(projSearch.toLowerCase()) ||
    (p.Project_title || '').toLowerCase().includes(projSearch.toLowerCase())

  const TRACKER_STAGES = [
    'Pending', 'STL', 'Active', 'Review', 'Changes Requested',
    'Ready to Render', 'Render QA', 'Approved', 'Paid', 'Closed'
  ]

  const statusColor: Record<string, string> = {
    Pending: '#94a3b8', Active: '#3b82f6', Review: '#f59e0b',
    'Changes Requested': '#ef4444', 'Ready to Render': '#8b5cf6', 'STL': '#f43f5e',
    'Render QA': '#ec4899', Approved: '#10b981', Paid: '#059669', Closed: '#64748b'
  }

  const sumSeconds = (list: Project[]) => {
    return list.reduce((total, p) => total + parseDurationSec(p.Duration, p.Project_ID), 0)
  }

  // ── Mark as Paid ──
  const handleMarkPaid = async (project: Project) => {
    setMarkingId(project.Project_ID)
    const today = formatDate()
    const { error } = await apiClient
      .from('projects')
      .update({ Payment_Status: 'Client Paid', Status: 'Paid', client_paid_date: today })
      .eq('Project_ID', project.Project_ID)
    if (error) {
      toast('Failed to mark as paid: ' + error.message, 'error')
    } else {
      toast(`${project.Project_ID} marked as Paid ✅`, 'success')
      await onRefresh()
    }
    setMarkingId(null)
  }

  const ProjectCard = ({ project, showMarkPaid = false }: { project: Project; showMarkPaid?: boolean }) => {
    const durStr = formatSec(parseDurationSec(project.Duration, project.Project_ID))
    
    const statusDateStr = getDateForStage(project, project.Status)
    const statusDate = statusDateStr ? parseDate(statusDateStr) : null
    const daysInStage = statusDate && statusDate.getTime() > 0 
      ? Math.floor((Date.now() - statusDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0
    const isOverdue = daysInStage >= 7 && !['Approved', 'Paid', 'Closed'].includes(project.Status)

    const cardBg = isOverdue ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'

    return (
      <div className={`${cardBg} rounded-xl border shadow-sm p-4 hover:shadow-md transition-shadow relative`}>
        {isOverdue && (
           <div className="absolute -top-2 -right-2 bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-sm animate-pulse z-10 border-2 border-white">
             {daysInStage} DAYS STUCK
           </div>
        )}
        <div className="flex flex-col gap-1.5 mb-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-mono text-gray-400 truncate">{project.Project_ID}</p>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 text-white"
              style={{ backgroundColor: statusColor[project.Status] || '#94a3b8' }}>
              {STATUS_LABELS[project.Status] || project.Status}
            </span>
          </div>
          <a href={project.Project_link || '#'} target="_blank" rel="noopener noreferrer" 
             className="text-sm font-semibold text-gray-800 hover:text-indigo-600 hover:underline transition-colors break-words">
            {project.Project_title || 'No Title'}
          </a>
        </div>
        <div className="space-y-1 text-xs text-gray-500">
          <p>🎬 {project.Animator || '—'}</p>
          <p>⏱ {durStr}</p>
          {project['Date Assigned'] && <p>📅 Assigned: {project['Date Assigned']}</p>}
          {project.Status === 'Review' && project.viewport_date && <p>👁️ Viewport: {project.viewport_date}</p>}
          {project.Status === 'Changes Requested' && project.animation_revision_date && <p>🔄 Revision: {project.animation_revision_date}</p>}
          {project.Status === 'Ready to Render' && project.ready_to_render_date && <p>⏳ Ready: {project.ready_to_render_date}</p>}
          {project.Status === 'Render QA' && project.render_qa_date && <p>🔎 QA: {project.render_qa_date}</p>}
          {project.Status === 'Approved' && project['Date Approved'] && <p>✅ Approved: {project['Date Approved']}</p>}
          {project.Status === 'Paid' && project.client_paid_date && <p>💰 Paid: {project.client_paid_date}</p>}
        </div>
        {showMarkPaid && (
          <button
            onClick={() => handleMarkPaid(project)}
            disabled={markingId === project.Project_ID}
            className="mt-3 w-full py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60 transition-opacity"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            {markingId === project.Project_ID ? 'Marking…' : '💳 Mark as Paid'}
          </button>
        )}
      </div>
    )
  }

  // Helper to generate the data for the requested report
  const generateReportData = (stage: string) => {
    let projs = byChannel(dedup(projects.filter(p => {
       const secs = parseDurationSec(p.Duration, p.Project_ID)
       if (stage === 'STL') {
         return secs > 180 && !['Approved', 'Paid', 'Closed'].includes(p.Status) && matchProj(p)
       } else {
         const isSTL = secs > 180 && !['Approved', 'Paid', 'Closed'].includes(p.Status)
         if (isSTL) return false
         return p.Status === stage && matchProj(p)
       }
    })))
    
    if (dateFrom || dateTo) {
      projs = projs.filter(p => {
         const checkFields = dateFieldFilters.length > 0 ? dateFieldFilters : ['Date Assigned'];
         return checkFields.some(key => isBetweenDates((p as any)[key], dateFrom, dateTo))
      })
    }
    return projs
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`fixed bottom-5 right-5 z-50 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all ${msgType === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {msg}
        </div>
      )}

      {/* Dynamic Report Modal */}
      {reportModalStage && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-800 text-lg">📋 {STATUS_LABELS[reportModalStage] || reportModalStage} Report</h3>
                <p className="text-xs text-gray-400 mt-0.5">Projects currently in {STATUS_LABELS[reportModalStage] || reportModalStage}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => window.print()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700">
                  🖨 Print / Save PDF
                </button>
                <button onClick={() => setReportModalStage(null)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 bg-gray-100">
                  Close
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-6">
              {generateReportData(reportModalStage).length === 0 ? (
                <p className="text-center text-gray-400 py-12">No data for this stage</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Project ID', 'Title', 'Animator', 'Duration', 'Assigned', 'Status Date'].map(h => (
                        <th key={h} className="text-left px-2 py-1.5 text-xs font-medium text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {generateReportData(reportModalStage).map(p => (
                      <tr key={p.Project_ID} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-2 py-2 font-mono text-xs text-gray-600">{p.Project_ID}</td>
                        <td className="px-2 py-2 text-gray-800 max-w-[200px] truncate">{p.Project_title || '—'}</td>
                        <td className="px-2 py-2 text-gray-600">{p.Animator || '—'}</td>
                        <td className="px-2 py-2 text-gray-600">{formatSec(parseDurationSec(p.Duration, p.Project_ID))}</td>
                        <td className="px-2 py-2 text-gray-600">{p['Date Assigned'] || '—'}</td>
                        <td className="px-2 py-2 text-gray-600">
                          {reportModalStage === 'Approved' ? p['Date Approved'] : reportModalStage === 'Paid' ? p.client_paid_date : p['Date Assigned'] || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Channel & Search filter bar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col items-stretch gap-4 mb-6">
        <div className="flex flex-col md:flex-row gap-5 items-center justify-between">
          <div className="flex-1 w-full relative max-w-lg">
            <svg stroke="currentColor" fill="none" viewBox="0 0 24 24" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400">
              <path strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder="Search progress tracker by project ID or title..." value={projSearch} onChange={e => setProjSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-gray-800 transition-all" />
          </div>
          <div className="flex items-center gap-3 bg-gray-50 p-1.5 rounded-xl border border-gray-100">
            <div className="flex items-center gap-2 px-2">
              <span className="text-xs font-semibold text-gray-500 uppercase">From:</span>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="text-xs px-2 py-1.5 rounded-lg border-gray-200 border focus:outline-none focus:border-indigo-400 bg-white" />
            </div>
            <div className="flex items-center gap-2 px-2 border-l border-gray-200">
              <span className="text-xs font-semibold text-gray-500 uppercase">To:</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="text-xs px-2 py-1.5 rounded-lg border-gray-200 border focus:outline-none focus:border-indigo-400 bg-white" />
            </div>
            <div className="flex items-center gap-2 px-2 border-l border-gray-200 relative">
              <span className="text-xs font-semibold text-gray-500 uppercase">Filter By:</span>
              <button 
                onClick={() => setShowDateFieldDropdown(!showDateFieldDropdown)}
                className="text-xs px-3 py-1.5 rounded-lg border-gray-200 border bg-white flex items-center justify-between min-w-[120px] shadow-sm hover:border-indigo-300 transition-colors"
              >
                <span className="truncate font-medium text-gray-700">
                  {dateFieldFilters.length === 0 ? 'Assigned' : `${dateFieldFilters.length} selected`}
                </span>
                <span className="text-[10px] ml-2 text-gray-400 font-bold">▼</span>
              </button>
              {showDateFieldDropdown && (
                <div className="absolute top-10 right-0 w-48 bg-white border border-gray-200 shadow-xl rounded-xl z-50 p-2 flex flex-col gap-1 ring-1 ring-black/5" onMouseLeave={() => setShowDateFieldDropdown(false)}>
                  <div className="text-[10px] font-bold text-indigo-500 mb-1 px-1 uppercase tracking-wider">Select Dates to Check:</div>
                  {DATE_FIELD_OPTIONS.map(opt => (
                    <label key={opt.key} className="flex items-center gap-2 px-2 py-1.5 hover:bg-indigo-50/80 rounded-lg cursor-pointer transition-colors border border-transparent">
                      <input 
                        type="checkbox" 
                        className="w-3.5 h-3.5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 transition-all cursor-pointer"
                        checked={dateFieldFilters.includes(opt.key)}
                        onChange={(e) => {
                          if (e.target.checked) setDateFieldFilters(prev => [...prev, opt.key])
                          else setDateFieldFilters(prev => prev.filter(k => k !== opt.key))
                        }}
                      />
                      <span className="text-xs font-medium text-gray-700 select-none">{opt.label}</span>
                    </label>
                  ))}
                  {dateFieldFilters.length > 0 && (
                     <button onClick={() => setDateFieldFilters([])} className="mt-1 w-full text-center text-[10px] text-red-500 font-bold hover:bg-red-50 hover:text-red-600 py-1.5 rounded-lg transition-colors border border-transparent hover:border-red-100">Clear</button>
                  )}
                </div>
              )}
            </div>
            {(dateFrom || dateTo || dateFieldFilters.length > 0) && (
              <button 
                onClick={() => { setDateFrom(''); setDateTo(''); setDateFieldFilters([]) }} 
                className="px-3 py-1.5 text-[11px] text-red-600 border border-red-200 hover:bg-red-50 hover:border-red-300 font-bold rounded-lg transition-colors ml-1 uppercase tracking-wide">
                Reset
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap border-t border-gray-100 pt-3">
          <span className="text-xs font-semibold text-gray-500 mr-2 uppercase tracking-wide">Channel:</span>
          {['all', ...availableChannels].map(ch => (
            <button key={ch} onClick={() => setChannelFilter(ch)}
              className="px-3 py-1 rounded-full text-xs font-semibold border transition-all capitalize"
              style={{
                backgroundColor: channelFilter === ch ? '#667eea' : 'white',
                color: channelFilter === ch ? 'white' : '#64748b',
                borderColor: channelFilter === ch ? '#667eea' : '#e2e8f0',
              }}>
              {ch === 'all' ? '🌐 All' : ch}
            </button>
          ))}
        </div>
      </div>

      {/* Dynamic Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4 items-start w-full">
        {TRACKER_STAGES.map(stage => {
          // Filter projects for this column
          let stageProjects = byChannel(dedup(projects.filter(p => {
             const secs = parseDurationSec(p.Duration, p.Project_ID)
             if (stage === 'STL') {
               return secs > 180 && !['Approved', 'Paid', 'Closed'].includes(p.Status) && matchProj(p)
             } else {
               const isSTL = secs > 180 && !['Approved', 'Paid', 'Closed'].includes(p.Status)
               if (isSTL) return false // hide from standard viewport/render stages
               return p.Status === stage && matchProj(p)
             }
          })))

          if (dateFrom || dateTo) {
            stageProjects = stageProjects.filter(p => {
               const checkFields = dateFieldFilters.length > 0 ? dateFieldFilters : ['Date Assigned'];
               return checkFields.some(key => isBetweenDates((p as any)[key], dateFrom, dateTo))
            })
          }

          const stageSecs = sumSeconds(stageProjects)
          const cLabel = STATUS_LABELS[stage] || stage
          const cColor = statusColor[stage] || '#94a3b8'

          return (
            <div key={stage} className="flex flex-col gap-3 min-w-[320px] max-w-[320px] flex-shrink-0 bg-gray-50/50 rounded-2xl p-3 border border-gray-100">
              <div className="flex items-center justify-between px-1 flex-wrap gap-2 pb-2 border-b border-gray-200/60">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-800 truncate" title={cLabel}>{cLabel}</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: cColor }}>
                    {formatSec(stageSecs)}
                  </span>
                </div>

                <button onClick={() => setReportModalStage(stage)}
                  className="px-2 py-1 rounded text-[10px] font-semibold text-white opacity-80 hover:opacity-100"
                  style={{ backgroundColor: cColor }}>
                  Report
                </button>
              </div>

              <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                {stageProjects.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-100 p-6 text-center text-gray-400 text-sm">
                    No {cLabel.toLowerCase()} projects
                  </div>
                ) : stageProjects.map(p => (
                  <ProjectCard
                    key={p.Project_ID}
                    project={p}
                    showMarkPaid={stage === 'Approved'}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}




// ─── Main Dashboard ───────────────────────────────────────────────────────────

type Tab = 'overview' | 'assign' | 'bank' | 'team' | 'create' | 'analytics' | 'submissions' | 'payments' | 'payouts' | 'invoices' | 'notes' | 'budget' | 'duplicates'

const ALL_TABS: { id: Tab; label: string; icon: string; managerOnly?: boolean; headVisible?: boolean }[] = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'assign', label: 'Assign Projects', icon: '🔗', managerOnly: true },
  { id: 'duplicates', label: 'Duplicate Threads', icon: '👯', managerOnly: true },
  { id: 'bank', label: 'Projects', icon: '🗂️' },
  { id: 'team', label: 'Animators', icon: '👥' },
  { id: 'create', label: 'Create Project', icon: '➕', managerOnly: true },
  { id: 'submissions', label: 'Form Submissions', icon: '📋' },
  { id: 'analytics', label: 'Analytics', icon: '📈' },
  { id: 'payments', label: 'Payments', icon: '💳', managerOnly: true },
  { id: 'payouts', label: 'Payout Calculator', icon: '🧭', managerOnly: true },
  { id: 'invoices', label: 'Invoices', icon: '📄', managerOnly: true },
  { id: 'notes', label: 'Notes', icon: '📝' },
  { id: 'budget', label: 'Progress Tracker', icon: '📈' },
]


// --- Secure Server-Side Proxy Client ---
// Replaces the direct Supabase client to fix ISP routing blocks
const apiClient = {
  from: (table: string) => {
    let _action = 'select';
    let _payload: any = null;
    let _match: any = null;
    let _isMatch: any = null;
    let _inMatch: any = null;
    let _order: any = null;
    let _single = false;
    let _options: any = null;

    const builder: any = {
      select(params?: string) { _action = 'select'; _payload = params; return builder; },
      insert(payload: any) { _action = 'insert'; _payload = payload; return builder; },
      update(payload: any) { _action = 'update'; _payload = payload; return builder; },
      upsert(payload: any, options?: any) { _action = 'upsert'; _payload = payload; _options = options; return builder; },
      delete() { _action = 'delete'; return builder; },
      eq(col: string, val: any) { _match = _match || {}; _match[col] = val; return builder; },
      match(obj: any) { _match = { ...(_match || {}), ...obj }; return builder; },
      is(col: string, val: any) { _isMatch = _isMatch || {}; _isMatch[col] = val; return builder; },
      in(col: string, vals: any[]) { _inMatch = { column: col, values: vals }; return builder; },
      order(col: string, opts?: any) { _order = { column: col, options: opts }; return builder; },
      limit(n: number) { _order = { ...(_order || {}), limit: n }; return builder; },
      single() { _single = true; return builder; },
      then(resolve: (value: any) => void, reject: (reason?: any) => void) {
        fetch(`/api/${table}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: _action, payload: _payload, match: _match, isMatch: _isMatch, inMatch: _inMatch, order: _order, single: _single, options: _options })
        })
          .then(res => res.json().then(data => res.ok ? data : Promise.reject(data.error)))
          .then(data => resolve({ data: data.data, error: null }))
          .catch(error => {
            console.error(`[apiClient Error on ${table}]:`, error);
            resolve({ data: null, error: typeof error === 'string' ? { message: error } : error });
          });
      }
    };
    return builder as PromiseLike<any> & any;
  }
};
// ----------------------------------------

// ─── Invoice Types ────────────────────────────────────────────────────────────
interface Invoice {
  id: string
  invoice_number: string
  employee_id: string
  legal_name: string
  month_label: string
  invoice_date: string
  artist_address: string
  artist_pan: string
  line_items: { project_id: string; title: string; seconds: number; amount: number; assigned_date?: string; approved_date?: string }[]
  total_amount: number
  tds_percent: number
  tds_amount: number
  bonus_amount?: number
  net_payable: number
  status: string // Draft | Awaiting Details | Sent | Edit Requested | Acknowledged | Paid | Downloaded
  sent_at: string
  acknowledged_at: string
  paid_at: string
  downloaded_at: string
  thread_id: string
  edit_comment: string
  edit_status: string
}

// ─── InvoicesTab ──────────────────────────────────────────────────────────────
function InvoicesTab({ animators, projects }: { animators: Animator[]; projects: Project[] }) {
  const { addToast } = useToast()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [section, setSection] = useState<'send' | 'pending' | 'done'>('pending')
  const [selectedEids, setSelectedEids] = useState<Set<string>>(new Set())
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null)
  const [bulkPrintInvoices, setBulkPrintInvoices] = useState<Invoice[]>([])

  const monthOptions = (() => {
    const opts: string[] = []
    const now = new Date()
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      opts.push(d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }))
    }
    return opts
  })()
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0])

  const fetchInvoices = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await apiClient.from('invoices').select('*').order('id', { ascending: false }).limit(9999)
      setInvoices((data as Invoice[]) || [])
    } catch (e: any) {
      addToast('Failed to load invoices', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])

  
  // All project IDs that have already been included in an invoice
  const invoicedProjectIds = new Set<string>()
  invoices.forEach(inv => {
    let items = inv.line_items
    if (typeof items === 'string') {
      try { items = JSON.parse(items) } catch (e) { items = [] }
    }
    if (items && Array.isArray(items)) {
      items.forEach((item: any) => {
        if (item.project_id) invoicedProjectIds.add(item.project_id)
      })
    }
  })

  // Approved projects not yet paid (for the send panel)
  const approvedUnpaidByEid = (() => {
    const map: Record<string, Project[]> = {}
    for (const p of projects) {
      if (p.Status === 'Approved' && p.Payment_Status !== 'Paid' && !invoicedProjectIds.has(p.Project_ID)) {
        const d = new Date(p['Date Approved'] || p['Date Assigned'] || '')
        const pMonth = isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
        if (pMonth !== selectedMonth && pMonth !== '') continue

        let eid = p.Employee_ID || ''
        if (!eid && p.Animator) {
          const names = p.Animator.split(',').map((s: string) => s.trim().toLowerCase())
          const found = animators.find(a => names.includes((a.Name || '').toLowerCase()))
          if (found) eid = found.Employee_ID
        }
        if (!eid) continue
        if (!map[eid]) map[eid] = []
        map[eid].push(p)
      }
    }
    return map
  })()

  const animatorByEid: Record<string, Animator> = {}
  for (const a of animators) animatorByEid[a.Employee_ID] = a

  const handleSendInvoices = async (overrideEids?: Set<string>) => {
    const targetEids = overrideEids || selectedEids
    if (targetEids.size === 0) { addToast('Select at least one animator', 'error'); return }
    setSending(true)
    let successCount = 0
    let failCount = 0
    try {
      const now = new Date()
      const invoiceDate = now.toISOString().split('T')[0]

      for (const eid of Array.from(targetEids)) {
        const projs = approvedUnpaidByEid[eid] || []
        const anim = animatorByEid[eid]
        if (!anim) continue

        // Get past sequence safely by looking at existing invoices
        const { data: pastInvs } = await apiClient.from('invoices').select('invoice_number').eq('employee_id', eid)
        let currentSeq = 0
        if (pastInvs && pastInvs.length > 0) {
           const highest = pastInvs.map((i: any) => {
              const str = (i.invoice_number || '').toString().replace(eid, '')
              return parseInt(str || '0', 10)
           }).filter((n: number) => !isNaN(n)).sort((a: number, b: number) => b - a)[0]
           
           if (highest !== undefined) {
             currentSeq = highest
           }
        }
        const newSeq = currentSeq + 1
        const invoiceNumber = `${eid}${String(newSeq).padStart(2, '0')}`

        // Generate Line Items
        let totalVal = 0
        const lineItems = projs.map(p => {
          const rawSec = parseDurationSec(p.Duration || extractDuration(p.Project_ID) || '0', p.Project_ID)
          const empSet = new Set<string>()
          if (p.Employee_ID) empSet.add(p.Employee_ID)
            ; (p.Animator || '').split(',').map((s: string) => s.trim()).filter(Boolean).forEach((name: string) => {
              const found = animators.find(a => a.Name.toLowerCase() === name.toLowerCase())
              if (found) empSet.add(found.Employee_ID)
            })
          const finalSec = Math.round(rawSec / Math.max(1, empSet.size))
          const minsStr = (finalSec / 60).toFixed(2)
          const amt = Math.round(parseFloat(minsStr) * 5000)
          totalVal += amt
          return {
            project_id: p.Project_ID,
            title: p.Project_title || p.Project_ID,
            seconds: finalSec,
            amount: amt,
            assigned_date: p['Date Assigned'] || '',
            approved_date: p['Date Approved'] || '',
          }
        })

        // Fetch TDS and Bonus from payments DB (latest saved values for this animator)
        let tdsPct = 0
        let bonusAmount = 0
        let bonusNote = ''
        try {
          const { data: payData } = await apiClient.from('payments')
             .select('tds_percent, bonus, bonus_note')
             .eq('Employee ID', eid)
             .order('Timestamp', { ascending: false })
             .limit(1)
          if (payData && payData[0]) {
            tdsPct = Number(payData[0].tds_percent) || 0
            bonusAmount = Number(payData[0].bonus) || 0
            bonusNote = payData[0].bonus_note || ''
          }
        } catch (e) { console.error("Could not fetch TDS/Bonus", e) }

        const grossTotal = totalVal
        const newTotalVal = grossTotal + Number(bonusAmount || 0)
        const tdsAmt = Math.round(newTotalVal * (tdsPct / 100))
        const finalNet = Math.round(newTotalVal - tdsAmt)

        // Use the current project thread first, fallback to animator main workspace channel
        // Support both lowercase thread_id (returned by some DB queries) and uppercase Thread_ID
        const selectedProjForThread = projs.find(p => (p as any).thread_id || p.Thread_ID)
        const thread_id = (selectedProjForThread ? ((selectedProjForThread as any).thread_id || selectedProjForThread.Thread_ID) : '') || (anim as any).Discord_Channel_ID || anim.Channel_ID || ''

        // Check legal details BEFORE insert to set correct status
        const animAny = anim as any
        const hasLegalDetails = !!(animAny.legal_name && animAny.artist_address && animAny.artist_pan)
        const finalStatus = hasLegalDetails ? 'Sent' : 'Awaiting Details'

        // Build Discord message based on legal details availability
        // Insert invoice as Draft. The Python discord bot will pick this up,
        // send the appropriate message (with buttons), and automatically update
        // the status to 'Sent' or 'Awaiting Details'.
        const insertPayload = {
          invoice_number: String(invoiceNumber || '').trim(),
          employee_id: String(eid || '').trim(),
          legal_name: (animAny.legal_name || anim.Name || 'Unknown').trim(),
          month_label: String(selectedMonth || '').trim(),
          invoice_date: String(invoiceDate || '').trim(),
          line_items: lineItems || [],
          total_amount: Number(grossTotal || 0),
          bonus_amount: Number(bonusAmount || 0),
          tds_percent: Number(tdsPct || 0),
          tds_amount: Number(tdsAmt || 0),
          net_payable: Number(finalNet || 0),
          status: 'Draft',
          thread_id: String(thread_id || '').trim(),
          sent_at: null, // Bot will set this when actually sent
        }

        console.log(`[handleSendInvoices] Attempting insert for ${eid}:`, insertPayload)

        const { error: invErr } = await apiClient.from('invoices').insert(insertPayload)

        if (invErr) {
          console.error(`[handleSendInvoices] Insert failed for ${eid}:`, invErr)
          addToast(`❌ Invoice insert failed for ${anim.Name}: ${invErr.message || JSON.stringify(invErr)}`, 'error')
          failCount++
          continue
        }

        successCount++

      }

      if (successCount > 0) {
        addToast(`✅ Generated ${successCount} invoice(s) as Draft. Discord bot will send them shortly!`, 'success')
      }
      if (failCount > 0) {
        addToast(`❌ Failed for ${failCount} animator(s)`, 'error')
      }
      setSelectedEids(new Set())
      fetchInvoices()
    } catch (e: any) {
      addToast('Error creating invoices: ' + e.message, 'error')
    } finally {
      setSending(false)
    }
  }


  const generatePreview = async (eid: string) => {
    // Generates a mock invoice structure without saving it for the user to view.
    const projs = approvedUnpaidByEid[eid] || []
    const anim = animatorByEid[eid]
    if (!anim) return

    let totalVal = 0
    const lineItems = projs.map(p => {
      const rawSec = parseDurationSec(p.Duration || extractDuration(p.Project_ID) || '0', p.Project_ID)
      const empSet = new Set<string>()
      if (p.Employee_ID) empSet.add(p.Employee_ID)
        ; (p.Animator || '').split(',').map((s: string) => s.trim()).filter(Boolean).forEach((name: string) => {
          const found = animators.find(a => a.Name.toLowerCase() === name.toLowerCase())
          if (found) empSet.add(found.Employee_ID)
        })
      const finalSec = Math.round(rawSec / Math.max(1, empSet.size))
      const minsStr = (finalSec / 60).toFixed(2)
      const amt = Math.round(parseFloat(minsStr) * 5000)
      totalVal += amt

      return {
        project_id: p.Project_ID,
        title: p.Project_title || p.Project_ID,
        seconds: finalSec,
        amount: amt,
        assigned_date: p['Date Assigned'] || '',
        approved_date: p['Date Approved'] || '',
      }
    })

    // Fetch TDS and Bonus from payments DB (latest saved values)
    let tdsPct = 0
    let bonusAmount = 0
    try {
      const { data: payData } = await apiClient.from('payments')
         .select('tds_percent, bonus')
         .eq('Employee ID', eid)
         .order('Timestamp', { ascending: false })
         .limit(1)
      if (payData && payData[0]) {
        tdsPct = Number(payData[0].tds_percent) || 0
        bonusAmount = Number(payData[0].bonus) || 0
      }
    } catch (e) { console.error("Could not fetch TDS/Bonus for preview", e) }
    const newTotalVal = totalVal + bonusAmount
    const tdsAmt = Math.round(newTotalVal * (tdsPct / 100))
    const netPay = Math.round(newTotalVal - tdsAmt)
    const now = new Date()

    setPrintInvoice({
      id: 'preview',
      invoice_number: `Draft (${eid})`,
      employee_id: eid,
      legal_name: (anim as any).legal_name || anim.Name,
      month_label: selectedMonth,
      invoice_date: now.toISOString().split('T')[0],
      artist_address: (anim as any).artist_address || '',
      artist_pan: (anim as any).artist_pan || '',
      line_items: lineItems,
      total_amount: totalVal,
      tds_percent: tdsPct,
      tds_amount: tdsAmt,
      bonus_amount: bonusAmount,
      net_payable: netPay,
      status: 'Preview',
      thread_id: '',
      sent_at: '',
      acknowledged_at: '',
      paid_at: '',
      downloaded_at: '',
      edit_status: '',
      edit_comment: ''
    })
  }

  const handleDownload = async (inv: Invoice) => {
    let bonusToShow = 0;
    // Fetch the latest bonus from the most recent payment record for this animator
    try {
      const { data } = await apiClient.from('payments').select('bonus').match({ 'Employee ID': inv.employee_id }).order('Timestamp', { ascending: false })
      if (data && data.length > 0) {
        // Use only the latest payment record's bonus (not sum)
        bonusToShow = Number(data[0].bonus) || 0;
      }
    } catch { }

    // Use the fetched bonus if the stored value is missing or zero
    const finalBonus = (inv.bonus_amount && inv.bonus_amount > 0) ? inv.bonus_amount : bonusToShow;
    const printObj = { ...inv, bonus_amount: finalBonus };
    setPrintInvoice(printObj)

    // Mark downloaded
    try {
      if (inv.status !== 'Downloaded') {
        await apiClient.from('invoices').update({ status: 'Downloaded', downloaded_at: new Date().toISOString() }).match({ id: inv.id })
        fetchInvoices()
      }
    } catch { }
  }

  const [invoiceNameSearch, setInvoiceNameSearch] = useState('')

  const monthInvoices = invoices.filter(inv => inv.month_label === selectedMonth)
  const pendingInvoices = monthInvoices.filter(inv => ['Sent', 'Edit Requested', 'Awaiting Details', 'Draft'].includes(inv.status))
  const doneInvoices = monthInvoices.filter(inv => ['Acknowledged', 'Paid', 'Downloaded'].includes(inv.status))

  // Name-wise search helper
  const matchesInvoiceSearch = (nameOrEid: string) => {
    if (!invoiceNameSearch) return true
    return nameOrEid.toLowerCase().includes(invoiceNameSearch.toLowerCase())
  }

  // Animators who have not yet acknowledged for selected month
  const pendingEids = new Set(pendingInvoices.map(i => i.employee_id))
  const sentEids = new Set(monthInvoices.map(i => i.employee_id))
  const notSentEids = Object.keys(approvedUnpaidByEid)

  const tabStyle = (s: string) => ({
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    background: section === s ? '#667eea' : '#f1f5f9',
    color: section === s ? '#fff' : '#64748b',
  })

  return (
    <div className="space-y-6">
      {printInvoice && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setPrintInvoice(null)}
        >
          <style>{`
            @media print {
              .print-hidden { display: none !important; }
              body * { visibility: hidden; }
              #invoice-print-area, #invoice-print-area * { visibility: visible; }
              #invoice-print-area { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; border-radius: 0 !important; }
            }
          `}</style>
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: 48,
              maxWidth: 800,
              width: '90%',
              maxHeight: '90vh',
              overflowY: 'auto',
              fontFamily: '"Inter", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
              boxShadow: '0 20px 40px rgba(0,0,0,0.1)'
            }}
            onClick={e => e.stopPropagation()}
            id="invoice-print-area"
          >
            {/* Header: Just INVOICE on the right, nothing on left */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start', marginBottom: 32 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 40, fontWeight: 900, color: '#111', letterSpacing: 2, lineHeight: 1 }}>INVOICE</div>
                <div style={{ fontSize: 15, color: '#667eea', fontWeight: 700, marginTop: 8 }}>#{printInvoice.invoice_number}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Date: {printInvoice.invoice_date}</div>
                <div style={{ fontSize: 13, color: '#888' }}>Period: {printInvoice.month_label}</div>
              </div>
            </div>

            <hr style={{ margin: '24px 0', borderColor: '#f3f4f6', borderWidth: 2 }} />

            {/* From / To — animator is sender, company is recipient */}
            <div style={{ display: 'flex', gap: 40, marginBottom: 32 }}>
              <div style={{ flex: 1, background: '#f9fafb', padding: 20, borderRadius: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 1 }}>From (Freelancer)</div>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#111', marginBottom: 4 }}>{printInvoice.legal_name || '—'}</div>
                <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{printInvoice.artist_address || '—'}</div>
                <div style={{ fontSize: 13, color: '#4b5563', marginTop: 4 }}><strong>PAN:</strong> {printInvoice.artist_pan || '—'}</div>
              </div>
              <div style={{ flex: 1, background: '#f9fafb', padding: 20, borderRadius: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 1 }}>Billed To</div>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#111', marginBottom: 4 }}>FUTURVERSE ANIMATION PVT LTD</div>
                <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.5 }}>
                  GSTIN: 07AAGCF2334M1ZJ<br />
                  PAN: AAGCF2334M<br />
                  New Delhi, India
                </div>
              </div>
            </div>

            {/* Line items table */}
            <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb', marginBottom: 24 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f3f4f6', color: '#374151' }}>
                    {['#', 'Project ID', 'Assigned', 'Approved', 'Seconds', 'Amount (₹)'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: h.includes('Amount') || h === 'Seconds' ? 'right' : 'left', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(printInvoice.line_items || []).map((item, i) => {
                    const matchedProj = projects?.find(p => p.Project_ID === item.project_id);
                    const assignedDate = item.assigned_date || matchedProj?.['Date Assigned'] || '—';
                    const approvedDate = item.approved_date || matchedProj?.['Date Approved'] || '—';

                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#ffffff' : '#f9fafb', borderTop: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#6b7280' }}>{i + 1}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#111' }}>
                          <div>{item.project_id}</div>
                          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 400, marginTop: 2 }}>{item.title}</div>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: '#4b5563' }}>{assignedDate}</td>
                        <td style={{ padding: '12px 16px', fontSize: 12, color: '#4b5563' }}>{approvedDate}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, textAlign: 'right', fontWeight: 500, color: '#374151' }}>{item.seconds || '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, textAlign: 'right', fontWeight: 600, color: '#111' }}>₹{Number(item.amount || 0).toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
              <div style={{ width: 320, background: '#f9fafb', padding: 20, borderRadius: 12, border: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14 }}>
                  <span style={{ color: '#4b5563' }}>Gross Total:</span>
                  <span style={{ fontWeight: 700, color: '#111' }}>₹{Math.round(printInvoice.total_amount || 0).toLocaleString()}</span>
                </div>
                {printInvoice.bonus_amount && printInvoice.bonus_amount > 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14 }}>
                    <span style={{ color: '#4b5563' }}>Bonus:</span>
                    <span style={{ fontWeight: 700, color: '#059669' }}>+₹{Math.round(printInvoice.bonus_amount).toLocaleString()}</span>
                  </div>
                ) : null}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14, borderBottom: '1px solid #e5e7eb', marginBottom: 8 }}>
                  <span style={{ color: '#4b5563' }}>TDS @{printInvoice.tds_percent || 10}% (Sec 194J):</span>
                  <span style={{ fontWeight: 600, color: '#dc2626' }}>−₹{Math.round(printInvoice.tds_amount || 0).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 4px', fontSize: 18, fontWeight: 800, color: '#111' }}>
                  <span>Net Payable:</span>
                  <span style={{ color: '#667eea' }}>₹{Math.round(printInvoice.net_payable || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 32, fontSize: 11, color: '#9ca3af', borderTop: '1px solid #e5e7eb', paddingTop: 16, textAlign: 'center' }}>
              This is a computer-generated invoice for professional animation services rendered. <br />TDS deducted under Section 194J of the Income Tax Act, 1961. No signature is required.
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 12, marginTop: 32, justifyContent: 'center' }} className="print-hidden">
              {printInvoice.status === 'Preview' ? (
                <button
                  onClick={() => {
                    const eidSet = new Set<string>();
                    eidSet.add(printInvoice.employee_id);
                    setSelectedEids(eidSet);
                    setPrintInvoice(null);
                    setTimeout(() => handleSendInvoices(eidSet), 100);
                  }}
                  style={{ padding: '10px 24px', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14, boxShadow: '0 4px 6px rgba(16, 185, 129, 0.25)' }}
                >
                  📤 Generate & Send Now
                </button>
              ) : (
                <button
                  disabled={!['Paid', 'Downloaded'].includes(printInvoice.status)}
                  onClick={() => {
                    const originalTitle = document.title;
                    document.title = `${printInvoice.legal_name || 'Animator'} - ${printInvoice.invoice_date} - Invoice`;
                    window.print();
                    document.title = originalTitle;
                  }}
                  style={{ opacity: ['Paid', 'Downloaded'].includes(printInvoice.status) ? 1 : 0.5, padding: '10px 24px', background: 'linear-gradient(135deg, #667eea, #764ba2)', color: '#fff', borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14, boxShadow: '0 4px 6px rgba(102, 126, 234, 0.25)' }}
                >
                  {['Paid', 'Downloaded'].includes(printInvoice.status) ? '🖨️ Print / Save PDF' : '🔒 Available after Payment'}
                </button>
              )}
              <button
                onClick={() => setPrintInvoice(null)}
                style={{ padding: '10px 24px', background: '#f1f5f9', color: '#374151', borderRadius: 8, border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      
      {bulkPrintInvoices.length > 0 && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setBulkPrintInvoices([])}
        >
          <style>{`
            @media print {
              .print-hidden { display: none !important; }
              body * { visibility: hidden; }
              #bulk-invoice-print-area, #bulk-invoice-print-area * { visibility: visible; }
              #bulk-invoice-print-area { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; border-radius: 0 !important; overflow: visible !important; height: auto !important; padding: 0 !important; background: white !important;}
              .invoice-page { page-break-after: always; padding: 48px; min-height: 100vh; position: relative; }
              .invoice-page:last-child { page-break-after: auto; }
            }
          `}</style>
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              padding: '24px',
              maxWidth: 850,
              width: '90%',
              maxHeight: '90vh',
              overflowY: 'auto',
              fontFamily: '"Inter", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
              boxShadow: '0 20px 40px rgba(0,0,0,0.1)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4 print-hidden border-b pb-4">
              <h2 className="text-xl font-bold">Bulk Invoice Download ({bulkPrintInvoices.length} Invoices)</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const originalTitle = document.title;
                    document.title = `Invoices_${selectedMonth}`;
                    window.print();
                    document.title = originalTitle;
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700"
                >
                  🖨️ Print / Save All as PDF
                </button>
                <button onClick={() => setBulkPrintInvoices([])} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200">
                  Close
                </button>
              </div>
            </div>

            <div id="bulk-invoice-print-area" style={{ background: '#fff' }}>
              {bulkPrintInvoices.map((inv, idx) => {
                const isDownloaded = inv.status === 'Downloaded';
                let bonusToShow = inv.bonus_amount || 0;
                
                return (
                  <div key={inv.id} className="invoice-page" style={idx > 0 ? { borderTop: '2px dashed #ccc', marginTop: '24px', paddingTop: '24px' } : {}}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start', marginBottom: 32 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 40, fontWeight: 900, color: '#111', letterSpacing: 2, lineHeight: 1 }}>INVOICE</div>
                        <div style={{ fontSize: 15, color: '#667eea', fontWeight: 700, marginTop: 8 }}>#{inv.invoice_number}</div>
                        <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>Date: {inv.invoice_date}</div>
                        <div style={{ fontSize: 13, color: '#888' }}>Period: {inv.month_label}</div>
                      </div>
                    </div>

                    <hr style={{ margin: '24px 0', borderColor: '#f3f4f6', borderWidth: 2 }} />

                    <div style={{ display: 'flex', gap: 40, marginBottom: 32 }}>
                      <div style={{ flex: 1, background: '#f9fafb', padding: 20, borderRadius: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 1 }}>From (Freelancer)</div>
                        <div style={{ fontWeight: 800, fontSize: 16, color: '#111', marginBottom: 4 }}>{inv.legal_name || '—'}</div>
                        <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{inv.artist_address || '—'}</div>
                        <div style={{ fontSize: 13, color: '#4b5563', marginTop: 4 }}><strong>PAN:</strong> {inv.artist_pan || '—'}</div>
                      </div>
                      <div style={{ flex: 1, background: '#f9fafb', padding: 20, borderRadius: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 1 }}>Billed To</div>
                        <div style={{ fontWeight: 800, fontSize: 16, color: '#111', marginBottom: 4 }}>FUTURVERSE ANIMATION PVT LTD</div>
                        <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.5 }}>
                          GSTIN: 07AAGCF2334M1ZJ<br />
                          PAN: AAGCF2334M<br />
                          New Delhi, India
                        </div>
                      </div>
                    </div>

                    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb', marginBottom: 24 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f3f4f6', color: '#374151' }}>
                            {['#', 'Project ID', 'Assigned', 'Approved', 'Seconds', 'Amount (₹)'].map(h => (
                              <th key={h} style={{ padding: '12px 16px', textAlign: h.includes('Amount') || h === 'Seconds' ? 'right' : 'left', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(inv.line_items || []).map((item, i) => {
                            const matchedProj = projects?.find(p => p.Project_ID === item.project_id);
                            const assignedDate = item.assigned_date || matchedProj?.['Date Assigned'] || '—';
                            const approvedDate = item.approved_date || matchedProj?.['Date Approved'] || '—';

                            return (
                              <tr key={i} style={{ background: i % 2 === 0 ? '#ffffff' : '#f9fafb', borderTop: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '12px 16px', fontSize: 13, color: '#6b7280' }}>{i + 1}</td>
                                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#111' }}>
                                  <div>{item.project_id}</div>
                                  <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 400, marginTop: 2 }}>{item.title}</div>
                                </td>
                                <td style={{ padding: '12px 16px', fontSize: 12, color: '#4b5563' }}>{assignedDate}</td>
                                <td style={{ padding: '12px 16px', fontSize: 12, color: '#4b5563' }}>{approvedDate}</td>
                                <td style={{ padding: '12px 16px', fontSize: 13, textAlign: 'right', fontWeight: 500, color: '#374151' }}>{item.seconds || '—'}</td>
                                <td style={{ padding: '12px 16px', fontSize: 13, textAlign: 'right', fontWeight: 600, color: '#111' }}>₹{Number(item.amount || 0).toLocaleString()}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                      <div style={{ width: 320, background: '#f9fafb', padding: 20, borderRadius: 12, border: '1px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14 }}>
                          <span style={{ color: '#4b5563' }}>Gross Total:</span>
                          <span style={{ fontWeight: 700, color: '#111' }}>₹{Math.round(inv.total_amount || 0).toLocaleString()}</span>
                        </div>
                        {bonusToShow > 0 ? (
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14 }}>
                            <span style={{ color: '#4b5563' }}>Bonus:</span>
                            <span style={{ fontWeight: 700, color: '#059669' }}>+₹{Math.round(bonusToShow).toLocaleString()}</span>
                          </div>
                        ) : null}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 14, borderBottom: '1px solid #e5e7eb', marginBottom: 8 }}>
                          <span style={{ color: '#4b5563' }}>TDS @{inv.tds_percent || 10}% (Sec 194J):</span>
                          <span style={{ fontWeight: 600, color: '#dc2626' }}>−₹{Math.round(inv.tds_amount || 0).toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 4px', fontSize: 18, fontWeight: 800, color: '#111' }}>
                          <span>Net Payable:</span>
                          <span style={{ color: '#667eea' }}>₹{Math.round(inv.net_payable || 0).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 32, fontSize: 11, color: '#9ca3af', borderTop: '1px solid #e5e7eb', paddingTop: 16, textAlign: 'center' }}>
                      This is a computer-generated invoice for professional animation services rendered. <br />TDS deducted under Section 194J of the Income Tax Act, 1961. No signature is required.
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Sub-nav + Search */}
      <div className="flex items-center gap-3 flex-wrap justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <button style={tabStyle('pending')} onClick={() => setSection('pending')}>⚠️ Pending Acknowledgement {pendingInvoices.length > 0 && `(${pendingInvoices.length})`}</button>
          <button style={tabStyle('send')} onClick={() => setSection('send')}>📤 Send Invoices</button>
          <button style={tabStyle('done')} onClick={() => setSection('done')}>✅ Acknowledged / Paid</button>
        </div>
        <input
          type="text"
          value={invoiceNameSearch}
          onChange={e => setInvoiceNameSearch(e.target.value)}
          placeholder="🔍 Search by animator name…"
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          style={{ minWidth: 220 }}
        />
      </div>

      {/* Month selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-600">Month:</label>
        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-800 focus:outline-none">
          {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <button onClick={fetchInvoices} className="px-3 py-1.5 text-xs rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">🔄 Refresh</button>
      </div>

      {/* SECTION: Send Invoices */}
      {section === 'send' && (() => {
        const notSentEntries = Object.entries(approvedUnpaidByEid)
          
          .filter(([eid]) => matchesInvoiceSearch(animatorByEid[eid]?.Name || eid))
        return (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-800">📤 Send Invoice Requests</h3>
            <p className="text-sm text-gray-500">Select animators with approved unpaid projects for <strong>{selectedMonth}</strong>. Bot will send invoices to their workspace threads within 2 minutes.</p>
            <div className="space-y-2">
              {notSentEntries.length === 0 ? (
                <p className="text-sm text-gray-400">No animators with approved unpaid projects found for this month (or invoices already sent).</p>
              ) : notSentEntries.map(([eid, projs]) => {
                const anim = animatorByEid[eid]
                return (
                  <div key={eid} className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50">
                    <label key={eid} className="flex flex-1 items-center gap-3 cursor-pointer p-0 m-0">
                      <input type="checkbox" checked={selectedEids.has(eid)}
                        onChange={e => {
                          const s = new Set(selectedEids)
                          e.target.checked ? s.add(eid) : s.delete(eid)
                          setSelectedEids(s)
                        }}
                        className="w-4 h-4 rounded"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-800">{anim?.Name || eid}</span>
                        <span className="ml-2 text-xs text-gray-400">({projs.length} project{projs.length > 1 ? 's' : ''})</span>
                      </div>
                    </label>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); generatePreview(eid); }}
                      className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded hover:bg-indigo-100 transition-colors">
                      Preview
                    </button>
                  </div>
                )
              })}
            </div>
            <button
              disabled={sending || selectedEids.size === 0}
              onClick={() => handleSendInvoices()}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}
            >
              {sending ? 'Creating...' : `📤 Send to ${selectedEids.size} Animator(s)`}
            </button>
          </div>
        )
      })()}

      {/* SECTION: Pending Acknowledgement */}
      {section === 'pending' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-gray-800">⚠️ Pending Acknowledgement — {selectedMonth}</h3>
            {notSentEids.length > 0 && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-lg font-medium">{notSentEids.length} animator(s) not yet sent invoice</span>
            )}
          </div>
          {loading ? <p className="p-6 text-sm text-gray-400">Loading...</p> : pendingInvoices.filter(inv => matchesInvoiceSearch(inv.legal_name || animatorByEid[inv.employee_id]?.Name || inv.employee_id)).length === 0 ? (
            <p className="p-6 text-sm text-gray-400">
              {monthInvoices.length === 0 ? `No invoices have been sent for ${selectedMonth} yet.` : `🎉 All sent invoices for ${selectedMonth} have been acknowledged.`}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs uppercase font-semibold">
                  {['Animator', 'Invoice #', 'Projects', 'Total', 'Status', 'Sent At'].map(h => (
                    <th key={h} className="px-4 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pendingInvoices
                  .filter(inv => matchesInvoiceSearch(inv.legal_name || animatorByEid[inv.employee_id]?.Name || inv.employee_id))
                  .map(inv => (
                  <tr key={inv.id} className="border-b border-gray-50 hover:bg-amber-50/30">
                    <td className="px-4 py-3 font-medium text-gray-800">{inv.legal_name || animatorByEid[inv.employee_id]?.Name || inv.employee_id}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">#{inv.invoice_number}</td>
                    <td className="px-4 py-3 text-gray-600">{(inv.line_items || []).length} project(s)</td>
                    <td className="px-4 py-3 font-medium">₹{Math.round(inv.net_payable || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${inv.status === 'Edit Requested' ? 'bg-orange-100 text-orange-700' :
                        inv.status === 'Awaiting Details' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>{inv.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      <div className="flex items-center gap-2">
                        {inv.sent_at ? new Date(inv.sent_at).toLocaleString('en-IN') : '—'}
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Are you sure you want to delete Invoice #${inv.invoice_number}?`)) return
                            await apiClient.from('invoices').delete().eq('id', inv.id)
                            addToast(`Deleted invoice #${inv.invoice_number}`, 'success')
                            fetchInvoices()
                          }}
                          className="px-2 py-1 bg-red-50 text-red-600 rounded font-semibold hover:bg-red-100 ml-2"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* SECTION: Acknowledged / Paid / Downloaded */}
      {section === 'done' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center"><h3 className="font-bold text-gray-800">✅ Acknowledged / Paid / Downloaded</h3>
            {doneInvoices.filter(inv => ['Paid', 'Downloaded'].includes(inv.status)).length > 0 && (
              <button
                onClick={() => setBulkPrintInvoices(doneInvoices.filter(inv => ['Paid', 'Downloaded'].includes(inv.status)))}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 ml-4"
              >
                📥 Download All (ZIP/PDF)
              </button>
            )}
</div>
          </div>
          {loading ? <p className="p-6 text-sm text-gray-400">Loading...</p> : doneInvoices.length === 0 ? (
            <p className="p-6 text-sm text-gray-400">No acknowledged invoices yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs uppercase font-semibold">
                  {['Animator', 'Invoice #', 'Month', 'Gross', 'TDS', 'Net', 'Status', 'Action'].map(h => (
                    <th key={h} className="px-4 py-3 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {doneInvoices
                  .filter(inv => matchesInvoiceSearch(inv.legal_name || animatorByEid[inv.employee_id]?.Name || inv.employee_id))
                  .map(inv => {
                  const isPaid = ['Paid', 'Downloaded'].includes(inv.status)
                  const isDownloaded = inv.status === 'Downloaded'
                  return (
                    <tr key={inv.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{inv.legal_name || animatorByEid[inv.employee_id]?.Name || inv.employee_id}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">#{inv.invoice_number}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{inv.month_label}</td>
                      <td className="px-4 py-3">₹{Math.round(inv.total_amount || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-red-600">−₹{Math.round(inv.tds_amount || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-700">₹{Math.round(inv.net_payable || 0).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${isDownloaded ? 'bg-gray-100 text-gray-600' :
                          isPaid ? 'bg-emerald-100 text-emerald-700' :
                            'bg-violet-100 text-violet-700'
                          }`}>
                          {isDownloaded ? '✓ Downloaded' : inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isPaid ? (
                            <button
                              onClick={() => handleDownload(inv)}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg shrink-0"
                              style={{ background: isDownloaded ? '#f1f5f9' : 'linear-gradient(135deg,#667eea,#764ba2)', color: isDownloaded ? '#64748b' : '#fff' }}
                            >
                              {isDownloaded ? '🖨️ Re-print' : '📥 Download'}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400 shrink-0">Awaiting payment</span>
                          )}
                          <button
                            onClick={async () => {
                              if (!window.confirm(`Are you sure you want to delete Invoice #${inv.invoice_number}?`)) return
                              await apiClient.from('invoices').delete().eq('id', inv.id)
                              addToast(`Deleted invoice #${inv.invoice_number}`, 'success')
                              fetchInvoices()
                            }}
                            className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded font-semibold hover:bg-red-100 shrink-0"
                            title="Delete Invoice"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

function PayoutCalculatorTab({ animators, projects }: { animators: Animator[]; projects: Project[] }) {
  const { addToast } = useToast()
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [manualMinutes, setManualMinutes] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [expandedAnimators, setExpandedAnimators] = useState<Set<string>>(new Set())
  const [manuallyAddedAnimators, setManuallyAddedAnimators] = useState<Set<string>>(new Set())
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [paidStatus, setPaidStatus] = useState<Record<string, 'Pending' | 'Paid'>>({})
  const [paidNets, setPaidNets] = useState<Record<string, number>>({})
  const [payingId, setPayingId] = useState<string | null>(null)
  
  // Per-animator state for Payout calculation (saved to DB instead of global)
  const [tdsPercents, setTdsPercents] = useState<Record<string, string>>({}) 
  const [bonusAmounts, setBonusAmounts] = useState<Record<string, string>>({})
  const [bonusNotes, setBonusNotes] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  // Month filter
  const monthOptions = (() => {
    const opts: string[] = ['All']
    const now = new Date()
    for (let i = 0; i < 13; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      opts.push(d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }))
    }
    return opts
  })()
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[1]) // default to current month

  // Per-project duration overrides (projectId -> seconds)
  const [durationOverrides, setDurationOverrides] = useState<Record<string, string>>({})
  const [editingDurationId, setEditingDurationId] = useState<string | null>(null)
  // Manually linked projects per animator (empId -> Project[])
  const [manualProjects, setManualProjects] = useState<Record<string, Project[]>>({})
  const [addProjectSearch, setAddProjectSearch] = useState<Record<string, string>>({})
  const [showAddProject, setShowAddProject] = useState<string | null>(null) // empId currently showing the picker
  // Deferred projects excluded from current payout (stays Approved in DB, appears next month)
  const [deferredProjects, setDeferredProjects] = useState<Set<string>>(new Set())
  const deferProject = (projectId: string) => setDeferredProjects(prev => new Set(prev).add(projectId))
  const undeferProject = (projectId: string) => setDeferredProjects(prev => { const s = new Set(prev); s.delete(projectId); return s })

  const toggleExpand = (eid: string) => {
    setExpandedAnimators(prev => {
      const next = new Set(prev)
      next.has(eid) ? next.delete(eid) : next.add(eid)
      return next
    })
  }

  const addManualAnimator = (eid: string) => {
    setManuallyAddedAnimators(prev => new Set(prev).add(eid))
    setShowAddMenu(false)
  }

  const [paidProjectsModal, setPaidProjectsModal] = useState<{ name: string; projects: Project[] } | null>(null)

  const handleMarkPaid = async (eid: string, animatorName: string, net: number, animatorProjects: Project[] = [], bonus: number = 0, tds: number = 0, gross: number = 0, bonusNote: string = "") => {
    setPayingId(eid)
    try {
      const approvedProjects = animatorProjects.filter(p => p.Status === 'Approved')
      const ongoingProjects = animatorProjects.filter(p => !['Approved', 'Paid', 'Closed'].includes(p.Status))

      if (approvedProjects.length === 0 && ongoingProjects.length === 0) {
        addToast(`⚠️ No projects found for ${animatorName}`, 'error')
        setPayingId(null)
        return
      }

      // 1a. Approved projects → Status=Closed + Payment_Status=Paid
      if (approvedProjects.length > 0) {
        const { error: e1 } = await apiClient.from('projects')
          .update({ Payment_Status: 'Paid', Status: 'Closed' })
          .in('Project_ID', approvedProjects.map(p => p.Project_ID).filter(Boolean))
        if (e1) throw new Error(e1.message || 'Failed to update approved projects')
      }

      // 1b. Ongoing/advance projects → only Payment_Status=Paid, Status stays unchanged
      if (ongoingProjects.length > 0) {
        const { error: e2 } = await apiClient.from('projects')
          .update({ Payment_Status: 'Paid' })
          .in('Project_ID', ongoingProjects.map(p => p.Project_ID).filter(Boolean))
        if (e2) throw new Error(e2.message || 'Failed to update ongoing projects')
      }

      const totalPaid = Math.round(net) // net already includes bonus - TDS

      // 2. Mark payments row as Paid + store gross/tds/net, then reset bonus for next cycle
      const { error: payErr } = await apiClient.from('payments').upsert({
        'Employee ID': eid,
        Payment_Status: 'Paid',
        gross: Math.round(gross || 0),
        tds_percent: tds,
        net_paid: totalPaid,
        bonus: bonus > 0 ? bonus : 0,
        bonus_note: bonusNote || null,
        paid_date: formatDate(),
        Timestamp: new Date().toISOString(),
      }, { onConflict: 'Employee ID' })
      if (payErr) {
        console.error('[Mark Paid] payments update failed:', payErr)
        throw new Error('Payments DB update failed: ' + (payErr.message || JSON.stringify(payErr)))
      }

      // 3. Increment total_earnings in animators table
      try {
        const { data: animData } = await apiClient.from('animators')
          .select('total_earnings')
          .eq('Employee_ID', eid)
          .limit(1)
        const existing = Number((animData && animData[0]?.total_earnings) || 0)
        await apiClient.from('animators')
          .update({ total_earnings: existing + totalPaid })
          .eq('Employee_ID', eid)
      } catch (earnErr) {
        console.error('Failed to update total_earnings:', earnErr)
      }

      // 4. Mark the animator's open invoice as Paid
      try {
        await apiClient.from('invoices')
          .update({ status: 'Paid' })
          .eq('employee_id', eid)
          .in('status', ['Sent', 'Acknowledged', 'Edit Requested', 'Awaiting Details'])
      } catch (invErr) {
        console.error('Failed to update invoice status:', invErr)
      }

      // 5. Reset bonus in UI for next cycle
      setBonusAmounts(prev => ({ ...prev, [eid]: '' }))
      setBonusNotes(prev => ({ ...prev, [eid]: '' }))

      // Discord notification logic is handled by agency_bot.py check_dashboard_paid loop now
      setPaidStatus(prev => ({ ...prev, [eid]: 'Paid' as const }))
      setPaidNets(prev => ({ ...prev, [eid]: totalPaid }))
      addToast(`✅ Marked ${animatorName} as Paid${bonus > 0 ? ` + ₹${bonus.toLocaleString()} bonus` : ''} (Bot will notify)`)
    } catch (err: any) {
      addToast(`❌ Failed to mark paid: ${err?.message || 'Unknown error'}`, 'error')
    }
    setPayingId(null)
  }


  // Effect removed: Don't prepopulate paidStatus from DB based on ANY historical paid project.
  // This ensures an animator with a past paid project still shows up for NEW approved projects.
  // paidStatus is now just UI state for the current session's "Mark Paid" clicks.

  useEffect(() => {
    apiClient.from('payments').select('*').then(({ data }: { data: any }) => {
      // Sort to get the latest payment details per animator
      const sorted = ((data as Payment[]) || []).sort((a, b) => {
        const ta = a.Timestamp ? new Date(a.Timestamp).getTime() : 0
        const tb = b.Timestamp ? new Date(b.Timestamp).getTime() : 0
        return tb - ta
      })
      setPayments(sorted)
      setLoading(false)
    })
  }, [])

  // 1. Group latest payment details by Employee ID
  const latestPaymentByEmpId: Record<string, Payment> = {}
  payments.forEach(p => {
    if (p['Employee ID'] && !latestPaymentByEmpId[p['Employee ID']]) {
      latestPaymentByEmpId[p['Employee ID']] = p
    }
  })

  // Initialize TDS/Bonus from latest payment IF not already touched in state
  useEffect(() => {
    if (payments.length > 0) {
      setTdsPercents(prev => {
        const next = { ...prev };
        let changed = false;
        payments.forEach(p => {
          if (p['Employee ID'] && !next[p['Employee ID']]) {
             next[p['Employee ID']] = (p.tds_percent || 0).toString();
             changed = true;
          }
        });
        return changed ? next : prev;
      });
      setBonusAmounts(prev => {
        const next = { ...prev };
        let changed = false;
        payments.forEach(p => {
          const empId = p['Employee ID'];
          if (empId && !next[empId] && next[empId] !== '') {
             const isPaid = p.Payment_Status?.toLowerCase() === 'paid';
             next[empId] = isPaid ? '' : (p.bonus || 0).toString(); // Blank if latest was Paid
             changed = true;
          }
        });
        return changed ? next : prev;
      });
      setBonusNotes(prev => {
        const next = { ...prev };
        let changed = false;
        payments.forEach(p => {
          const empId = p['Employee ID'];
          if (empId && typeof next[empId] === 'undefined') {
             const isPaid = p.Payment_Status?.toLowerCase() === 'paid';
             next[empId] = isPaid ? '' : (p.bonus_note || '');
             changed = true;
          }
        });
        return changed ? next : prev;
      });
    }
  }, [payments]);

  const handleSavePayout = async (eid: string, animatorName: string, gross: number, tdsPct: number, bonus: number, net: number, bonusNote: string) => {
    setSavingId(eid);
    try {
      const now = new Date().toISOString();
      const animator = animators.find(a => a.Employee_ID === eid);

      // Upsert — insert if not exists, update if exists (by Employee ID)
      // Always stamp Timestamp so latest save sorts first on reload
      const { error: upsertErr } = await apiClient.from('payments').upsert({
        'Employee ID': eid,
        Name: animatorName,
        Discord_ID: animator?.Discord_ID || null,
        Discord_Username: animator?.Discord_Username || null,
        Payment_Status: 'Pending',
        gross: Math.round(gross),
        tds_percent: tdsPct,
        net_paid: Math.round(net),
        bonus: bonus,
        bonus_note: bonusNote,
        Timestamp: now,
      }, { onConflict: 'Employee ID' });

      if (upsertErr) {
        addToast(`❌ Could not save payout for ${animatorName}: ${upsertErr.message}`, 'error');
      } else {
        addToast(`✅ Saved payout details for ${animatorName}`);
      }
    } catch (e: any) {
      addToast(`❌ Save failed: ${e.message}`, 'error');
    }
    setSavingId(null);
  };



  // 2. Aggregate approved seconds per animator (Only Approved status — Closed=already paid, skip deferred)
  const approvedSecondsByEmpId: Record<string, number> = {}
  projects.filter(p => 
    p.Status === 'Approved' && 
    !deferredProjects.has(p.Project_ID) &&
    (selectedMonth === 'All' || (p['Date Approved'] || '').includes(selectedMonth))
  ).forEach(p => {
    // Collect all unique Employee IDs for this project (both primary and shared group animators)
    const empIds = new Set<string>()
    if (p.Employee_ID) empIds.add(p.Employee_ID)

    // Check output_history first
    let mappedFromHistory = false
    if (p.output_history && p.output_history.length > 0) {
      p.output_history.forEach(h => {
        if (!approvedSecondsByEmpId[h.empId]) approvedSecondsByEmpId[h.empId] = 0
        approvedSecondsByEmpId[h.empId] += h.seconds
      })
      mappedFromHistory = true
    }

    if (!mappedFromHistory) {
      // Fallback to splitting base duration equally among group members
      const baseSec = parseDurationSec(p.Duration || extractDuration(p.Project_ID) || '0', p.Project_ID)
      const anims = (p.Animator || '').split(',').map(s => s.trim()).filter(Boolean)

      // Match animator names back to Employee_IDs if needed
      anims.forEach(animName => {
        const found = animators.find(a => a.Name.toLowerCase() === animName.toLowerCase())
        if (found) empIds.add(found.Employee_ID)
      })

      const finalEmpIds = Array.from(empIds)
      if (finalEmpIds.length > 0) {
        const splitSec = Math.round(baseSec / finalEmpIds.length)
        finalEmpIds.forEach(eid => {
          if (!approvedSecondsByEmpId[eid]) approvedSecondsByEmpId[eid] = 0
          approvedSecondsByEmpId[eid] += splitSec
        })
      }
    }
  })

  // Add manually linked projects contribution (skip deferred)
  Object.entries(manualProjects).forEach(([eid, projs]) => {
    projs.filter(p => !deferredProjects.has(p.Project_ID)).forEach(p => {
      const overrideStr = durationOverrides[`${eid}__${p.Project_ID}`]
      const secs = overrideStr !== undefined
        ? (parseFloat(overrideStr) || 0)
        : parseDurationSec(p.Duration || '', p.Project_ID)
      if (!approvedSecondsByEmpId[eid]) approvedSecondsByEmpId[eid] = 0
      approvedSecondsByEmpId[eid] += secs
    })
  })

  // Apply per-project duration overrides to auto-detected approved projects
  // For each override key (empId__projectId), subtract the original contribution and add the new value
  Object.entries(durationOverrides).forEach(([key, newSecStr]) => {
    const sep = key.indexOf('__')
    if (sep < 0) return
    const eid = key.slice(0, sep)
    const projectId = key.slice(sep + 2)
    // Only handle auto-detected projects (manual ones are already handled above)
    const isManual = (manualProjects[eid] || []).some(p => p.Project_ID === projectId)
    if (isManual) return
    const proj = projects.find(p => 
      p.Project_ID === projectId && 
      p.Status === 'Approved' && 
      !deferredProjects.has(p.Project_ID) &&
      (selectedMonth === 'All' || (p['Date Approved'] || '').includes(selectedMonth))
    )
    if (!proj) return

    const newSec = parseFloat(newSecStr) || 0

    // Compute original contribution of this project to this emp
    const histEntry = (proj.output_history || []).find((h: any) => h.empId === eid)
    let originalSec: number
    if (histEntry) {
      originalSec = histEntry.seconds || 0
    } else {
      const rawSec = parseDurationSec(proj.Duration || '', proj.Project_ID)
      const empSet = new Set<string>()
      if (proj.Employee_ID) empSet.add(proj.Employee_ID)
        ; (proj.Animator || '').split(',').map((s: string) => s.trim()).filter(Boolean).forEach((name: string) => {
          const found = animators.find(a => a.Name.toLowerCase() === name.toLowerCase())
          if (found) empSet.add(found.Employee_ID)
        })
      originalSec = Math.round(rawSec / Math.max(1, empSet.size))
    }

    // Adjust: remove original, add override
    if (approvedSecondsByEmpId[eid] !== undefined) {
      approvedSecondsByEmpId[eid] = Math.max(0, approvedSecondsByEmpId[eid] - originalSec + newSec)
    }
  })

  // Helper: check if animator has any approved project in the selected month
  const animatorInMonth = (eid: string, animName: string) => {
    if (selectedMonth === 'All') return true
    return projects.some(p =>
      p.Status === 'Approved' &&
      (p.Employee_ID === eid || (p.Animator || '').toLowerCase().includes(animName.toLowerCase())) &&
      (p['Date Approved'] || '').includes(selectedMonth)
    )
  }

  // 3. Build data rows — hide paid (Closed+Paid in DB), filter by month
  const rows = animators
    .filter(a => (approvedSecondsByEmpId[a.Employee_ID] > 0 || manuallyAddedAnimators.has(a.Employee_ID)))
    .filter(a => paidStatus[a.Employee_ID] !== 'Paid')
    .filter(a => animatorInMonth(a.Employee_ID, a.Name))
    .filter(a => !search || a.Name.toLowerCase().includes(search.toLowerCase()) || a.Employee_ID.toLowerCase().includes(search.toLowerCase()))
    .map(a => {
      const eid = a.Employee_ID
      const autoMins = (approvedSecondsByEmpId[eid] || 0) / 60
      const currentMinsStr = manualMinutes[eid] !== undefined ? manualMinutes[eid] : autoMins.toFixed(2)
      const currentMins = parseFloat(currentMinsStr) || 0

      const tdsPct = parseFloat(tdsPercents[eid] || '0') || 0
      const gross = currentMins * 5000
      const bonusParsed = parseFloat(bonusAmounts[eid] || '0') || 0
      const totalAmount = gross + bonusParsed
      const net = totalAmount - (totalAmount * tdsPct / 100)

      const payInfo = latestPaymentByEmpId[eid]

      // Filter this animator's approved projects (exact name match, not substring)
      const animName = animators.find(an => an.Employee_ID === eid)?.Name || ''
      const animatorProjects = [
        ...projects.filter(p =>
          p.Status === 'Approved' &&
          (selectedMonth === 'All' || (p['Date Approved'] || '').includes(selectedMonth)) &&
          (p.Employee_ID === eid ||
            (animName && (p.Animator || '').split(',').map((s: string) => s.trim().toLowerCase()).includes(animName.toLowerCase())))
        ),
        ...(manualProjects[eid] || [])
      ]

      let bankDisplay = <span className="text-gray-400 italic">No details found</span>
      if (payInfo) {
        if (payInfo['UPI ID']) {
          bankDisplay = (
            <div className="flex items-center gap-1">
              <span className="font-semibold text-gray-800">UPI:</span>
              <span className="font-mono text-indigo-600">{payInfo['UPI ID']}</span>
              <CopyButton value={payInfo['UPI ID']} />
            </div>
          )
        } else if (payInfo['Account Number']) {
          bankDisplay = (
            <div className="text-[10px] text-gray-600 space-y-0.5">
              <div className="flex justify-between"><span>A/C:</span> <span className="font-mono font-bold text-gray-800">{payInfo['Account Number']}</span></div>
              <div className="flex justify-between"><span>IFSC:</span> <span className="font-mono">{payInfo['IFSC CODE']}</span></div>
              <div className="flex justify-between"><span>Name:</span> <span>{payInfo['Account Holder Name']}</span></div>
              <div className="flex justify-between"><span>PAN:</span> <span className="font-mono">{payInfo['PAN Number']}</span></div>
            </div>
          )
        }
      }

      return {
        animator: a,
        autoMins,
        currentMinsStr,
        gross,
        net,
        tdsPct,
        bonusAmt: bonusParsed,
        bankDisplay,
        animatorProjects: animatorProjects as Project[]
      }
    })

  const availableToAdd = animators.filter(a => !approvedSecondsByEmpId[a.Employee_ID] && !manuallyAddedAnimators.has(a.Employee_ID))
  // paidRows: animators who have ANY project with Payment_Status='Paid' (both old Status='Paid' and new 'Closed')
  const paidEmpIds = new Set(
    projects
      .filter(p => p.Payment_Status === 'Paid' && (p.Status === 'Closed' || p.Status === 'Paid') && p.Employee_ID)
      .map(p => p.Employee_ID)
  )
  const paidRows = animators.filter(a => paidEmpIds.has(a.Employee_ID) || paidStatus[a.Employee_ID] === 'Paid')

  // For each paid animator, get their paid projects
  const getPaidProjects = (a: Animator) =>
    projects.filter(p =>
      p.Payment_Status === 'Paid' &&
      (p.Status === 'Closed' || p.Status === 'Paid') &&
      (p.Employee_ID === a.Employee_ID ||
        (p.Animator || '').split(',').map(s => s.trim().toLowerCase()).includes(a.Name.toLowerCase()))
    )

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Payout Calculator</h2>
            <p className="text-xs text-gray-500">Calculates payouts based on <b>Approved</b> projects at ₹5000/minute.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none">
              {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="Search by name or ID..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full max-w-sm pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none text-gray-800" />
        </div>

        {loading ? (
          <p className="text-center text-sm text-gray-400 py-10">Loading payment data...</p>
        ) : rows.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-10">No approved projects found for payout.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-gray-50 border-y border-gray-100 text-gray-500 text-xs uppercase font-semibold">
                  <th className="px-4 py-3">Animator</th>
                  <th className="px-4 py-3">Total Minutes</th>
                  <th className="px-4 py-3">Bank / UPI</th>
                  <th className="px-4 py-3 text-right">Gross (₹)</th>
                  <th className="px-4 py-3 text-right">TDS %</th>
                  <th className="px-4 py-3 text-right">Net (₹)</th>
                  <th className="px-4 py-3 text-right">Bonus (₹)</th>
                  <th className="px-4 py-3 text-center">Save / Pay</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <Fragment key={r.animator.Employee_ID}>
                    <tr className={`border-b border-gray-50 hover:bg-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <button onClick={() => toggleExpand(r.animator.Employee_ID)} className="text-gray-400 hover:text-indigo-600 transition-colors">
                            <svg className={`w-5 h-5 transform transition-transform ${expandedAnimators.has(r.animator.Employee_ID) ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
                            {(r.animator.Name || '?')[0]}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800">{r.animator.Name}</p>
                            <p className="text-[10px] text-gray-500">{r.animator.Employee_ID}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={r.currentMinsStr}
                            onChange={e => setManualMinutes(prev => ({ ...prev, [r.animator.Employee_ID]: e.target.value }))}
                            className="w-20 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none font-mono focus:border-indigo-500 transition-colors"
                          />
                          <span className="text-xs text-gray-400">min</span>
                          {r.autoMins > 0 && r.currentMinsStr !== r.autoMins.toFixed(2) && (
                            <span className="text-[10px] text-orange-500 bg-orange-50 px-1.5 rounded" title={`Auto calculated: ${r.autoMins.toFixed(2)} min`}>Modified</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {r.bankDisplay}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-600">
                        ₹{r.gross.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={tdsPercents[r.animator.Employee_ID] ?? ''}
                            onChange={e => setTdsPercents(prev => ({ ...prev, [r.animator.Employee_ID]: e.target.value }))}
                            className="w-14 px-1 py-1 border border-red-300 rounded text-sm focus:outline-none font-mono focus:border-red-500 transition-colors text-right bg-red-50"
                          />
                          <span className="text-xs text-red-400">%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono font-bold text-lg text-emerald-600">
                          ₹{r.net.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-end gap-1">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-400">₹</span>
                            <input
                              type="number"
                              min="0"
                              placeholder="0"
                              value={bonusAmounts[r.animator.Employee_ID] ?? ''}
                              onChange={e => setBonusAmounts(prev => ({ ...prev, [r.animator.Employee_ID]: e.target.value }))}
                              className="w-20 px-2 py-1 border border-amber-300 rounded text-sm focus:outline-none font-mono focus:border-amber-500 transition-colors text-right bg-amber-50"
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex flex-col gap-2 items-center">
                          <button
                            onClick={() => handleSavePayout(r.animator.Employee_ID, r.animator.Name, r.gross, r.tdsPct, r.bonusAmt, r.net, bonusNotes[r.animator.Employee_ID] || '')}
                            disabled={savingId === r.animator.Employee_ID}
                            className="w-full px-2 py-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded transition-all disabled:opacity-50">
                            {savingId === r.animator.Employee_ID ? 'Saving...' : '💾 Save details'}
                          </button>
                          
                          {paidStatus[r.animator.Employee_ID] === 'Paid' ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold w-full justify-center">
                              ✅ Paid
                            </span>
                          ) : (
                            <button
                              onClick={() => handleMarkPaid(r.animator.Employee_ID, r.animator.Name, r.net, r.animatorProjects, r.bonusAmt, r.tdsPct, r.gross, bonusNotes[r.animator.Employee_ID] || '')}
                              disabled={payingId === r.animator.Employee_ID}
                              className="w-full px-3 py-1 text-xs font-semibold text-white rounded-full transition-all disabled:opacity-50"
                              style={{ background: payingId === r.animator.Employee_ID ? '#9ca3af' : 'linear-gradient(135deg, #10b981, #059669)' }}>
                              {payingId === r.animator.Employee_ID ? 'Sending...' : 'Mark Paid / Lock'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedAnimators.has(r.animator.Employee_ID) && (
                      <tr className="bg-gray-50/80">
                        <td colSpan={6} className="px-10 py-4 border-b border-gray-100">
                          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-inner">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-xs font-bold text-gray-700 uppercase">Projects ({r.animatorProjects.length})</h4>
                              <button
                                onClick={() => setShowAddProject(showAddProject === r.animator.Employee_ID ? null : r.animator.Employee_ID)}
                                className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Add Project
                              </button>
                            </div>

                            {/* Add Project search panel */}
                            {showAddProject === r.animator.Employee_ID && (
                              <div className="mb-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl">
                                <input
                                  type="text"
                                  autoFocus
                                  placeholder="Search project name or ID..."
                                  value={addProjectSearch[r.animator.Employee_ID] || ''}
                                  onChange={e => setAddProjectSearch(prev => ({ ...prev, [r.animator.Employee_ID]: e.target.value }))}
                                  className="w-full px-3 py-1.5 text-xs border border-indigo-200 rounded-lg bg-white focus:outline-none mb-2"
                                />
                                <div className="max-h-40 overflow-y-auto space-y-1">
                                  {projects
                                    .filter(p => {
                                      const q = (addProjectSearch[r.animator.Employee_ID] || '').toLowerCase()
                                      if (!q) return true
                                      return (p.Project_title || '').toLowerCase().includes(q) || (p.Project_ID || '').toLowerCase().includes(q)
                                    })
                                    .filter(p => !r.animatorProjects.find(ap => ap.Project_ID === p.Project_ID))
                                    .slice(0, 20)
                                    .map(p => (
                                      <button
                                        key={p.Project_ID}
                                        onClick={() => {
                                          setManualProjects(prev => ({
                                            ...prev,
                                            [r.animator.Employee_ID]: [...(prev[r.animator.Employee_ID] || []), p]
                                          }))
                                          setShowAddProject(null)
                                          setAddProjectSearch(prev => ({ ...prev, [r.animator.Employee_ID]: '' }))
                                        }}
                                        className="w-full text-left flex justify-between items-center px-2 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors">
                                        <div className="min-w-0">
                                          <span className="text-xs text-gray-800 font-medium truncate max-w-[180px] block">{p.Project_title || p.Project_ID}</span>
                                          <span className="text-[9px] text-gray-400 font-mono">{p.Project_ID}</span>
                                        </div>
                                        <span className="text-[10px] text-indigo-600 font-mono flex-shrink-0 ml-2">{formatDurationDisplay(p.Duration, p.Project_ID)}</span>
                                      </button>
                                    ))}
                                </div>
                              </div>
                            )}

                            {r.animatorProjects.length === 0 ? (
                              <p className="text-xs text-gray-500">No projects found. Use Add Project above.</p>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-2">
                                {r.animatorProjects.map((p: Project) => {
                                  const overrideKey = `${r.animator.Employee_ID}__${p.Project_ID}`
                                  const isEditing = editingDurationId === overrideKey
                                  const rawSec = parseDurationSec(p.Duration || '', p.Project_ID)
                                  const displaySec = durationOverrides[overrideKey] !== undefined ? durationOverrides[overrideKey] : String(rawSec)
                                  const isManual = (manualProjects[r.animator.Employee_ID] || []).find(mp => mp.Project_ID === p.Project_ID)
                                  const isDeferred = deferredProjects.has(p.Project_ID)
                                  return (
                                    <div key={p.Project_ID} className={`flex justify-between items-start rounded-lg px-3 py-2 border transition-all ${isDeferred ? 'bg-red-50 border-red-100 opacity-60' : 'bg-gray-50 border-gray-100'}`}>
                                      <div className="min-w-0 pr-3 flex-1">
                                        <div className="flex items-center gap-1 flex-wrap">
                                          <p className={`text-xs font-semibold truncate ${isDeferred ? 'line-through text-gray-400' : 'text-gray-800'}`}>{p.Project_title}</p>
                                          {isManual && <span className="text-[9px] bg-indigo-100 text-indigo-600 px-1 rounded">manual</span>}
                                          {isDeferred && <span className="text-[9px] bg-red-100 text-red-500 px-1 rounded">deferred</span>}
                                        </div>
                                        <p className="text-[10px] text-gray-400 font-mono mt-0.5">{p.Project_ID}</p>
                                      </div>
                                      <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                                        {isDeferred ? (
                                          <button onClick={() => undeferProject(p.Project_ID)}
                                            className="text-[10px] text-indigo-500 hover:text-indigo-700 font-semibold">↩ Undo</button>
                                        ) : (
                                          <>
                                            {isEditing ? (
                                              <div className="flex items-center gap-1">
                                                <input
                                                  type="number"
                                                  autoFocus
                                                  value={displaySec}
                                                  onChange={e => setDurationOverrides(prev => ({ ...prev, [overrideKey]: e.target.value }))}
                                                  onBlur={() => setEditingDurationId(null)}
                                                  onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingDurationId(null) }}
                                                  className="w-16 px-1 py-0.5 text-xs border border-indigo-400 rounded font-mono text-right focus:outline-none"
                                                />
                                                <span className="text-[10px] text-gray-400">sec</span>
                                              </div>
                                            ) : (
                                              <button
                                                onClick={() => setEditingDurationId(overrideKey)}
                                                title="Click to edit duration"
                                                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline underline-offset-2 transition-colors cursor-pointer">
                                                {durationOverrides[overrideKey] !== undefined ? `${durationOverrides[overrideKey]} sec` : formatDurationDisplay(p.Duration, p.Project_ID)}
                                                {durationOverrides[overrideKey] !== undefined && <span className="text-[9px] text-orange-500 ml-1">✎</span>}
                                              </button>
                                            )}
                                            <p className="text-[10px] text-gray-400">{p['Date Approved'] || '—'}</p>
                                            <div className="flex items-center gap-2">
                                              <button onClick={() => deferProject(p.Project_ID)}
                                                className="text-[9px] text-orange-400 hover:text-orange-600 font-semibold">⏸ Defer</button>
                                              {isManual && (
                                                <button
                                                  onClick={() => setManualProjects(prev => ({ ...prev, [r.animator.Employee_ID]: (prev[r.animator.Employee_ID] || []).filter(mp => mp.Project_ID !== p.Project_ID) }))}
                                                  className="text-[9px] text-red-400 hover:text-red-600">✕ remove</button>
                                              )}
                                            </div>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 border-t-2 border-gray-200">
                  <td colSpan={3} className="px-4 py-3 text-sm font-bold text-gray-700 uppercase tracking-wide">Total Pending Payout</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-600 font-semibold">
                    ₹{rows.reduce((s, r) => s + r.gross, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td />
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono font-bold text-xl text-indigo-700">
                      ₹{rows.reduce((s, r) => s + r.net, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-mono font-bold text-amber-600">
                      +₹{rows.reduce((s, r) => s + r.bonusAmt, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Mark Paid info */}
        <div className="mt-4 flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
          <span className="text-lg mt-0.5">💬</span>
          <div className="text-xs text-blue-700">
            <p className="font-bold mb-1">What happens when you click “Mark Paid”?</p>
            <ul className="list-disc list-inside space-y-0.5 text-blue-600">
              <li><b>Supabase DB:</b> Sets <code className="bg-blue-100 px-1 rounded">Payment_Status = Paid</code> on all their Approved projects</li>
              <li><b>Discord:</b> Sends a payment confirmation message to their project thread</li>
              <li><b>Tab:</b> Row moves from this table to the “🟢 Paid” section below</li>
              <li><b>On refresh:</b> Row stays in Paid (persisted in DB)</li>
            </ul>
          </div>
        </div>

        {/* Manual Add Button */}
        <div className="mt-5 border-t border-gray-100 pt-5">
          <div className="relative inline-block">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-sm font-semibold transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Animator Manually
            </button>

            {showAddMenu && (
              <div className="absolute left-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-60 overflow-y-auto">
                {availableToAdd.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-500">All animators already in list.</p>
                ) : (
                  availableToAdd.map(a => (
                    <button
                      key={a.Employee_ID}
                      onClick={() => addManualAnimator(a.Employee_ID)}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0 text-gray-700">
                      {a.Name} <span className="text-xs text-gray-400">({a.Employee_ID})</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Paid History ─────────────────────────────── */}
      {paidRows.length > 0 && (() => {
        const downloadCsv = () => {
          const escCsv = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`
          const headers = ['Month', 'Name', 'Employee ID', 'PAN Number', 'Gross (₹)', 'TDS %', 'TDS Amount (₹)', 'Bonus (₹)', 'Net Payment (₹)']
          const csvRows = paidRows.map(a => {
            const payInfo = latestPaymentByEmpId[a.Employee_ID]
            const storedTds = payInfo?.tds_percent || 0
            const bonus = payInfo?.bonus || 0
            
            const net = paidNets[a.Employee_ID] !== undefined ? paidNets[a.Employee_ID] : (payInfo?.net_paid || 0)
            const gross = net - bonus > 0 ? (net - bonus) / (1 - storedTds / 100) : 0
            const tdsAmt = gross - (net - bonus)
            return [
              escCsv(selectedMonth),
              escCsv(payInfo?.['Account Holder Name'] || a.Name),
              escCsv(a.Employee_ID),
              escCsv(payInfo?.['PAN Number'] || ''),
              escCsv(Math.round(gross)),
              escCsv(storedTds),
              escCsv(Math.round(tdsAmt)),
              escCsv(bonus),
              escCsv(Math.round(net)),
            ].join(',')
          })
          const csv = [headers.map(h => escCsv(h)).join(','), ...csvRows].join('\n')
          const blob = new Blob([csv], { type: 'text/csv' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `payout_${selectedMonth.replace(/ /g, '_')}.csv`
          a.click()
          URL.revokeObjectURL(url)
        }

        return (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            {/* Project List Modal */}
            {paidProjectsModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}>
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                    <div>
                      <h3 className="font-bold text-gray-800">Paid Projects — {paidProjectsModal.name}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">{paidProjectsModal.projects.length} project(s) marked as paid</p>
                    </div>
                    <button onClick={() => setPaidProjectsModal(null)} className="p-2 rounded-xl hover:bg-gray-100 text-gray-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <div className="overflow-y-auto flex-1">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-emerald-50 border-b border-emerald-100 text-emerald-700 text-xs uppercase font-semibold">
                          <th className="px-4 py-2 text-left">Project ID</th>
                          <th className="px-4 py-2 text-left">Title</th>
                          <th className="px-4 py-2 text-left">Date Approved</th>
                          <th className="px-4 py-2 text-right">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paidProjectsModal.projects.map((p, i) => (
                          <tr key={p.Project_ID} className={`border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                            <td className="px-4 py-2 font-mono text-xs text-gray-500">{p.Project_ID}</td>
                            <td className="px-4 py-2 text-xs text-gray-800 max-w-[200px] truncate">{p.Project_title || '—'}</td>
                            <td className="px-4 py-2 text-xs text-gray-500">{p['Date Approved'] || '—'}</td>
                            <td className="px-4 py-2 text-right text-xs font-mono text-indigo-600">{formatDurationDisplay(p.Duration, p.Project_ID)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-800">🟢 Paid — {selectedMonth}</h2>
              <button onClick={downloadCsv}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-emerald-50 border-y border-emerald-100 text-emerald-700 text-xs uppercase font-semibold">
                    <th className="px-3 py-2 text-left">Animator</th>
                    <th className="px-3 py-2 text-left">PAN</th>
                    <th className="px-3 py-2 text-right">Gross (₹)</th>
                    <th className="px-3 py-2 text-right">TDS / Bonus</th>
                    <th className="px-3 py-2 text-right">Net Paid (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {paidRows.map((a, i) => {
                    const payInfo = latestPaymentByEmpId[a.Employee_ID]
                    // Use stored DB values first (persist across refresh), fall back to session paidNets
                    const storedNet = payInfo?.net_paid ?? null
                    const storedGross = payInfo?.gross ?? null
                    const storedTds = payInfo?.tds_percent || 0
                    const storedBonus = payInfo?.bonus || 0
                    
                    const net = storedNet !== null ? storedNet : (paidNets[a.Employee_ID] || 0)
                    const gross = storedGross !== null ? storedGross : ((net - storedBonus > 0) ? (net - storedBonus) / (1 - storedTds / 100) : 0)
                    const tdsAmt = gross - (net - storedBonus)
                    return (
                      <tr key={a.Employee_ID} className={`border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                              {(a.Name || '?')[0]}
                            </div>
                            <div>
                              {/* Clickable name — opens project list modal */}
                              <button
                                onClick={() => {
                                  const animProjects = projects.filter(p =>
                                    p.Status === 'Closed' && p.Payment_Status === 'Paid' &&
                                    (p.Employee_ID === a.Employee_ID ||
                                      (p.Animator || '').split(',').map(s => s.trim().toLowerCase()).includes(a.Name.toLowerCase()))
                                  )
                                  setPaidProjectsModal({ name: payInfo?.['Account Holder Name'] || a.Name, projects: animProjects })
                                }}
                                className="font-semibold text-gray-800 text-xs hover:text-indigo-600 hover:underline transition-colors text-left"
                              >
                                {payInfo?.['Account Holder Name'] || a.Name}
                              </button>
                              <p className="text-[10px] text-gray-400">{a.Employee_ID}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-gray-600">{payInfo?.['PAN Number'] || <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-3 text-right font-mono text-gray-600 text-xs">₹{Math.round(gross).toLocaleString()}</td>
                        <td className="px-3 py-3 text-right font-mono text-xs">
                           <p className="text-red-500">−₹{Math.round(tdsAmt).toLocaleString()} <span className="text-[9px] text-red-300">({storedTds}%)</span></p>
                           {storedBonus > 0 && <p className="text-amber-500 mt-0.5">+₹{Math.round(storedBonus).toLocaleString()} <span className="text-[9px] text-amber-300">(Bonus)</span></p>}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span className="font-mono font-bold text-emerald-600">₹{Math.round(net).toLocaleString()}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-emerald-50">
                    <td colSpan={2} className="px-3 py-2 text-xs font-bold text-emerald-800 uppercase">Total</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-emerald-800 text-xs">
                      ₹{Math.round(paidRows.reduce((s, a) => {
                        const payInfo = latestPaymentByEmpId[a.Employee_ID]
                        const storedTds = payInfo?.tds_percent || 0
                        const bonus = payInfo?.bonus || 0
                        const net = paidNets[a.Employee_ID] !== undefined ? paidNets[a.Employee_ID] : (payInfo?.net_paid || 0)
                        const gross = net - bonus > 0 ? (net - bonus) / (1 - storedTds / 100) : 0
                        return s + gross;
                      }, 0)).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-red-600 text-xs">
                      −₹{Math.round(paidRows.reduce((s, a) => {
                        const payInfo = latestPaymentByEmpId[a.Employee_ID]
                        const storedTds = payInfo?.tds_percent || 0
                        const bonus = payInfo?.bonus || 0
                        const net = paidNets[a.Employee_ID] !== undefined ? paidNets[a.Employee_ID] : (payInfo?.net_paid || 0)
                        const gross = net - bonus > 0 ? (net - bonus) / (1 - storedTds / 100) : 0
                        return s + gross - (net - bonus);
                      }, 0)).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-emerald-800">
                      ₹{Math.round(paidRows.reduce((s, a) => {
                        const payInfo = latestPaymentByEmpId[a.Employee_ID]
                        const net = paidNets[a.Employee_ID] !== undefined ? paidNets[a.Employee_ID] : (payInfo?.net_paid || 0)
                        return s + net;
                      }, 0)).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── DuplicatesTab ───────────────────────────────────────────────────────────

function DuplicatesTab({ projects }: { projects: Project[] }) {
  const activeProjects = projects.filter(p => ['Pending', 'Ongoing', 'Active', 'Review', 'Changes Requested', 'Ready to Render', 'Render QA'].includes(p.Status));
  // Group by ProjectId
  const grouped = new Map<string, Project[]>();
  for (const p of activeProjects) {
    if (!p.Project_ID) continue;
    const pid = p.Project_ID.trim();
    if (!grouped.has(pid)) grouped.set(pid, []);
    grouped.get(pid)!.push(p);
  }

  const duplicates: { projectId: string; rows: Project[] }[] = [];

  for (const [pid, rows] of grouped.entries()) {
    if (rows.length > 1) {
      const threadIds = new Set(rows.map(r => r.Thread_ID ? r.Thread_ID.trim() : null));
      const dates = new Set(rows.map(r => r['Date Assigned'] ? r['Date Assigned'].trim() : null));
      
      if (threadIds.size > 1 || (threadIds.size === 1 && threadIds.has(null)) || dates.size > 1) {
        duplicates.push({ projectId: pid, rows });
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-8">
        <h2 className="text-xl font-bold text-gray-800 mb-2">👯 Duplicate Working Threads</h2>
        <p className="text-sm text-gray-500 mb-6">These active projects have multiple assignment rows that don't share the same Discord Thread (which could indicate accidental duplicate assignments instead of a valid Group Workspace).</p>
        
        {duplicates.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-lg text-emerald-600 font-semibold mb-1">✅ No duplicate threads found!</p>
            <p className="text-sm text-gray-400">All assignments look clean.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {duplicates.map(dup => (
              <div key={dup.projectId} className="border border-red-100 rounded-xl overflow-hidden bg-red-50/20">
                <div className="bg-red-50 px-4 py-3 border-b border-red-100 flex items-center justify-between">
                  <h3 className="font-bold text-red-800">{dup.projectId} <span className="text-red-500 font-normal ml-2">({dup.rows[0].Project_title || 'No Title'})</span></h3>
                  <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-1 rounded-full">{dup.rows.length} records</span>
                </div>
                <div className="p-4 overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-gray-200">
                        <th className="pb-2">Animator</th>
                        <th className="pb-2 text-center">Status</th>
                        <th className="pb-2 text-center">Date Assigned</th>
                        <th className="pb-2 text-right">Discord Thread ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dup.rows.map((row, i) => (
                        <tr key={i} className="border-b border-gray-50 last:border-0">
                          <td className="py-2.5 font-medium text-gray-800">{row.Animator || 'Unassigned'} <span className="text-[10px] text-gray-400 font-mono ml-1">({row.Employee_ID})</span></td>
                          <td className="py-2.5 text-center">
                            <span className="px-2 py-1 text-[10px] font-semibold bg-gray-100 text-gray-600 rounded-full">{row.Status}</span>
                          </td>
                          <td className="py-2.5 text-center text-xs text-gray-500">{row['Date Assigned'] || '—'}</td>
                          <td className="py-2.5 text-right font-mono text-xs text-gray-500">{row.Thread_ID || <span className="text-red-400 italic">null</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ManagerDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<DashboardUser | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [projects, setProjects] = useState<Project[]>([])
  const [animators, setAnimators] = useState<Animator[]>([])
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('tfa_user')
    if (!stored) { router.push('/'); return }
    setUser(JSON.parse(stored))
  }, [router])

  const fetchData = useCallback(async () => {
    if (!user) return
    setLoading(true)
    let query = apiClient.from('projects').select('*')
    // Removing the explicit assigned_head filter here so Head can view all projects in Analytics
    const [{ data: pData }, { data: aData }] = await Promise.all([
      query,
      apiClient.from('animators').select('*'),
    ])
    setProjects((pData as Project[]) || [])
    setAnimators((aData as Animator[]) || [])
    setLoading(false)
  }, [user])

  useEffect(() => { if (user) fetchData() }, [user, fetchData])

  const handleLogout = () => { localStorage.removeItem('tfa_user'); router.push('/') }

  if (!user) return null

  // In this system: role='manager' = Head user, role='head' = Manager user
  const isHead = user.role === 'manager'
  // managerOnly:true = show ONLY to Head (manager role)
  const TABS = ALL_TABS.filter(t => !t.managerOnly || isHead)

  const SidebarContent = () => (
    <>
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 flex items-center justify-center flex-shrink-0">
            <img
              src="/logo.png"
              alt="Logo"
              className="w-full h-full object-contain drop-shadow-md"
              onError={(e) => {
                e.currentTarget.src = 'https://ui-avatars.com/api/?name=TFA&background=667eea&color=fff&rounded=true';
              }}
            />
          </div>
          <div>
            <p className="font-bold text-gray-800 text-sm">TFA Dashboard</p>
            <p className="text-xs" style={{ color: isHead ? '#7e22ce' : '#94a3b8' }}>{isHead ? '👑 Head' : 'Manager'}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSidebarOpen(false) }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={{ backgroundColor: activeTab === tab.id ? '#f0f0ff' : 'transparent', color: activeTab === tab.id ? '#667eea' : '#64748b' }}>
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)' }}>
            {(user.full_name || user.email)[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{user.full_name || user.email}</p>
            <p className="text-xs" style={{ color: isHead ? '#7e22ce' : '#94a3b8' }}>{isHead ? '👑 Head' : 'Manager'}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="w-full py-2 rounded-lg text-xs font-medium text-red-500 border border-red-200 hover:bg-red-50">Sign out</button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 w-64 flex-col bg-white border-r border-gray-100 shadow-sm hidden lg:flex">
        <SidebarContent />
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black bg-opacity-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Mobile Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 w-64 flex flex-col bg-white border-r border-gray-100 shadow-lg lg:hidden transition-transform"
        style={{ transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)' }}>
        <div className="p-5 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <span className="font-bold text-gray-800">TFA Dashboard</span>
          <button onClick={() => setSidebarOpen(false)} className="text-gray-400 text-xl">✕</button>
        </div>
        <SidebarContent />
      </aside>

      {/* Main */}
      <main className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-lg hover:bg-gray-100">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div>
              <h1 className="font-bold text-gray-800">{TABS.find(t => t.id === activeTab)?.label}</h1>
              <p className="text-xs text-gray-400">{formatDate()}</p>
            </div>
          </div>
          <button onClick={fetchData} className="p-2 rounded-lg hover:bg-gray-100 transition-colors" title="Refresh">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 p-4 lg:p-6">
          {loading ? (
            <div className="flex items-center justify-center py-32">
              <div className="text-center">
                <svg className="animate-spin h-8 w-8 mx-auto mb-3" style={{ color: '#667eea' }} fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-gray-400 text-sm">Loading data...</p>
              </div>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && <OverviewTab projects={projects} animators={animators} />}
              {activeTab === 'assign' && <AssignTab projects={projects} animators={animators} onRefresh={fetchData} />}
              {activeTab === 'duplicates' && <DuplicatesTab projects={projects} />}
              {activeTab === 'bank' && <ProjectsTab projects={projects} onRefresh={fetchData} user={user} />}
              {activeTab === 'team' && <TeamTab animators={animators} projects={projects} user={user} onRefresh={fetchData} />}
              {activeTab === 'create' && <CreateProjectTab onRefresh={fetchData} projects={projects} />}
              {activeTab === 'submissions' && <FormSubmissionsTab animators={animators} userRole={user.role} userLead={user.full_name} />}
              {activeTab === 'analytics' && <AnalyticsTab projects={projects} animators={animators} />}
              {activeTab === 'payments' && <PaymentsTab animators={animators} projects={projects} />}
              {activeTab === 'payouts' && <PayoutCalculatorTab animators={animators} projects={projects} />}
              {activeTab === 'invoices' && <InvoicesTab animators={animators} projects={projects} />}
              {activeTab === 'notes' && <NotesTab user={user} />}
              {activeTab === 'budget' && <BudgetTrackerTab projects={projects} onRefresh={fetchData} />}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

