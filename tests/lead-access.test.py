import asyncio
import copy
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('access', ROOT / 'bot/aniblend_lead_access.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class Overwrite:
    def __init__(self, **values):
        self.view_channel = None
        self.read_message_history = None
        self.send_messages_in_threads = None
        self.send_messages = None
        self.__dict__.update(values)
    def __iter__(self): return iter(self.__dict__.items())
    def is_empty(self): return all(v is None for v in self.__dict__.values())

class Thread: pass

class Query:
    def __init__(self, rows): self.rows = rows
    def select(self, *args): return self
    def eq(self, *args): return self
    def order(self, *args): return self
    def range(self, start, end): return Query(self.rows[start:end+1])
    def execute(self): return SimpleNamespace(data=self.rows)

class AccessTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        m.discord = SimpleNamespace(Thread=Thread)
        m.log = lambda *args: None
        m.get_head_data = lambda name: {'Lead': '42'}.get(name, '')
        self.rows = {'projects': [], 'animators': []}
        m.supabase = SimpleNamespace(table=lambda name: Query(self.rows[name]))
        self.member = SimpleNamespace(id=42)
        self.events = []
        self.overwrite = Overwrite()
        self.parent = SimpleNamespace(id=1)
        self.parent.overwrites_for = lambda member: copy.deepcopy(self.overwrite)
        async def set_permissions(member, overwrite=None, **kwargs):
            self.events.append('permissions')
            self.overwrite = overwrite or Overwrite()
        self.parent.set_permissions = AsyncMock(side_effect=set_permissions)
        self.parent.permissions_for = lambda member: SimpleNamespace(view_channel=True, read_message_history=True, send_messages_in_threads=True)
        self.guild = SimpleNamespace(fetch_channel=AsyncMock(return_value=self.parent))
        self.parent.guild = self.guild
        self.thread = Thread()
        self.thread.id = 2
        self.thread.parent_id = 1
        self.thread.parent = self.parent
        self.thread.guild = self.guild
        self.thread.locked = False
        self.thread.archived = False
        async def add(member): self.events.append('add')
        async def verify(mid): self.events.append('verify')
        self.thread.add_user = AsyncMock(side_effect=add)
        self.thread.fetch_member = AsyncMock(side_effect=verify)
        self.thread.edit = AsyncMock()
        self.thread.remove_user = AsyncMock()

    async def test_parent_before_membership_and_preserve_owner_permissions(self):
        self.overwrite.send_messages = True
        self.overwrite.attach_files = True
        await m.ensure_lead_thread_access(self.thread, self.member)
        self.assertEqual(self.events, ['permissions', 'add', 'verify'])
        self.assertTrue(self.overwrite.send_messages)
        self.assertTrue(self.overwrite.attach_files)
        self.assertTrue(self.overwrite.send_messages_in_threads)

    async def test_membership_failure_restores_permissions(self):
        self.thread.fetch_member.side_effect = RuntimeError('Denied')
        with self.assertRaises(RuntimeError): await m.ensure_lead_thread_access(self.thread, self.member)
        self.assertTrue(self.overwrite.is_empty())

    async def test_locked_thread_not_unlocked_and_archived_thread_reopened(self):
        self.thread.locked = True
        with self.assertRaises(ValueError): await m.ensure_lead_thread_access(self.thread, self.member)
        self.parent.set_permissions.assert_not_awaited()
        self.thread.locked = False
        self.thread.archived = True
        await m.ensure_lead_thread_access(self.thread, self.member)
        self.thread.edit.assert_awaited_once()

    async def test_shared_workspace_retained_for_other_assignment(self):
        self.rows['projects'] = [{'Thread_ID': '3', 'Lead': 'Lead'}]
        self.guild.fetch_channel.return_value = SimpleNamespace(parent_id=1)
        await m.revoke_parent_access_if_unused(self.parent, self.member, 2)
        self.parent.set_permissions.assert_not_awaited()

    async def test_owner_and_custom_permissions_never_wiped(self):
        for values in ({'send_messages': True}, {'attach_files': True}):
            self.overwrite = Overwrite(**values)
            await m.revoke_parent_access_if_unused(self.parent, self.member, 2)
        self.parent.set_permissions.assert_not_awaited()

    async def test_failed_other_thread_lookup_retains_shared_access(self):
        self.rows['projects'] = [{'Thread_ID': '3', 'Lead': 'Lead'}]
        self.guild.fetch_channel.side_effect = RuntimeError('Unavailable')
        await m.revoke_parent_access_if_unused(self.parent, self.member, 2)
        self.parent.set_permissions.assert_not_awaited()

    async def test_unused_visitor_access_removed(self):
        await m.revoke_parent_access_if_unused(self.parent, self.member, 2)
        self.parent.set_permissions.assert_awaited_once()

    async def test_current_animator_or_other_role_retains_thread_membership(self):
        self.rows['projects'] = [{'Thread_ID': '2', 'Lighting_Discord_ID': '42'}]
        await m.release_project_member(self.thread, self.member)
        self.thread.remove_user.assert_not_awaited()

if __name__ == '__main__': unittest.main()
