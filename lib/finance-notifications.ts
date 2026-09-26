import { createHash } from 'node:crypto'
import type { Settlement } from './finance'

type DestinationProject = { Project_ID: string; Thread_ID?: string }
type DestinationArtist = { Employee_ID: string; invoice_thread_id?: string; Channel_ID?: string }
export type Notice = { id: string; settlement_id: string; employee_id: string; project_id: string; channel_id: string; content: string; status: string; message_id?: string; last_error?: string; attempted_at?: string }
const rupees = (n: number) => (n / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const safe = (s: string) => s.replace(/[@*_`~<>]/g, '').slice(0, 150)
export function paymentNotices(payment: Settlement, projects: DestinationProject[], artist?: DestinationArtist) {
 const ids = [...new Set(payment.lines.map(l => l.projectId))]
 const targets = ids.length ? ids.map(id => ({ projectId: id, channelId: projects.find(p => p.Project_ID === id)?.Thread_ID || '' })) : [{ projectId: '', channelId: artist?.invoice_thread_id || artist?.Channel_ID || '' }]
 return targets.map(target => {
   const lines = payment.lines.filter(l => l.projectId === target.projectId)
   const key = payment.id + ':' + (target.projectId || 'bonus')
   const reference = 'PAY-' + createHash('sha256').update(key).digest('hex').slice(0,20)
   return { id: reference, projectId: target.projectId, channelId: target.channelId,
     content: '**ARTIST PAYMENT RECORDED**\nArtist: ' + safe(payment.name) + '\n' + (target.projectId ? 'Project: ' + safe(target.projectId) + '\nWork: ' + lines.map(l => safe(l.role)).join(', ') + '\nThis project: ₹' + rupees(lines.reduce((n,l) => n+l.gross+l.extra,0)) + '\n\n' : '') +
       '**Payment receipt (whole batch: ' + ids.length + ' projects)**\nGross: ₹' + rupees(payment.gross) + '\nBonus: ₹' + rupees(payment.bonus) + '\nOther pay / project extras: ₹' + rupees(payment.others) + '\nTDS withheld: ₹' + rupees(payment.tds) + '\n**Net recorded paid: ₹' + rupees(payment.net) + '**\nDate: ' + payment.date + '\nReference: ' + reference + '\nReceipt: ' + payment.id + '\nThis receipt covers this artist only; other team members may still be unpaid.' }
 })
}
export async function dispatchNotice(db: any, id: string, options: { token?: string; fetcher?: typeof fetch } = {}) {
 const { data: claimed, error } = await db.rpc('claim_finance_notification', { notice_id: id })
 if (error) throw new Error(error.message)
 const job = claimed?.[0] as Notice | undefined
 if (!job) return
 const save = async (values: Record<string, unknown>) => { const result = await db.from('finance_notifications').update({ ...values, updated_at: new Date().toISOString() }).eq('id',id); if(result.error) throw new Error(result.error.message) }
 const token = options.token ?? process.env.DISCORD_BOT_TOKEN ?? process.env.NEXT_PUBLIC_DISCORD_BOT_TOKEN
 if (!token || !/^\d{15,22}$/.test(job.channel_id)) { await save({ status:'failed', last_error: !token ? 'Bot token is not configured on the server.' : 'Destination thread is missing. Update the artist/project Discord destination and retry.' }); return }
 const fetcher = options.fetcher || fetch
 let response: Response
 try {
   response = await fetcher('https://discord.com/api/v10/channels/' + job.channel_id + '/messages', { method:'POST', headers:{Authorization:'Bot '+token,'Content-Type':'application/json'}, body:JSON.stringify({content:job.content,nonce:job.id,enforce_nonce:true,allowed_mentions:{parse:[]}}), signal:AbortSignal.timeout(12000) })
 } catch {
   await save({status:'unknown',last_error:'Connection interrupted. Check delivery before retrying; payment remains saved.'});return
 }
 if (!response.ok) {
   const body = await response.json().catch(()=>({}))
   // A server error can be ambiguous; never blindly retry an uncertain delivery.
   await save({next_attempt_at:response.status===429?new Date(Date.now()+Math.ceil(Number(body.retry_after)||5)*1000).toISOString():null,status:response.status>=500?'unknown':'failed',last_error:response.status===429?'Discord rate limit. Retry after '+Math.ceil(Number(body.retry_after)||5)+' seconds.': 'Discord HTTP '+response.status+': '+String(body.message||'Delivery failed').slice(0,200) });return
 }
 const message = await response.json().catch(()=>null)
 if (!message?.id) { await save({status:'unknown',last_error:'Discord response incomplete; verify delivery before retry.'});return }
 await save({status:'sent',message_id:message.id,last_error:null})
}
// Recover a response lost after Discord accepted the message. No new message is sent here.
export async function verifyNotice(db: any, job: Notice, options: { token?: string; fetcher?: typeof fetch } = {}) {
 const token=options.token ?? process.env.DISCORD_BOT_TOKEN ?? process.env.NEXT_PUBLIC_DISCORD_BOT_TOKEN
 const fetcher=options.fetcher || fetch
 if (!token || !/^\d{15,22}$/.test(job.channel_id)) throw new Error('Valid Discord destination and bot token required')
 if (job.status==='sending' && Date.now()-new Date(job.attempted_at||'').getTime()<60000) throw new Error('Message is still being sent. Refresh shortly.')
 const identity=await fetcher('https://discord.com/api/v10/users/@me',{headers:{Authorization:'Bot '+token},signal:AbortSignal.timeout(12000)})
 if(!identity.ok) throw new Error('Could not verify bot identity. Payment remains saved.')
 const bot=await identity.json()
 let before = ''
 for(let page=0;page<10;page++) {
   const res=await fetcher('https://discord.com/api/v10/channels/'+job.channel_id+'/messages?limit=100'+(before?'&before='+before:''),{headers:{Authorization:'Bot '+token},signal:AbortSignal.timeout(12000)})
   if(!res.ok) throw new Error('Cannot verify Discord delivery (HTTP '+res.status+'). Payment remains saved.')
   const messages=await res.json()
   const found=messages.find((m:any)=>m.author?.id===bot.id && m.content===job.content)
   if(found) { const saved=await db.from('finance_notifications').update({status:'sent',message_id:found.id,last_error:null}).eq('id',job.id);if(saved.error)throw new Error(saved.error.message);return }
   if(messages.length<100 || new Date(messages.at(-1).timestamp).getTime()<new Date(job.attempted_at||0).getTime()-60000) break
   before=messages.at(-1).id
 }
 throw new Error('Delivery is uncertain; no matching receipt was found. Check the thread manually. No duplicate message was sent.')
}
