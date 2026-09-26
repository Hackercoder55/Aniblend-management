# AniBlend wallet setup

Before running the migration, verify a restorable Supabase backup. A local JSON export of table rows is an additional data copy, not a complete schema/storage backup. Do not bypass an editor warning without reviewing the exact updated SQL.

1. Open the Supabase project used by this dashboard. In SQL Editor, run the complete contents of `migrations/001_finance_wallet.sql` once. It is transactional and can be rerun. It creates the private wallet table and the atomic save function; existing project/payment data is not deleted.
2. Start/redeploy this updated dashboard, then sign out and sign in again as the **Head / manager role**. The new finance API requires a signed, HTTP-only session cookie. The existing local browser login alone is not sufficient.
3. Open **Profit & Wallet → Rates & settings**. Set the actual client rate, channel overrides, team rates, lead fee and withholding percentage. Fresh ledgers use the former base team rates (full ₹4,000/min, animation ₹2,500/min, lighting ₹1,500/min); previously saved rates and snapshots are never overwritten. New ledgers copy saved client_rates including fixed prices; the client rate intentionally starts unset. A zero withholding percentage is supported.
4. Import completed projects. Once default, client-specific or fixed client prices have been saved, newly approved projects are also imported when the wallet loads or refreshes. Imported project amounts are frozen until explicitly edited/recalculated.
5. Review historical estimates and imported pending bonus/other adjustments before the first cashout. The old records did not reliably preserve per-person, per-project settlements. Historical projects are never made payable again automatically. Original paid payment records are available under **Wallet history → Earlier payment records** and are not counted again as new cash movement.
6. Add real client receipts, client bonuses, operating expenses and an opening balance if needed. Existing `client_paid_date` values alone are not treated as proof of an exact historical receipt amount.

## Daily use

- **Team payouts:** saved draft bonuses, other amounts, withholding and notes are shared with profit. Untick work to defer it. Select **Review payment → Mark Paid** only after making the actual payment. The dashboard records payment; it does not transfer money.
- Mark Paid records the artist transfer. Paid projects stay in Current cycle until Cashout paid projects is confirmed. Each animator, lighting artist and lead has their own obligation. Paying one person leaves other team members payable. The project is marked paid only after all its wallet obligations are settled.
- Mark Paid writes the wallet receipt, legacy payments row, paid invoice, employee total earnings and eligible project statuses in one database transaction. Revision checks prevent simultaneous edits from overwriting each other. Retries of the same request do not duplicate a payout.
- **Bonus-only payout:** add an adjustment for a team member even when they have no current project work.
- **Profit overview:** earned project revenue stays present after cashout. Team cost includes gross pay (including withheld tax), project extras, saved bonuses and other pay. Cash is shown separately from operating profit.
- **Client receipts:** increase cash, reduce client balance due and update the client-paid date when fully received. They do not close team payouts. Extra client money should be recorded as a client bonus.
- **Month change:** the selected report month changes; unpaid work and unpaid saved adjustments carry forward. Mark Paid consumes the selected work and saved adjustments once. Revenue and base costs stay in their recognition month; saved adjustments keep their original accounting month.
- **Rate changes:** affect future imports. Use **Recalculate unpaid projects** to explicitly replace amounts for completely unpaid projects. This refreshes source details and overwrites manual project cost edits. Partially/fully settled projects stay locked. Correct source data in Projects before recalculating missing team/duration information.
- **Corrections:** manual money entries can be reversed with a reason. The original remains in history. Settlements cannot be silently edited or deleted through the wallet.
- **History:** payout receipt breakdowns, manual entries, corrections, change log and CSV export.

## Important boundaries

- Pre-wallet project costs are labelled **historical estimates**. Review them against the displayed original payments/invoices; there is not enough consistent legacy data to reconstruct exact allocations automatically. Payouts after migration use saved snapshots.
- Imported pending bonuses/other pay need review because old bonuses may already include lead fees or project extras. Save each imported draft after checking it; cashout is blocked until reviewed.
- Recorded cash starts from wallet entries, not from the studio's bank balance. Opening funds and actual receipts need to be entered. Client bonuses are recorded as money received.
- Tax withheld is included in gross team cost and is not extra profit. Use a withdrawal entry to record remittance of an amount already withheld; do not book the same amount as another operating expense.
- Existing invoice generation tools outside the wallet remain available for the old workflow. Wallet payments generate their own immutable amount snapshots with `W-` invoice references; do not issue a duplicate invoice for the same payment.
- No live database migration or payment was executed during implementation. The SQL migration must be run before the new wallet can load. The automated checks used synthetic data and a temporary local PostgreSQL-compatible database.

