const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'lib/finance.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = new Module(filename); mod._compile(compiled, filename);
const f = mod.exports;
const artists = [{ Employee_ID: 'A01', Name: 'Asha' }, { Employee_ID: 'L01', Name: 'Lalit' }, { Employee_ID: 'M01', Name: 'Meera' }];
const project = { Project_ID: '001_90_demo', Project_title: 'Sample', Duration: '1 min 30 sec', Status: 'Approved', Employee_ID: 'A01', Animator: 'Asha', Lighting_Artist: 'Lalit', Lead: 'Meera', 'Date Approved': '2026-01-15' };
function fixture() { const w = f.emptyWallet(); w.settings.clientRate = 10000; w.settings.animationRate = 3000; w.settings.lightingRate = 2000; f.syncProjects(w, [project], artists); return w; }

test('duration parsing handles mixed units, clocks, decimals and ID fallback', () => { assert.equal(f.duration('1 min 30 sec'), 90); assert.equal(f.duration('1:30'), 90); assert.equal(f.duration('01:02:03'), 3723); assert.equal(f.duration('1.5 min'), 90); assert.equal(f.duration('', '12_80_demo'), 80); assert.equal(f.duration('bad'), 0); });
test('split animation, lighting and lead costs are independent', () => { const w = fixture(); assert.equal(w.projects[0].revenue, 1500000); assert.deepEqual(w.projects[0].obligations.map(o => o.gross), [450000, 300000, 100000]); });
test('cashout removes only selected employee work and preserves revenue and accrued profit', () => { const w = fixture(); const before = f.summarize(w, 'all'); const keys = f.pending(w, '2026-02').filter(l => l.employeeId === 'A01').map(l => l.key); const s = f.settle(w, 'A01', keys, '2026-02', 'request-1', 'settlement-1'); assert.equal(s.net, 405000); assert.equal(f.pending(w, '2026-02').length, 2); assert.equal(f.summarize(w, 'all').revenue, before.revenue); assert.equal(f.summarize(w, 'all').profit, before.profit); assert.equal(f.summarize(w, 'all').cashPaid, 405000); });
test('cashout retries are idempotent and a different request cannot repay settled work', () => { const w = fixture(); const keys = [w.projects[0].obligations[0].key]; const a = f.settle(w, 'A01', keys, '2026-02', 'request-1', 'settlement-1'); assert.equal(f.settle(w, 'A01', keys, '2026-02', 'request-1', 'ignored'), a); assert.equal(w.settlements.length, 1); assert.throws(() => f.settle(w, 'A01', keys, '2026-02', 'request-2', 'settlement-2'), /already paid/); });
test('zero TDS, saved bonuses and others are included once before and after settlement', () => { const w = fixture(); w.drafts['2026-02:A01'] = { tdsPercent: 0, bonus: 300, others: 200, note: 'Extra' }; const before = f.summarize(w, 'all').profit; const s = f.settle(w, 'A01', [w.projects[0].obligations[0].key], '2026-02', 'r', 's'); assert.equal(s.net, 500000); assert.equal(s.tds, 0); assert.equal(w.drafts['2026-02:A01'], undefined); assert.equal(f.summarize(w, 'all').profit, before); });
test('saved project extras do not duplicate when paid', () => { const w = f.emptyWallet(); w.settings.clientRate = 10000; f.syncProjects(w, [{ ...project, Bonus: 200, Other_Payment: 100 }], artists); const before = f.summarize(w, 'all').profit; f.settle(w, 'A01', [w.projects[0].obligations[0].key], '2026-02', 'r', 's'); assert.equal(f.summarize(w, 'all').profit, before); });
test('unpaid work carries forward while recognition stays in its original month', () => { const w = fixture(); assert.equal(f.pending(w, '2025-12').length, 0); assert.equal(f.pending(w, '2026-02').length, 3); assert.equal(f.summarize(w, '2026-01').revenue, 1500000); assert.equal(f.summarize(w, '2026-02').revenue, 0); });
test('rate edits never rewrite imported or settled snapshots', () => { const w = fixture(); w.settings.clientRate = 20000; w.settings.animationRate = 1; assert.deepEqual(f.syncProjects(w, [project, project], artists), []); assert.equal(w.projects[0].revenue, 1500000); assert.equal(w.projects[0].obligations[0].gross, 450000); });
test('shared artists use contribution history, not full duration for every person', () => { const w = f.emptyWallet(); f.syncProjects(w, [{ ...project, Lighting_Artist: '', Lead: '', output_history: [{ empId: 'A01', seconds: 20 }, { empId: 'A01', seconds: 10 }, { empId: 'L01', seconds: 60 }] }], artists); assert.deepEqual(w.projects[0].obligations.map(o => o.seconds), [30, 60]); });
test('legacy paid projects contribute revenue but never become payable again', () => { const w = f.emptyWallet(); w.settings.clientRate = 10000; f.syncProjects(w, [{ ...project, Status: 'Closed', Payment_Status: 'Closed' }], artists); assert.equal(w.projects[0].legacy, true); assert.equal(f.pending(w, '2026-02').length, 0); assert.equal(f.summarize(w, 'all').revenue, 1500000); });
test('client-paid project remains payable to team', () => { const w = f.emptyWallet(); f.syncProjects(w, [{ ...project, Status: 'Paid', Payment_Status: 'Client Paid' }], artists); assert.equal(w.projects[0].legacy, false); assert.equal(f.pending(w, '2026-02').length, 3); });
test('receipts affect cash only, client bonus and expenses affect profit', () => { const w = fixture(); const base = f.summarize(w, 'all').profit; for (const [kind, amount] of [['receipt', 500000], ['client_bonus', 100000], ['expense', 20000], ['withdrawal', 10000]]) w.entries.push({ id: kind, requestId: kind, kind, date: '2026-02-01', amount, note: kind, projectId: project.Project_ID }); const s = f.summarize(w, 'all'); assert.equal(s.profit, base + 80000); assert.equal(s.cash, 570000); assert.equal(s.outstanding, 1000000); });
test('missing approval details block payment instead of silently fabricating an exact amount', () => { const w = f.emptyWallet(); f.syncProjects(w, [{ ...project, 'Date Approved': '' }], artists); assert.throws(() => f.settle(w, 'A01', [w.projects[0].obligations[0].key], f.today().slice(0,7), 'r', 's'), /Resolve project/); });
test('invalid and negative values are rejected, valid zero is preserved', () => { for (const n of [NaN, Infinity, -1, null, '', true]) assert.throws(() => f.amount(n)); assert.equal(f.amount(0), 0); assert.throws(() => f.validateSettings({ ...f.defaults, tdsPercent: 101 })); });
test('prior-month bonuses carry forward and keep their original profit month after cashout', () => { const w=fixture(); w.drafts['2026-01:A01']={bonus:100,others:200,tdsPercent:0,note:'January'}; w.drafts['2026-02:A01']={bonus:50,others:0,tdsPercent:0,note:'February'}; const jan=f.summarize(w,'2026-01').profit, feb=f.summarize(w,'2026-02').profit; const s=f.settle(w,'A01',[w.projects[0].obligations[0].key],'2026-02','r','s'); assert.equal(s.net,485000); assert.equal(Object.keys(w.drafts).length,0); assert.equal(f.summarize(w,'2026-01').profit,jan); assert.equal(f.summarize(w,'2026-02').profit,feb); });
test('standalone bonus payments persist without inventing a project', () => { const w=f.emptyWallet(); w.drafts['2026-02:A01']={bonus:100,others:50,tdsPercent:10,note:'Reward',employeeName:'Asha'}; const s=f.settle(w,'A01',[],'2026-02','r','s'); assert.equal(s.net,15000); assert.equal(s.name,'Asha'); assert.equal(w.projects.length,0); assert.equal(s.tds,0); });
test('imported adjustments must be reviewed before payout', () => { const w=f.emptyWallet(); w.drafts['2026-02:A01']={bonus:100,others:0,tdsPercent:0,note:'Old',needsReview:true}; assert.throws(()=>f.settle(w,'A01',[],'2026-02','r','s'),/Review and save/); });

