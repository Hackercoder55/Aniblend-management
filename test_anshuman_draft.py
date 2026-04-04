import os
import sys

# Add node modules equivalent for Python
try:
    from supabase import create_client
except ImportError:
    os.system("pip install supabase --quiet")
    from supabase import create_client

def get_keys():
    url, key = "", ""
    with open("d:\\Docs\\TFA Dashboard\\tfa-dashboard\\.env.local", "r") as f:
        for line in f:
            if "NEXT_PUBLIC_SUPABASE_URL=" in line:
                url = line.split("=")[1].strip().strip('"')
            elif "SUPABASE_SERVICE_ROLE_KEY=" in line:
                key = line.split("=")[1].strip().strip('"')
    return url, key

url, key = get_keys()
supabase = create_client(url, key)

anshuman = supabase.table("animators").select("Employee_ID, Name, Channel_ID").ilike("Name", "%Anshuman%").execute().data
print("Anshuman record in animators:", anshuman)

drafts = supabase.table("invoices").select("id, employee_id, status, thread_id").eq("status", "Draft").execute().data
print("Draft Invoices:", drafts)
