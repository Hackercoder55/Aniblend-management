# AniBlend wallet setup

Before running the migration, verify a restorable Supabase backup. A local JSON export of table rows is an additional data copy, not a complete schema/storage backup. Do not bypass an editor warning without reviewing the exact updated SQL.

1. Open the Supabase project used by this dashboard. In SQL Editor, run the complete contents of `migrations/001_finance_wallet.sql` once. It is transactional and can be rerun. It creates the private wallet table and the atomic save function; existing project/payment data is not deleted.
2. Start/redeploy this updated dashboard, then sign out and sign in again as the **Head / manager role**. The new finance API requires a signed, HTTP-only session cookie. The existing local browser login alone is not sufficient.
3. Open **Profit & Wallet → Rates & settings**. Set the actual client rate, channel overrides, team rates, lead fee and withholding percentage. Defaults preserve the former team rates; the client rate intentionally starts unset. A zero withholding percentage is supported.
4. Import completed projects. Once a default client rate has been saved, newly approved projects are also imported when the wallet loads or refreshes. Imported project amounts are frozen until explicitly edited/recalculated.
5. Review historical estimates and imported pending bonus/other adjustments before the first cashout. The old records did not reliably preserve per-person, per-project settlements. Historical projects are never made payable again automatically. Original paid payment records are available under **Wallet history → Earlier payment records** and are not counted again as new cash movement.
6. Add real client receipts, client bonuses, operating expenses and an opening balance if needed. Existing `client_paid_date` values alone are not treated as proof of an exact historical receipt amount.

## Daily use

- **Team payouts:** saved draft bonuses, other amounts, withholding and notes are shared with profit. Untick work to defer it. Select **Review cashout → Record cashout** only after making the actual payment. The dashboard records payment; it does not transfer money.
- Each animator, lighting artist and lead has their own obligation. Paying one person leaves other team members payable. The project is marked paid only after all its wallet obligations are settled.
- Cashout writes the wallet receipt, legacy payments row, paid invoice, employee total earnings and eligible project statuses in one database transaction. Revision checks prevent simultaneous edits from overwriting each other. Retries of the same request do not duplicate a payout.
- **Bonus-only payout:** add an adjustment for a team member even when they have no current project work.
- **Profit overview:** earned project revenue stays present after cashout. Team cost includes gross pay (including withheld tax), project extras, saved bonuses and other pay. Cash is shown separately from operating profit.
- **Client receipts:** increase cash, reduce client balance due and update the client-paid date when fully received. They do not close team payouts. Extra client money should be recorded as a client bonus.
- **Month change:** the selected report month changes; unpaid work and unpaid saved adjustments carry forward. Cashout consumes the selected work and saved adjustments once. Revenue and base costs stay in their recognition month; saved adjustments keep their original accounting month.
- **Rate changes:** affect future imports. Use **Recalculate unpaid projects** to explicitly replace amounts for completely unpaid projects. This refreshes source details and overwrites manual project cost edits. Partially/fully settled projects stay locked. Correct source data in Projects before recalculating missing team/duration information.
- **Corrections:** manual money entries can be reversed with a reason. The original remains in history. Settlements cannot be silently edited or deleted through the wallet.
- **History:** payout receipt breakdowns, manual entries, corrections, change log and CSV export.

## Important boundaries

- Pre-wallet project costs are labelled **historical estimates**. Review them against the displayed original payments/invoices; there is not enough consistent legacy data to reconstruct exact allocations automatically. Payouts after migration use saved snapshots.
- Imported pending bonuses/other pay need review because old bonuses may already include lead fees or project extras. Save each imported draft after checking it; cashout is blocked until reviewed.
- Recorded cash starts from wallet entries, not from the studio's bank balance. Opening funds and actual receipts need to be entered. Client bonuses are recorded as money received.
- Tax withheld is included in gross team cost and is not extra profit. Use a withdrawal entry to record remittance of an amount already withheld; do not book the same amount as another operating expense.
- Existing invoice generation tools outside the wallet remain available for the old workflow. Wallet cashouts generate their own immutable amount snapshots with `W-` invoice references; do not issue a duplicate invoice for the same payment.
- No live database migration or payment was executed during implementation. The SQL migration must be run before the new wallet can load. The automated checks used synthetic data and a temporary local PostgreSQL-compatible database.

## Verification

`npm run test:finance` runs financial regression tests, including revenue preservation, shared projects, carry-forward, zero withholding, duplicate requests, frozen rates, standalone bonuses and imported-adjustment review.

The migration was tested for rerun safety, atomic payment/invoice/project saves, transaction rollback, stale revision rejection and private table/function permissions. Browser tests covered desktop/mobile layout, save/reload, cashout, history and the absence of horizontal page overflow.

The default development bundler failed to resolve Tailwind in this Windows folder. Development/build scripts use Next's supported webpack mode, which was used for the preview checks.

Repeatable checks: `npm run test:finance:db` uses an isolated local PostgreSQL runtime (no network/database credentials). For browser checks, start `npm run dev -- --port 3100`, then run `npm run test:finance:ui`; all API data is mocked. Screenshots are written to `tests/artifacts/`.

Migration safety check: the revised SQL contains no DROP TRIGGER statements. It adds missing protection triggers and stops on a conflicting existing trigger. Tests compare every row and field in populated projects, animators, payments and invoices before/after initial installation and reruns, and verify existing wallet records survive reruns. INSERT/UPDATE statements inside the defined function run only when that function is later called by the app, not during installation. Supabase may still show a generic warning for schema changes or function definitions; this is not a backup or a guarantee against unrelated production issues.
