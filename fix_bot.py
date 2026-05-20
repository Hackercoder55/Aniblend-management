import re

with open(r'd:\Docs\Automation TFA\agency_bot.py', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update AssetModal init signature
code = re.sub(
    r'def __init__\(self, project_id: str, title: str, animator: str, thread_id: str\):',
    r'def __init__(self, project_id: str, title: str, animator: str, thread_id: str, lead_tag: str = ""):',
    code
)

code = re.sub(
    r'self\.thread_id = thread_id\n',
    r'self.thread_id = thread_id\n        self.lead_tag = lead_tag\n',
    code
)

# 2. Update AssetModal msg content
code = code.replace(
    r'f"**Tags:** <@{ANMOL_ID}> <@{AYUSH_ID}> <@{SANTOSH_ID}> <@1474269003588309095>\n\n"',
    r'f"**Tags:** <@{ANMOL_ID}> <@{AYUSH_ID}> <@{SANTOSH_ID}> <@1474269003588309095> {self.lead_tag}\n\n"'
)

code = code.replace(
    r'f"**Thread:** <#{self.thread_id}>\n\n"',
    r'f"**Thread:** https://discord.com/channels/{GUILD_ID}/{self.thread_id}\n\n"'
)

# 3. Update asset_request to pass lead_tag
asset_req_old = """    proj = proj_res.data[0]
    await interaction.response.send_modal(
        AssetModal(
            proj.get("Project_ID", "Unknown"),
            proj.get("Project_title", "Unknown"),
            proj.get("Animator", "Unknown"),
            thread_id
        )
    )"""

asset_req_new = """    proj = proj_res.data[0]
    lead_tag = ""
    if proj.get("Lead"):
        lead_res = supabase.table("leads").select("Discord_ID").eq("Head_Name", proj.get("Lead")).execute()
        if lead_res.data:
            lead_tag = f"<@{lead_res.data[0]['Discord_ID']}>"
            
    await interaction.response.send_modal(
        AssetModal(
            proj.get("Project_ID", "Unknown"),
            proj.get("Project_title", "Unknown"),
            proj.get("Animator", "Unknown"),
            thread_id,
            lead_tag
        )
    )"""

code = code.replace(asset_req_old, asset_req_new)

# 4. Update DoubtModal thread link
doubt_modal_thread_old = r'f"**Thread:** <#{self.thread_id}>\n\n"'
doubt_modal_thread_new = r'f"**Thread:** https://discord.com/channels/{GUILD_ID}/{self.thread_id}\n\n"'
code = code.replace(doubt_modal_thread_old, doubt_modal_thread_new)

# 5. Update DoubtTargetSelect
doubt_select_old = """class DoubtTargetSelect(discord.ui.Select):
    def __init__(self, *args, **kwargs):
        self.proj_data = kwargs.pop("proj_data")
        options = [
            discord.SelectOption(label="Anmol", description="Ask Anmol"),
            discord.SelectOption(label="Santosh", description="Ask Santosh"),
            discord.SelectOption(label="Ayush", description="Ask Ayush"),
            discord.SelectOption(label="Everyone", description="Tag all leads")
        ]
        super().__init__(placeholder="Select who you want to ping...", options=options)

    async def callback(self, interaction: discord.Interaction):
        target = self.values[0]
        if target == "Anmol":
            tag = f"<@{ANMOL_ID}>"
        elif target == "Santosh":
            tag = f"<@{SANTOSH_ID}>"
        elif target == "Ayush":
            tag = f"<@{AYUSH_ID}>"
        else:
            tag = f"<@{ANMOL_ID}> <@{AYUSH_ID}> <@{SANTOSH_ID}>" """

doubt_select_new = """class DoubtTargetSelect(discord.ui.Select):
    def __init__(self, *args, **kwargs):
        self.proj_data = kwargs.pop("proj_data")
        options = [
            discord.SelectOption(label="Anmol", description="Ask Anmol"),
            discord.SelectOption(label="Santosh", description="Ask Santosh"),
            discord.SelectOption(label="Ayush", description="Ask Ayush"),
            discord.SelectOption(label="Everyone", description="Tag all leads")
        ]
        
        self.lead_id = None
        lead_name = self.proj_data.get("Lead")
        if lead_name:
            lead_res = supabase.table("leads").select("Discord_ID").eq("Head_Name", lead_name).execute()
            if lead_res.data:
                self.lead_id = lead_res.data[0]['Discord_ID']
                options.insert(0, discord.SelectOption(label=f"Project Lead", description=f"Ask {lead_name}"))

        super().__init__(placeholder="Select who you want to ping...", options=options)

    async def callback(self, interaction: discord.Interaction):
        target = self.values[0]
        if target == "Project Lead" and self.lead_id:
            tag = f"<@{self.lead_id}>"
        elif target == "Anmol":
            tag = f"<@{ANMOL_ID}>"
        elif target == "Santosh":
            tag = f"<@{SANTOSH_ID}>"
        elif target == "Ayush":
            tag = f"<@{AYUSH_ID}>"
        else:
            tag = f"<@{ANMOL_ID}> <@{AYUSH_ID}> <@{SANTOSH_ID}>" """

code = code.replace(doubt_select_old, doubt_select_new)

with open(r'd:\Docs\Automation TFA\agency_bot.py', 'w', encoding='utf-8') as f:
    f.write(code)

print("Bot code successfully patched!")
