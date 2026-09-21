// Explicit, one-time initialization of an EMPTY wallet. Never alters legacy statuses or receipts.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), assert = require('node:assert/strict');
require('dotenv').config({path:path.join(__dirname,'../.env.local'),quiet:true});
const ts=require('typescript'), {createClient}=require('@supabase/supabase-js');
const filename=path.join(__dirname,'../lib/finance.ts'), mod=new Module(filename);
mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const f=mod.exports, db=createClient(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
async function rows(table,select='*'){const all=[];for(let start=0;;start+=1000){const r=await db.from(table).select(select).order('id').range(start,start+999);if(r.error)throw Error(table+': '+r.error.message);all.push(...r.data);if(r.data.length<1000)return all;}}
(async()=>{
 const cycleStart=process.argv.find(x=>x.startsWith('--cycle-start='))?.slice(14); if(!cycleStart)throw Error('Pass --cycle-start=YYYY-MM-DD; add --apply only after reviewing the dry run.');
 const [saved,projects,rawArtists,rates,payments,leads]=await Promise.all([db.from('finance_wallet').select('revision,data').eq('id',1).single(),rows('projects'),rows('animators','id,Employee_ID,Name,Discord_ID'),rows('client_rates'),rows('payments','id,"Employee ID","Project ID",Name,Payment_Status,gross,net_paid,bonus,others_amount,Timestamp'),rows('leads','id,Head_Name,Discord_ID,Employee_ID')]);
 if(saved.error)throw Error(saved.error.message);
 const artists=rawArtists.map(a=>({...a,aliases:leads.filter(l=>l.Employee_ID&&l.Employee_ID===a.Employee_ID||l.Discord_ID&&l.Discord_ID===a.Discord_ID).map(l=>l.Head_Name).filter(Boolean)}));
 const wallet=structuredClone(saved.data.data), oldSettings=structuredClone(wallet.settings);
 const report=f.reconcileLegacy(wallet,projects,artists,rates,payments,cycleStart);
 console.log(JSON.stringify({mode:process.argv.includes('--apply')?'apply':'dry-run',cycleStart,expectedRevision:saved.data.revision,...report,totals:f.summarize(wallet,'all'),issues:wallet.projects.filter(p=>p.date>=cycleStart&&p.issues.length).map(p=>({id:p.id,issues:p.issues}))},null,2));
 if(!process.argv.includes('--apply'))return;
 wallet.audit.push({id:require('node:crypto').randomUUID(),date:new Date().toISOString(),actor:'User-requested September account reconciliation',action:'reconcile_legacy',detail:JSON.stringify({cycleStart,report,previousSettings:oldSettings})});
 // No payment object, no source project closures and no receipt entries: only the wallet JSON is saved.
 assert.equal(wallet.settlements.length,0);assert.equal(wallet.entries.some(e=>e.kind==='receipt'),false);
 const result=await db.rpc('commit_finance_wallet',{expected_revision:saved.data.revision,wallet_data:wallet,payment_data:null,closed_project_ids:[]});if(result.error)throw Error(result.error.message);
 const verified=await db.from('finance_wallet').select('revision,data').eq('id',1).single();if(verified.error)throw Error(verified.error.message);assert.equal(verified.data.revision,result.data);assert.deepEqual(verified.data.data,wallet);
 const [afterProjects,afterPayments]=await Promise.all([rows('projects'),rows('payments','id,"Employee ID","Project ID",Name,Payment_Status,gross,net_paid,bonus,others_amount,Timestamp')]);assert.deepEqual(afterProjects,projects,'Source project rows changed during verification');assert.deepEqual(afterPayments,payments,'Payment records changed during verification');
 console.log('VERIFIED: wallet saved; every source project field and selected payment field unchanged.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
