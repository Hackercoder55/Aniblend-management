"""Embedded in ANIBLEND.py by patch_lead_access.py; uses existing bot globals."""

async def ensure_lead_thread_access(thread, member):
    if not isinstance(thread, discord.Thread):
        raise ValueError("Use /lead inside the project's thread.")
    if thread.locked:
        raise ValueError("This thread is locked. A manager must reopen it before assigning a lead.")
    parent = await thread.guild.fetch_channel(thread.parent_id)
    previous = parent.overwrites_for(member)
    overwrite = parent.overwrites_for(member)
    overwrite.view_channel = True
    overwrite.read_message_history = True
    overwrite.send_messages_in_threads = True
    if overwrite.send_messages is None:
        overwrite.send_messages = False
    await parent.set_permissions(member, overwrite=overwrite, reason="Assigned project lead needs thread access")
    try:
        parent = await thread.guild.fetch_channel(thread.parent_id)
        permissions = parent.permissions_for(member)
        if not permissions.view_channel or not permissions.read_message_history or not permissions.send_messages_in_threads:
            raise ValueError("Discord denied workspace/thread access. Check bot Manage Channels permission and the lead's server timeout.")
        if thread.archived:
            await thread.edit(archived=False, reason="Reopen project for assigned lead")
        await thread.add_user(member)
        await thread.fetch_member(member.id)
    except Exception:
        # Restore just this member's original overwrite if verification failed.
        await parent.set_permissions(member, overwrite=None if previous.is_empty() else previous)
        raise


def project_uses_member(project, member_id, employee_ids):
    did = str(member_id)
    if any(str(project.get(k) or "") == did for k in ("Lighting_Discord_ID", "Layout_Discord_ID", "Discord_ID")):
        return True
    if str(project.get("Employee_ID") or "") in employee_ids:
        return True
    if any(str(h.get("empId") or "") in employee_ids | {did} for h in (project.get("output_history") or []) if isinstance(h, dict)):
        return True
    return bool(project.get("Lead") and str(get_head_data(project["Lead"]) or "") == did)


def access_projects():
    result = []
    offset = 0
    while True:
        batch = supabase.table("projects").select("*").order("id").range(offset, offset + 999).execute().data or []
        result.extend(batch)
        if len(batch) < 1000:
            return result
        offset += 1000


async def revoke_parent_access_if_unused(parent, member, excluded_thread_id):
    # Only remove the narrow visitor overwrite. Never erase an owner's/custom access.
    overwrite = parent.overwrites_for(member)
    allowed = {"view_channel", "read_messages", "read_message_history", "send_messages", "send_messages_in_threads"}
    if overwrite.send_messages is True or any(value is not None and name not in allowed for name, value in overwrite):
        return
    try:
        artists = supabase.table("animators").select("Employee_ID,Channel_ID").eq("Discord_ID", str(member.id)).execute().data or []
        if any(str(a.get("Channel_ID") or "") == str(parent.id) for a in artists):
            return
        employee_ids = {str(a["Employee_ID"]) for a in artists if a.get("Employee_ID")}
        for project in access_projects():
            tid = str(project.get("Thread_ID") or "")
            if not tid or tid == str(excluded_thread_id) or not project_uses_member(project, member.id, employee_ids):
                continue
            # Fetch rather than rely on cached threads (private/archived threads may be absent).
            thread = await parent.guild.fetch_channel(int(tid))
            if getattr(thread, "parent_id", None) == parent.id:
                return
        await parent.set_permissions(member, overwrite=None, reason="No other assigned project in this workspace")
    except Exception as error:
        # A failed lookup must not revoke somebody else's ongoing workspace access.
        log("WARN", "Kept shared workspace permission during access check: " + type(error).__name__)


async def release_project_member(thread, member):
    artists = supabase.table("animators").select("Employee_ID").eq("Discord_ID", str(member.id)).execute().data or []
    employee_ids = {str(a["Employee_ID"]) for a in artists if a.get("Employee_ID")}
    current = supabase.table("projects").select("*").eq("Thread_ID", str(thread.id)).execute().data or []
    if any(project_uses_member(p, member.id, employee_ids) for p in current):
        return
    await thread.remove_user(member)
    if thread.parent:
        await revoke_parent_access_if_unused(thread.parent, member, thread.id)
