import asyncio
import copy
import sys
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'bot'))
from aniblend_finance_worker import FinanceReceiptWorker

class FakeDB:
    def __init__(self):
        self.job = dict(id='PAY-test', channel_id='123456789012345678', content='Saved receipt: 4700.00', status='pending', next_attempt_at=None)
        self.lock = threading.Lock()
        self.fail_save = False
    def rpc(self, name, args):
        assert name == 'claim_finance_notification'
        def run():
            with self.lock:
                if self.job['status'] not in ('pending', 'failed'):
                    return SimpleNamespace(data=[])
                self.job['status'] = 'sending'
                return SimpleNamespace(data=[copy.deepcopy(self.job)])
        return SimpleNamespace(execute=run)
    def table(self, name):
        assert name == 'finance_notifications', 'Worker must never write financial records'
        db = self
        class Query:
            values = None
            def select(self, *a): return self
            def eq(self, *a): return self
            def order(self, *a): return self
            def limit(self, *a): return self
            def update(self, values): self.values=values; return self
            def execute(self):
                if self.values is not None:
                    if db.fail_save: raise RuntimeError('Database disconnected after send')
                    db.job.update(self.values)
                    return SimpleNamespace(data=[])
                return SimpleNamespace(data=[copy.deepcopy(db.job)] if db.job['status']=='pending' else [])
        return Query()

class WorkerTests(unittest.IsolatedAsyncioTestCase):
    def worker(self, db, post, token='fake'):
        return FinanceReceiptWorker(db, token, lambda *a: None, post)
    async def test_concurrent_claim_sends_exact_saved_content_once(self):
        db=FakeDB(); sent=[]
        def post(token, channel, payload):
            sent.append(payload); return 200, {'id':'message-1'}
        worker=self.worker(db,post)
        await asyncio.gather(worker.deliver('PAY-test'),worker.deliver('PAY-test'))
        await worker.deliver('PAY-test')
        self.assertEqual(len(sent),1)
        self.assertEqual(sent[0]['content'],db.job['content'])
        self.assertEqual(sent[0]['allowed_mentions'],{'parse':[]})
        self.assertTrue(sent[0]['enforce_nonce'])
        self.assertEqual(db.job['status'],'sent')
    async def test_unknown_connection_is_never_automatically_retried(self):
        db=FakeDB(); sent=[]
        def post(*a): sent.append(1); raise TimeoutError()
        worker=self.worker(db,post);await worker.deliver('PAY-test');await worker.deliver('PAY-test')
        self.assertEqual(db.job['status'],'unknown');self.assertEqual(len(sent),1)
    async def test_rejected_permission_is_visible_and_manual_retry_only(self):
        db=FakeDB();worker=self.worker(db,lambda *a:(403,{'message':'Missing permissions'}))
        await worker.deliver('PAY-test');self.assertEqual(db.job['status'],'failed');self.assertIn('403',db.job['last_error'])
    async def test_rate_limit_waits_before_next_drain(self):
        db=FakeDB();calls=[]
        def post(*a):calls.append(1);return 429,{'retry_after':30}
        worker=self.worker(db,post);await worker.drain();await worker.drain()
        self.assertEqual(db.job['status'],'pending');self.assertIsNotNone(db.job['next_attempt_at']);self.assertEqual(len(calls),1)
    async def test_save_failure_after_send_does_not_repeat_payment_message(self):
        db=FakeDB();db.fail_save=True;calls=[]
        def post(*a):calls.append(1);return 200,{'id':'sent-but-save-lost'}
        worker=self.worker(db,post);await worker.drain();await worker.drain()
        self.assertEqual(db.job['status'],'sending');self.assertEqual(len(calls),1)
    async def test_invalid_destination_or_no_token_cannot_send(self):
        def post(*a):raise AssertionError('Must not send')
        db=FakeDB();await self.worker(db,post,token='').drain();self.assertEqual(db.job['status'],'pending')
        db.job['channel_id']='null';await self.worker(db,post).deliver('PAY-test');self.assertEqual(db.job['status'],'failed')
    async def test_server_error_and_incomplete_success_need_verification(self):
        for response in [(503,{}),(200,{})]:
            db=FakeDB();await self.worker(db,lambda *a:response).deliver('PAY-test');self.assertEqual(db.job['status'],'unknown')

if __name__=='__main__':unittest.main()
