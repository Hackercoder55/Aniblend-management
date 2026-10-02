# Single-file Vultr deployment

Only upload the updated private ANIBLEND.py to the existing bot location on Vultr, then restart that existing process once. No second Python file, new bot instance, new Python package or additional SQL is needed for this update. Existing Discord/Supabase configuration stays in that private file.

The local file at D:/aniblend automation/ANIBLEND.py already contains FinanceReceiptWorker and its 30-second loop. There is no import of aniblend_finance_worker. The previous version is preserved beside it as ANIBLEND.before-single-file.py.bak. Do not commit the private bot or its backup to GitHub: they contain private configuration.

The files in this folder are development/test sources. embed_finance_worker.py embeds the worker into an existing private bot, checks syntax, preserves a backup and does not start it. It is idempotent. These development files do not need to be uploaded to Vultr.

The dashboard and bot share claim_finance_notification, so one sender claims each receipt. The worker sends the exact saved amount and changes only notification state. It never changes payments, project status or existing sent messages. If the dashboard has no private bot token, pending jobs wait for the running bot. Definite delivery failures use Retry message; uncertain delivery uses Check delivery to avoid duplicates.

Deployment has not been performed on Vultr from this workspace. Local verification uses fake database and Discord responses, and never starts ANIBLEND.py or sends real receipts.
