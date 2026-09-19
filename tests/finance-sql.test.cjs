const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
 const db = new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create table payments(id bigserial primary key, "Employee ID" text, "Name" text, "Project ID" text, "Payment_Status" text, gross numeric, tds_percent numeric, net_paid numeric, bonus numeric, bonus_note text, others_amount numeric, paid_date text, "Timestamp" timestamptz);
 create table animators(id bigserial primary key, "Employee_ID" text, total_earnings numeric);
 create table projects(id bigserial primary key, "Project_ID" text, "Payment_Status" text, "Status" text, client_paid_date text);
 create table invoices(id bigserial primary key, invoice_number text, employee_id text not null, legal_name text, month_label text, invoice_date text, line_items jsonb, total_amount numeric, bonus_amount numeric, others_amount numeric, tds_percent numeric, tds_amount numeric, net_payable numeric, status text);
 insert into animators("Employee_ID",total_earnings) values ('A01',100);
 insert into projects("Project_ID","Status",client_paid_date) values ('P1','Approved','2026-01-01');`);
 const sql = fs.readFileSync(require('node:path').join(__dirname, '../migrations/001_finance_wallet.sql'), 'utf8');
 await db.exec(`insert into payments(id,"Employee ID","Project ID",net_paid,"Timestamp") values(900,'LEGACY','Old project',345.67,'2025-01-01T00:00:00Z');
 insert into invoices(id,employee_id,invoice_number,total_amount,net_payable) values(900,'LEGACY','OLD-900',400,345.67);`);
 const snapshotLegacy = async () => {
   const result={};
   for(const table of ['projects','animators','payments','invoices']) result[table]=(await db.query('select * from '+table+' order by id')).rows;
   return result;
 };
 const legacyBefore=await snapshotLegacy();
 await db.exec(sql);
 assert.deepEqual(await snapshotLegacy(),legacyBefore,'First migration must preserve every existing row and field');
 await db.exec(sql);
 assert.deepEqual(await snapshotLegacy(),legacyBefore,'Rerun must preserve every existing row and field');
 // Remove only synthetic legacy fixtures before the separate cashout tests.
 await db.exec('delete from payments where id=900; delete from invoices where id=900');
 await db.query('insert into finance_wallet(id,revision,data) values(1,0,$1)', [JSON.stringify({version:1})]);
 const payment = { id:'test-1',employeeId:'A01',name:'Asha',date:'2026-02-01',month:'2026-02',gross:100000,bonus:10000,others:5000,tds:10000,net:105000,note:'Test',lines:[{projectId:'P1',title:'Sample',role:'Animation',seconds:60,rate:1000,gross:100000,extra:0}] };
 const commit = (revision, p=payment) => db.query('select commit_finance_wallet($1,$2,$3,$4)', [revision,JSON.stringify({version:1,settlements:[p],projects:[{id:'P1',obligations:[{settlementId:'test-1'}]}]}),JSON.stringify(p),['P1']]);
 await commit(0);
 assert.equal((await db.query('select revision from finance_wallet')).rows[0].revision, 1);
 assert.equal(Number((await db.query('select net_paid from payments')).rows[0].net_paid), 1050);
 assert.equal(Number((await db.query('select total_earnings from animators')).rows[0].total_earnings), 1150);
 assert.equal((await db.query('select client_paid_date from projects')).rows[0].client_paid_date, '2026-01-01');
 assert.equal((await db.query('select count(*)::int as n from invoices')).rows[0].n, 1);
 assert.equal((await db.query('select month_label from invoices')).rows[0].month_label, 'Feb 2026');
 await assert.rejects(commit(0), /WALLET_CONFLICT/);
 assert.equal((await db.query('select count(*)::int as n from payments')).rows[0].n, 1);
 // Force failure after the payment and earnings updates: entire transaction must roll back.
 await db.exec(`alter table invoices add constraint prevent_test_failure check (invoice_number <> 'W-fail');`);
 await assert.rejects(commit(1, {...payment,id:'fail'}), /prevent_test_failure/);
 assert.equal((await db.query('select revision from finance_wallet')).rows[0].revision, 1);
 assert.equal((await db.query('select count(*)::int as n from payments')).rows[0].n, 1);
 assert.equal(Number((await db.query('select total_earnings from animators')).rows[0].total_earnings), 1150);
 assert.equal((await db.query(`select has_function_privilege('anon','commit_finance_wallet(bigint,jsonb,jsonb,text[])','EXECUTE') as allowed`)).rows[0].allowed, false);
 assert.equal((await db.query(`select has_table_privilege('anon','finance_wallet','SELECT') as allowed`)).rows[0].allowed, false);
 await assert.rejects(db.exec('update invoices set total_amount=0'), /financial amounts are locked/);
 await assert.rejects(db.exec('delete from payments'), /cannot be deleted/);
 await db.exec("update invoices set status='Downloaded'");
 const received={version:1,projects:[{id:'P1',revenue:100000,obligations:[{settlementId:'test-1'}]}],entries:[{kind:'receipt',projectId:'P1',amount:100000,date:'2026-03-01'}]};
 await db.query('select commit_finance_wallet($1,$2,null,$3)',[1,JSON.stringify(received),[]]);
 assert.equal((await db.query('select client_paid_date from projects')).rows[0].client_paid_date,'2026-03-01');
 assert.equal((await db.query('select "Status" from projects')).rows[0].Status,'Paid');
 received.entries.push({kind:'receipt',projectId:'P1',amount:-100000,date:'2026-03-02'});
 await db.query('select commit_finance_wallet($1,$2,null,$3)',[2,JSON.stringify(received),[]]);
 assert.equal((await db.query('select client_paid_date from projects')).rows[0].client_paid_date,null);
 const walletBefore=(await db.query('select * from finance_wallet')).rows;
 const rowsBeforeRerun=await snapshotLegacy();
 await db.exec(sql);
 assert.deepEqual((await db.query('select * from finance_wallet')).rows,walletBefore,'Existing wallet data must survive migration rerun');
 assert.deepEqual(await snapshotLegacy(),rowsBeforeRerun,'Existing paid receipts must survive migration rerun');
 console.log('PASS: all original fields preserved in four populated tables; existing wallet and paid receipts preserved on rerun.');
 console.log('PASS: migration rerun, payment + invoice + project atomicity, rollback, revision conflict, preserved client dates and denied anonymous access.');
 await db.close();
})().catch(e=>{console.error(e);process.exit(1)});