test('fresh defaults match the existing payout calculator; wallets do not share mutable settings', () => {
  const a=f.emptyWallet(), b=f.emptyWallet(); assert.deepEqual([a.settings.fullRate,a.settings.animationRate,a.settings.lightingRate],[4000,2500,1500]);
  a.settings.clientFlatRates.hn=6600; a.settings.teamProjectRates.hn=1; assert.equal(b.settings.clientFlatRates.hn,undefined); assert.equal(b.settings.teamProjectRates.hn,3000);
});
test('approval cutoff includes September 5 and defers September 6; server rejects later work', () => {
  const w=fixture(); w.projects[0].date='2025-09-05'; const later=structuredClone(w.projects[0]); later.id='later'; later.date='2025-09-06'; later.obligations= later.obligations.map(o=>({...o,key:'later-'+o.key})); w.projects.push(later);
  assert.equal(f.pending(w,'2025-09','2025-09-05').length,3);
  assert.throws(()=>f.settle(w,'A01',[later.obligations[0].key],'2025-09','cutoff-later','invalid','2025-09-05'),/changed or already paid/);
  const s=f.settle(w,'A01',[w.projects[0].obligations[0].key],'2025-09','cutoff-ok','valid','2025-09-05'); assert.equal(s.cutoff,'2025-09-05'); assert.equal(f.pending(w,'2025-09','2025-09-06').length,5);
});
test('Indian approval dates are unambiguous and invalid dates are rejected',()=> { assert.equal(f.dateKey('05/09/2026'),'2026-09-05'); assert.equal(f.dateKey('31/02/2026'),''); });
test('fixed client and team prices match legacy HN and MRC pricing',()=> {
  const w=f.emptyWallet(); w.settings.clientFlatRates.hn=6600; w.settings.clientRates.mrc=7000;
  const hn=f.snapshot({...project,Project_ID:'batch_120_extra_HN',Duration:'120 sec'},artists,w.settings);
  assert.equal(hn.client,'hn'); assert.equal(hn.revenue,660000); assert.deepEqual(hn.obligations.map(o=>o.gross),[300000,100000]);
  const mrc=f.snapshot({...project,Project_ID:'1_60_MRC',Duration:'60 sec'},artists,w.settings); assert.deepEqual(mrc.obligations.map(o=>o.gross),[400000,100000]);
});
test('paid source marks remove stale unpaid work without changing revenue or recording fake cash',()=> {
  const w=fixture(), before=f.summarize(w,'all'); f.syncProjects(w,[{...project,Payment_Status:'Paid'}],artists);
  assert.equal(f.pending(w,'2026-02').length,0); assert.equal(f.summarize(w,'all').revenue,before.revenue); assert.equal(w.settlements.length,0); assert.equal(w.projects[0].legacy,true);
});
test('remaining team dues clear per artist; cashout does not reduce earned revenue or profit',()=> {
  const w=fixture(); w.drafts['2026-02:A01']={bonus:500,others:100,tdsPercent:0,note:''}; const before=f.summarize(w,'all');
  const s=f.settle(w,'A01',[w.projects[0].obligations[0].key],'2026-02','remaining','remaining'); const after=f.summarize(w,'all');
  assert.equal(after.unpaidTeamCost,before.unpaidTeamCost-s.net); assert.equal(after.profit,before.profit); assert.equal(after.revenue,before.revenue); assert.equal(after.cash,before.cash-s.net);
});

