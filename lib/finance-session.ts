import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export const SESSION_COOKIE = 'aniblend_session'
export function adminClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Database configuration missing')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}
function signature(payload: string) {
  const secret = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('Session configuration missing')
  return createHmac('sha256', secret).update(payload).digest('base64url')
}
export function createSession(id: string) {
  const payload = Buffer.from(JSON.stringify({ id, expires: Date.now() + 12 * 60 * 60 * 1000 })).toString('base64url')
  return `${payload}.${signature(payload)}`
}
export async function requireFinanceManager() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value || ''
  const [payload, signed] = token.split('.')
  if (!payload || !signed) throw new Error('AUTH_REQUIRED')
  const expected = signature(payload)
  if (signed.length !== expected.length || !timingSafeEqual(Buffer.from(signed), Buffer.from(expected))) throw new Error('AUTH_REQUIRED')
  const session = JSON.parse(Buffer.from(payload, 'base64url').toString())
  if (!session.id || session.expires < Date.now()) throw new Error('AUTH_REQUIRED')
  const db = adminClient()
  const { data, error } = await db.from('dashboard_users').select('id, role, full_name').eq('id', session.id).single()
  if (error || !data || data.role !== 'manager') throw new Error('AUTH_REQUIRED')
  return { db, actor: `${data.full_name || 'Manager'} (${data.id})` }
}
