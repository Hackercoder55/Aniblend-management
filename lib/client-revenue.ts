import { amount, paise, projectRevenue, today, type Wallet } from './finance'
export type ClientRule = { client: string; basis: 'minute' | 'video'; rate: number }
export function clientRules(input: unknown): ClientRule[] {
 if (!Array.isArray(input) || !input.length || input.length>100) throw new Error('Add at least one client rate')
 const seen=new Set<string>()
 return input.map(row=>{
  const client=String(row.client||'').trim().toLowerCase()
  if (!/^[a-z0-9_-]{1,40}$/.test(client)||seen.has(client)) throw new Error('Use a unique client code for each row')
  if (!['minute','video'].includes(row.basis)) throw new Error('Choose per minute or per video')
  seen.add(client);return {client,basis:row.basis,rate:amount(row.rate,'Client rate',1000000)}
 })
}
export function revenueProjects(wallet: Wallet, scope: string) {
 if(scope==='current')return wallet.projects.filter(p=>!p.cycleId&&!p.legacy)
 const cycle=wallet.cycles?.find(c=>c.id===scope&&!c.imported)
 if(!cycle)throw new Error('Choose the current cycle or a saved cashout')
 return wallet.projects.filter(p=>p.cycleId===cycle.id)
}
export function previewClientRevenue(wallet: Wallet, input: unknown, scope: string) {
 const rules=clientRules(input),projects=revenueProjects(wallet,scope)
 return rules.map(rule=>{
  const matching=projects.filter(p=>p.client.toLowerCase()===rule.client),editable=matching.filter(p=>!p.manualRevenue)
  const before=matching.reduce((sum,p)=>sum+projectRevenue(wallet,p),0)
  const after=matching.reduce((sum,p)=>sum+(p.manualRevenue?projectRevenue(wallet,p):paise(rule.basis==='video'?rule.rate:p.seconds*rule.rate/60)),0)
  return {...rule,count:matching.length,seconds:matching.reduce((sum,p)=>sum+p.seconds,0),before,after,change:after-before,teamCost:matching.reduce((sum,p)=>sum+p.obligations.reduce((s,o)=>s+o.gross+o.extra,0),0),manual:matching.length-editable.length}
 })
}
export function applyClientRevenue(wallet: Wallet, input: unknown, scope: string, requestId: string) {
 const rules=clientRules(input),projects=revenueProjects(wallet,scope)
 // Validate the entire batch before changing any settings or records.
 const updates=projects.filter(p=>!p.manualRevenue).flatMap(p=>{
  const rule=rules.find(r=>r.client===p.client.toLowerCase());if(!rule)return []
  const revenue=paise(rule.basis==='video'?rule.rate:p.seconds*rule.rate/60)
  const receipts=wallet.entries.filter(e=>e.kind==='receipt'&&e.projectId===p.id).reduce((sum,e)=>sum+e.amount,0)
  if(receipts>revenue)throw new Error('Project '+p.id+': new revenue is below recorded client receipts. Review the receipt first.')
  return [{p,rule,revenue,before:projectRevenue(wallet,p)}]
 })
 for(const rule of rules){
  wallet.settings.clientFlatRates??={}
  if(rule.basis==='video'){wallet.settings.clientFlatRates[rule.client]=rule.rate;delete wallet.settings.clientRates[rule.client]}
  else {wallet.settings.clientRates[rule.client]=rule.rate;delete wallet.settings.clientFlatRates[rule.client]}
 }
 let changed=0
 for(const {p,rule,revenue,before} of updates){
  if(p.cycleId){
   if(revenue===before)continue
   wallet.revenueCorrections??=[]
   wallet.revenueCorrections.push({id:requestId+':'+p.id,requestId,date:today(),projectId:p.id,cycleId:p.cycleId,from:before,to:revenue,basis:rule.basis,rate:rule.rate})
  }else{
   p.clientRate=p.seconds?revenue/100*60/p.seconds:0
   p.revenue=revenue
   p.issues=p.issues.filter(issue=>!issue.startsWith('Client rate'))
   if(revenue===before)continue
  }
  changed++
 }
 return {changed,delta:updates.reduce((sum,u)=>sum+u.revenue-u.before,0)}
}
