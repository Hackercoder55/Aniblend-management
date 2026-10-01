# Wallet receipt worker

The local ANIBLEND.py has been wired to check_finance_receipts every 30 seconds. Its previous file is preserved as ANIBLEND.before-wallet-receipts.py.bak beside it. Do not publish either bot file: they may contain private configuration.

Deploy aniblend_finance_worker.py beside ANIBLEND.py on the machine running the bot, and deploy the updated ANIBLEND.py there. Restart the existing bot process once. Do not run a second bot instance. This code was tested with fake Discord and database responses, not by starting the production bot.

The bot must use the same Supabase project and server service-role access as the dashboard. Migration 002 must be installed (read-only inspection on October 1 confirmed the queue exists). No additional migration is needed. This module uses only the Python standard library.

Both senders claim the same job with claim_finance_notification, so only one sends it. The worker sends the exact saved receipt, never guesses the latest payment, changes project status, archives threads, or marks anyone paid. Missing dashboard tokens leave jobs pending for the bot. Definite failures require Retry message; uncertain delivery requires Check delivery. Existing sent messages are never sent again.

For an independently hosted ANIBLEND.py, the integration added before on_ready is:

```python
# Dashboard wallet receipts use a shared atomic queue; legacy loops stay intact.
@tasks.loop(seconds=30)
async def check_finance_receipts():
    try:
        from aniblend_finance_worker import FinanceReceiptWorker
        worker = FinanceReceiptWorker(supabase, bot.http.token, log)
        await worker.drain()
    except Exception as error:
        # Do not stop existing project/invoice loops if setup is unavailable.
        log("⚠️", "Wallet receipt queue unavailable (" + type(error).__name__ + "). Check database access and migrations/002_payment_notifications.sql.")


@check_finance_receipts.before_loop
async def _before_finance_receipts():
    await bot.wait_until_ready()


```

Add (check_finance_receipts, "check_finance_receipts") to the existing on_ready loop startup list.
