import { NextResponse } from 'next/server'
import { requireFinanceManager } from '@/lib/finance-session'
import { dispatchNotice, verifyNotice } from '@/lib/finance-notifications'
export const maxDuration = 60
export async function POST(request: Request) {
 try {
  if(request.headers.get('origin') && request.headers.get('origin')!==new URL(request.url).origin) throw new Error('Invalid origin')
  const {db}=await requireFinanceManager(), body=await request.json()
  if(body.action==='retry' || body.action==='verify') {
   const {data:job,error}=await db.from('finance_notifications').select('*').eq('id',String(body.id)).single()
   if(error || !job)throw new Error('Receipt message not found')
   if(body.action==='verify') await verifyNotice(db,job)
   else if(['pending','failed'].includes(job.status)) {
    const source=job.project_id ? await db.from('projects').select('Thread_ID').eq('Project_ID',job.project_id).single() : await db.from('animators').select('invoice_thread_id,Channel_ID').eq('Employee_ID',job.employee_id).single()
    const dest=source.data as any
    if(source.error)throw new Error('Could not read saved Discord destination')
    const channel=job.project_id?dest?.Thread_ID:dest?.invoice_thread_id||dest?.Channel_ID
    const update=await db.from('finance_notifications').update({channel_id:String(channel||'')}).eq('id',job.id).in('status',['pending','failed']);if(update.error)throw update.error
    await dispatchNotice(db,job.id)
   }
  } else if(body.action==='dispatch') {
   const {data:jobs,error}=await db.from('finance_notifications').select('id').eq('status','pending').order('created_at').limit(3)
   if(error)throw error
   await Promise.allSettled((jobs||[]).map(j=>dispatchNotice(db,j.id)))
  } else if (body.action !== 'status') throw new Error('Invalid message action')
  const {data,error}=await db.from('finance_notifications').select('id,settlement_id,employee_id,project_id,channel_id,status,message_id,last_error,attempted_at').order('created_at',{ascending:false}).limit(1000)
  if(error)throw error
  return NextResponse.json({notifications:data})
 } catch(e:any){ return NextResponse.json({error:e.message==='AUTH_REQUIRED'?'Sign in again as manager.':e.message},{status:e.message==='AUTH_REQUIRED'?401:400}) }
}
