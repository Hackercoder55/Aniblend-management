"""Package the receipt worker into a private ANIBLEND.py; no bot execution."""
from pathlib import Path
import ast
import shutil
import sys

START = '# BEGIN ANIBLEND EMBEDDED FINANCE WORKER'
END = '# END ANIBLEND EMBEDDED FINANCE WORKER'
HOOK = '''# Dashboard wallet receipts use a shared atomic queue; legacy loops stay intact.
@tasks.loop(seconds=30)
async def check_finance_receipts():
    try:
        worker = FinanceReceiptWorker(supabase, bot.http.token, log)
        await worker.drain()
    except Exception as error:
        log("⚠️", "Wallet receipt queue unavailable (" + type(error).__name__ + "). Check database access and migrations/002_payment_notifications.sql.")


@check_finance_receipts.before_loop
async def _before_finance_receipts():
    await bot.wait_until_ready()


'''

def embed_worker(target):
    target = Path(target)
    source = target.read_text(encoding='utf-8-sig')
    worker = Path(__file__).with_name('aniblend_finance_worker.py').read_text(encoding='utf-8')
    block = START + '\n' + worker.rstrip() + '\n' + END + '\n\n'
    ready = '@bot.event\nasync def on_ready():'
    if ready not in source:
        raise ValueError('Expected bot on_ready hook not found; no file changed')
    if START in source:
        start, end = source.index(START), source.index(END) + len(END)
        source = source[:start] + block.rstrip() + source[end:]
    else:
        anchor = '# Dashboard wallet receipts use a shared atomic queue; legacy loops stay intact.'
        if anchor not in source:
            anchor = ready
        source = source.replace(anchor, block + anchor, 1)
    source = source.replace('        from aniblend_finance_worker import FinanceReceiptWorker\n', '')
    if 'async def check_finance_receipts():' not in source:
        source = source.replace(ready, HOOK + ready, 1)
    startup = '        (check_finance_receipts,      "check_finance_receipts"),'
    if startup not in source:
        anchor = '        (check_payments,              "check_payments"),'
        if anchor not in source:
            raise ValueError('Expected task startup list not found; no file changed')
        source = source.replace(anchor, anchor + '\n' + startup, 1)
    ast.parse(source)
    if 'from aniblend_finance_worker import' in source:
        raise ValueError('External worker import remains; no file changed')
    backup = target.with_name(target.stem + '.before-single-file.py.bak')
    if not backup.exists():
        shutil.copy2(target, backup)
    target.write_text(source, encoding='utf-8')
    return target

if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python embed_finance_worker.py /path/to/ANIBLEND.py')
    embed_worker(sys.argv[1])
    print('Single-file bot prepared and syntax checked. Bot was not started.')