## Verification

`npm run test:finance` runs financial regression tests, including revenue preservation, shared projects, carry-forward, zero withholding, duplicate requests, frozen rates, standalone bonuses and imported-adjustment review.

The migration was tested for rerun safety, atomic payment/invoice/project saves, transaction rollback, stale revision rejection and private table/function permissions. Browser tests covered desktop/mobile layout, save/reload, cashout, history and the absence of horizontal page overflow.

The default development bundler failed to resolve Tailwind in this Windows folder. Development/build scripts use Next's supported webpack mode, which was used for the preview checks.

Repeatable checks: `npm run test:finance:db` uses an isolated local PostgreSQL runtime (no network/database credentials). For browser checks, start `npm run dev -- --port 3100`, then run `npm run test:finance:ui`; all API data is mocked. Screenshots are written to `tests/artifacts/`.

Migration safety check: the revised SQL contains no DROP TRIGGER statements. It adds missing protection triggers and stops on a conflicting existing trigger. Tests compare every row and field in populated projects, animators, payments and invoices before/after initial installation and reruns, and verify existing wallet records survive reruns. INSERT/UPDATE statements inside the defined function run only when that function is later called by the app, not during installation. Supabase may still show a generic warning for schema changes or function definitions; this is not a backup or a guarantee against unrelated production issues.

## Compatibility with the latest dashboard

Profit Tracker and Payout Calculator now open the same wallet ledger. Profit & Wallet remains an alias. The superseded Profit Tracker owner-split cashout has been removed from the UI; artists are paid from Team payouts. Previous Payouts and historical Cashout Reports remain accessible. No old project, payment or cashout record is deleted.

- Profit Tracker defaults to Current cycle, containing both approved and paid work. Fully settled projects appear as Paid · ready for cashout; only explicit Cashout moves them to Cashed out / history. A partially paid shared project stays pending until its other obligations are settled.
- Approved through is an inclusive date cutoff (e.g. 2026-09-05). Team payout confirmation enforces this cutoff on the server and stores it with the receipt. Future work stays pending.
- Lifetime revenue stays visible independently of pending-list filters. Already paid, still owed and cash after remaining team dues are shown separately. The latter uses only recorded wallet cash and excludes any separate unpaid tax liability; opening balances and legacy reconciliation still matter.
- Client flat prices and fixed production fees can be saved in Rates & settings. Fresh fixed fees match the old calculator: HN ₹3,000, WN ₹4,000, INFI ₹5,000; lead fee is separate. MRC uses the full-production rate; GLEE defaults to its client revenue unless overridden. Existing saved settings and settled snapshots are preserved.
- Source projects marked paid outside the wallet are excluded from new payouts on sync when no wallet settlement exists. They remain historical estimates, without invented cash receipts or payout transactions.
- The two-step cycle change uses migration 001. The later Discord receipt update below additionally requires migration 002.

## Two-step cycle close and September reconciliation

- Mark Paid records an artist payment and invoice. It does not close the cycle. Other artists on a shared project remain payable.
- Cashout paid projects previews only fully paid, unarchived projects through the chosen date. Confirm cashout saves a cycle receipt with project IDs, revenue and costs. It creates no payment, expense, revenue subtraction or bank transfer. Revenue/profit/cash totals are unchanged. Approved and partly paid work remain current.
- Cycle history is available in Wallet history and Cashout Reports. The original profit-share reports remain under Earlier profit-share reports.
- For an empty wallet, Load existing accounts uses existing client rates and a chosen cycle start. Paid projects approved before that date are classified as historical; all unpaid work remains current regardless of old SHARE markers. Original source rows are not changed. Repeat reconciliation is rejected once accounts exist.
- The read-only September 22 inspection found 36 projects approved on/after September 5: 25 pending and 11 closed/paid-marked. 24 pending projects had erroneous old cashout markers. The reviewed reconciliation keeps all 36 current and makes only the 11 paid projects eligible for Cashout.
- Employee IDs appearing as Discord IDs and abbreviated lead names are resolved using existing animator/lead identity mappings, never fuzzy name guesses.
- Earlier aggregate artist transfers remain visible as original records; no project allocation or historical bank balance is invented. Imported project costs remain estimates. The current PT project lacks a saved client rate and is explicitly flagged; revenue/profit are incomplete until corrected.
- The maintenance script defaults to read-only preview: node scripts/reconcile-profit-wallet.cjs --cycle-start=2026-09-05. --apply uses the wallet revision check, refuses a non-empty wallet and verifies source projects and payment fields remain unchanged. No new SQL migration is required.

