"""Deliver immutable dashboard receipts. Never writes payments or project status.
Both this worker and the dashboard use the same atomic database claim.
"""
import asyncio
import json
import re
from datetime import datetime, timezone, timedelta
from urllib.request import Request, urlopen
from urllib.error import HTTPError


def _discord_post(token, channel, payload):
    request = Request(
        "https://discord.com/api/v10/channels/" + channel + "/messages",
        data=json.dumps(payload).encode("utf-8"), method="POST",
        headers={"Authorization": "Bot " + token, "Content-Type": "application/json",
                 "User-Agent": "AniBlendPaymentWorker/1.0"},
    )
    try:
        with urlopen(request, timeout=15) as response:
            return response.status, json.loads(response.read())
    except HTTPError as error:
        try:
            body = json.loads(error.read())
        except (ValueError, TypeError):
            body = {}
        return error.code, body


class FinanceReceiptWorker:
    def __init__(self, db, token, log, post=None):
        self.db, self.token, self.log = db, token, log
        self.post = post or _discord_post

    async def _save(self, job, **values):
        values["updated_at"] = datetime.now(timezone.utc).isoformat()
        await asyncio.to_thread(lambda: self.db.table("finance_notifications").update(values)
                                .eq("id", job["id"]).execute())

    async def deliver(self, notice_id):
        if not self.token:
            return
        result = await asyncio.to_thread(lambda: self.db.rpc(
            "claim_finance_notification", {"notice_id": notice_id}).execute())
        if not result.data:
            return  # Another sender already claimed/sent it, or retry is not due.
        job = result.data[0]
        channel = str(job.get("channel_id") or "").strip()
        if not re.fullmatch(r"[0-9]{15,22}", channel):
            await self._save(job, status="failed", last_error="Destination thread is missing. Update the artist/project Discord destination and retry.")
            return
        try:
            status, body = await asyncio.to_thread(self.post, self.token, channel, {
                "content": job["content"], "nonce": job["id"], "enforce_nonce": True,
                "allowed_mentions": {"parse": []},
            })
        except Exception:
            await self._save(job, status="unknown", last_error="Connection interrupted. Check delivery before retrying; payment remains saved.")
            return
        if 200 <= status < 300 and body.get("id"):
            await self._save(job, status="sent", message_id=str(body["id"]), last_error=None, next_attempt_at=None)
            self.log("✅", "Wallet receipt delivered: " + job["id"])
        elif status == 429:
            try:
                seconds = max(1, float(body.get("retry_after") or 5))
            except (ValueError, TypeError):
                seconds = 5
            await self._save(job, status="pending", next_attempt_at=(datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat(), last_error="Discord rate limit. Queued for retry.")
        elif status >= 500 or 200 <= status < 300:
            await self._save(job, status="unknown", last_error="Discord response uncertain. Check delivery before retrying; payment remains saved.")
        else:
            await self._save(job, status="failed", last_error="Discord HTTP " + str(status) + ": " + str(body.get("message") or "Delivery failed")[:200])

    async def drain(self):
        if not self.token:
            return
        result = await asyncio.to_thread(lambda: self.db.table("finance_notifications")
            .select("id,next_attempt_at").eq("status", "pending").order("created_at").limit(50).execute())
        attempted = 0
        for job in result.data or []:
            deadline = job.get("next_attempt_at")
            if deadline and datetime.fromisoformat(deadline.replace("Z", "+00:00")) > datetime.now(timezone.utc):
                continue
            try:
                await self.deliver(job["id"])
            except Exception:
                # In particular, never re-send if delivery succeeded but saving its ID failed.
                self.log("⚠️", "Wallet receipt needs delivery verification: " + job["id"])
            attempted += 1
            if attempted >= 10:
                break