test('Mark Paid and Cashout are independent; unpaid projects survive every cycle close',()=> {
 const w=fixture(), second=structuredClone(w.projects[0]); second.id='unpaid';second.obligations=second.obligations.map(o=>({...o,key:'unpaid-'+o.key}));w.projects.push(second);
 const originalRevenue=f.summarize(w,'all').revenue;
 for(const role of w.projects[0].obligations) f.settle(w,role.employeeId,[role.key],'2026-02','pay-'+role.key,'paid-'+role.key);
 assert.equal(f.currentCycleProjects(w).length,2,'Mark Paid must not archive');assert.equal(f.teamPaid(w.projects[0]),true);assert.equal(f.teamPaid(second),false);
 const before=structuredClone(w), totals=f.summarize(w,'all');
 assert.throws(()=>f.closeCycle(w,[second.id],f.today(),'bad','bad'),/Only fully paid/);assert.deepEqual(w,before);
 const cycle=f.closeCycle(w,[w.projects[0].id],f.today(),'cycle-request','cycle-1');
 assert.deepEqual(f.currentCycleProjects(w).map(p=>p.id),['unpaid']); assert.equal(w.projects.length,2);assert.equal(w.settlements.length,before.settlements.length);assert.deepEqual(f.summarize(w,'all'),totals);assert.equal(totals.revenue,originalRevenue);
 assert.equal(f.closeCycle(w,[w.projects[0].id],f.today(),'cycle-request','ignored'),cycle);assert.equal(w.cycles.length,1);
 assert.throws(()=>f.closeCycle(w,[w.projects[0].id],f.today(),'new-request','new-cycle'),/Only fully paid/);
 const next=structuredClone(second);next.id='next';next.obligations=next.obligations.map(o=>({...o,key:'next-'+o.key}));w.projects.push(next);assert.deepEqual(f.currentCycleProjects(w).map(p=>p.id),['unpaid','next']);
});
test('partly paid projects cannot be cashed out; mixed selections are atomic',()=> {
 const w=fixture();f.settle(w,'A01',[w.projects[0].obligations[0].key],'2026-02','partial','partial');const before=structuredClone(w);
 assert.throws(()=>f.closeCycle(w,[w.projects[0].id],f.today(),'close','close'),/Only fully paid/);assert.deepEqual(w,before);
});
test('September reconciliation ignores broken cashout markers on unpaid work and preserves source records',()=> {
 const sources=[{...project,Project_ID:'recent_60_her','Date Approved':'05 Sep 2026',client_paid_date:'null___SHARE_OLD___SHARE_AGAIN',Payment_Status:'Pending'}, {...project,Project_ID:'recent-paid_60_her','Date Approved':'06 Sep 2026',Status:'Closed',Payment_Status:'Closed'}, {...project,Project_ID:'old-paid_60_her','Date Approved':'04 Sep 2026',Status:'Closed',Payment_Status:'Closed'}, {...project,Project_ID:'old-unpaid_60_her','Date Approved':'04 Sep 2026',Payment_Status:'Pending'}, {...project,Project_ID:'new_60_PT','Date Approved':'07 Sep 2026',Payment_Status:'Pending'}];
 const original=structuredClone(sources),w=f.emptyWallet();const info=f.reconcileLegacy(w,sources,artists,[{client_code:'HER',rate_inr:6000,rate_type:'per_minute'}],[],'2026-09-05');
 assert.equal(info.current,4);assert.equal(info.ready,1);assert.equal(info.unpaid,3);assert.equal(w.projects.length,5);assert.equal(w.settlements.length,0);assert.equal(w.cycles.length,1);assert.deepEqual(sources,original);assert.deepEqual(info.missingRates,['new_60_PT']);
 assert.throws(()=>f.reconcileLegacy(w,sources,artists,[],[],'2026-09-05'),/not empty/);
});

test('Discord contributor IDs and lead aliases map to existing employees without duplicate costs',()=> {
 const roster=[{Employee_ID:'A01',Name:'Artist',Discord_ID:'111'},{Employee_ID:'M01',Name:'Bidyut Das',Discord_ID:'222',aliases:['Bidyut']}];
 const p={...project,Employee_ID:'111',Animator:'Artist',Lighting_Artist:'',Lead:'Bidyut',output_history:[{empId:'111',seconds:90}]};
 const w=f.emptyWallet();w.settings.clientRate=6000;f.syncProjects(w,[p],roster);assert.deepEqual(w.projects[0].obligations.map(o=>o.employeeId),['A01','M01']);assert.deepEqual(w.projects[0].issues,[]);
});