September 22 execution: applied the reviewed reconciliation to wallet revision 0 and verified the saved result. 160 projects were imported; 36 remain current (11 paid, 25 pending) and 124 earlier paid projects are classified in history. Every original project field and the selected payment fields compared equal before/after the save. No source project status, receipt, payment, invoice or bank transfer was changed by this operation. PT client pricing remains unresolved and visibly flagged.

## September 27: payment messages and two-partner profit

1. Deploy this dashboard update, then run the complete migrations/002_payment_notifications.sql in the same Supabase SQL Editor. Migration 001 must already be installed. This adds a private receipt delivery queue and replaces the existing save function; it does not delete or rewrite existing financial rows during installation. Repeat installation is supported. Until setup is complete, the updated dashboard blocks Mark Paid to avoid losing notification records.
2. Configure DISCORD_BOT_TOKEN on the dashboard server using the existing bot token. Do not put the token in client code or a public environment variable. Local configuration is present, but hosting configuration must also contain the token. The bot needs permission to view and send messages in the destination threads.
3. Open Payout Calculator → Team payouts. Choose Approved through, review each artist's selected work, bonus, other pay and withholding, then Save draft → Review payment → Mark Paid. Only record a payment after actually paying the artist. This does not transfer money.
4. The same database transaction saves the immutable payment and its message queue. Each selected project's thread receives that artist's saved receipt with the project subtotal and clearly labelled whole-batch gross, bonus, other pay, withholding and net. Bonus-only receipts go to the saved invoice thread, otherwise the artist's workspace channel. No new invoice thread is created.
5. Discord payment receipts shows Sent, Queued, Message failed or Delivery needs verification. Retry message retries a definite rejection only; it never repeats a payment. Check delivery searches for this bot's exact saved receipt after an uncertain connection. If no receipt can be verified, the UI does not blindly resend. Failed destinations can be corrected in the existing project/artist records, then retried.
6. The first three messages are attempted immediately. Remaining queued messages are dispatched in batches while this dashboard is open. The queue survives refresh and resumes when the dashboard is reopened; this update does not install a separate background worker. Definite failures require Retry message.
7. Rates & settings contains named client/employee rate rows, fixed project prices, team fees, default withholding, two partner names and Partner 1 share %. Partner 2 receives the remainder. Default split is 50/50. Profit allocation uses earned revenue plus client bonuses, less team costs, saved artist bonuses/other pay and business expenses. It is an allocation of operating profit, not a bank transfer or proof that clients have paid. Changing the split applies to the selected report; historical partner allocation snapshots are not created.
8. Mark Paid keeps paid projects in Current cycle. Cashout paid projects moves only fully paid work into history; unpaid teammates keep a shared project current. Cashout never decreases lifetime earned revenue, profit or cash. Existing financial rows and original records remain intact.

A missing client rate still flags incomplete revenue/profit. It does not block an artist payment when the artist's own cost is known. GLEE cost that depends on a missing client rate remains blocked. Settled team costs cannot be edited; client revenue may be corrected before cycle close, with recorded receipts and the change log preserved.

The save function records paid_at only when a project is fully paid. This suppresses the old Python bot's duplicate scan, which otherwise guesses amounts from the latest payment. The dashboard sends through the existing Discord bot account; the old thread archive timers still apply. No Python deployment is required for receipt sending.

Validation uses synthetic database data and mocked Discord/browser requests. No real artist payment or Discord test message was sent. Migration 002 has not been applied to production by this implementation; the owner runs the supplied SQL. Test commands include npm run test:finance:notifications, test:finance, test:finance:db and test:finance:ui.
