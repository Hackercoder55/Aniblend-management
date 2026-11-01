"""Safely patch a private single-file bot. Never starts the bot or sends messages."""
import ast
from pathlib import Path
import shutil
import sys

START = '# BEGIN ANIBLEND LEAD ACCESS FIX'
END = '# END ANIBLEND LEAD ACCESS FIX'

def patch(target):
    target = Path(target)
    original = target.read_text(encoding='utf-8-sig')
    source = original
    helper = Path(__file__).with_name('aniblend_lead_access.py').read_text(encoding='utf-8')
    block = START + '\n' + helper.rstrip() + '\n' + END + '\n\n'
    if START in source:
        start, end = source.index(START), source.index(END) + len(END)
        source = source[:start] + block.rstrip() + source[end:]
    else:
        anchor = '@bot.tree.command(name="lead", description="Assign a lead to the current project")'
        if anchor not in source:
            raise ValueError('Lead command not found; no file changed')
        source = source.replace(anchor, block + anchor, 1)
        start = source.index('        # 2. Remove PREVIOUS lead')
        end = source.index("        # 5. Auto-create Lead Channels", start)
        source = source[:start] + '''        # Verify Discord access before changing the assignment or removing the old lead.
        await ensure_lead_thread_access(interaction.channel, lead)
        supabase.table("projects").update({"Lead": lead_name}).eq("Project_ID", pid).execute()
        if old_lead_discord_id and old_lead_discord_id != str(lead.id):
            try:
                old_member = await interaction.guild.fetch_member(int(old_lead_discord_id))
                await release_project_member(interaction.channel, old_member)
            except Exception as error:
                log("WARN", "Previous lead access cleanup needs review: " + type(error).__name__)

''' + source[end:]
        start = source.index('        # 6. Grant parent channel access')
        end = source.index('        # 7. Announcement in thread', start)
        source = source[:start] + source[end:]
        # Existing personal lead channels also need their member overwrite repaired.
        anchor = '            if not drafts_channel:'
        repair = '''            for existing_channel in (drafts_channel, final_channel):
                if existing_channel and existing_channel.category_id == CATEGORY_ID:
                    existing_overwrite = existing_channel.overwrites_for(lead)
                    existing_overwrite.view_channel = True
                    existing_overwrite.read_message_history = True
                    existing_overwrite.send_messages = True
                    await existing_channel.set_permissions(lead, overwrite=existing_overwrite)

'''
        source = source.replace(anchor, repair + anchor, 1)
        # A stale Remove button must not erase a newer assignment.
        anchor = '            # Clear lead from DB'
        guard = '''            current = supabase.table("projects").select("Lead").eq("Project_ID", self.pid).execute().data or []
            if not current or str(get_head_data(current[0].get("Lead") or "") or "") != self.lead_discord_id:
                await interaction.followup.send("Lead assignment changed. Use /remove_lead for the current lead.", ephemeral=True)
                return
'''
        source = source.replace(anchor, guard + '\n' + anchor, 1)
        source = source.replace('await interaction.channel.remove_user(member)', 'await release_project_member(interaction.channel, member)')
        source = source.replace('await interaction.channel.remove_user(old_mem)', 'await release_project_member(interaction.channel, old_mem)')
        # release_project_member handles same-project roles and shared-parent cleanup.
        for name in ('member', 'old_mem'):
            source = source.replace('await parent_ch.set_permissions(' + name + ', overwrite=None)', 'pass  # Shared access handled by release_project_member above.')
        source = source.replace('await parent_ch.set_permissions(member_obj, overwrite=None)', 'await revoke_parent_access_if_unused(parent_ch, member_obj, thread.id)')
        source = source.replace('and workspace access revoked.', '(other assigned workspace access is retained).')
    ast.parse(source)
    if source != original:
        backup = target.with_name(target.stem + '.before-lead-access.py.bak')
        if not backup.exists():
            shutil.copy2(target, backup)
        target.write_text(source, encoding='utf-8')
    return target

if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python patch_lead_access.py /path/to/ANIBLEND.py')
    patch(sys.argv[1])
    print('Lead access fix embedded; syntax checked. Bot was not started.')
