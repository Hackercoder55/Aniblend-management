import os
import requests
import json
import re

env_content = open('.env.local').read()
supabase_url = re.search(r'NEXT_PUBLIC_SUPABASE_URL=(.*)', env_content).group(1).strip()
supabase_key = re.search(r'SUPABASE_SERVICE_ROLE_KEY=(.*)', env_content).group(1).strip()

headers = {
    "apikey": supabase_key,
    "Authorization": f"Bearer {supabase_key}"
}

# 1. Check if Anshuman has invoices
res = requests.get(f"{supabase_url}/rest/v1/invoices?select=id,status,employee_id,legal_name,invoice_number&legal_name=ilike.*anshuman*", headers=headers)
print("Anshuman Invoices:", res.json())

# 2. Check Anshuman projects
res = requests.get(f"{supabase_url}/rest/v1/projects?select=Project_ID,Animator,Status,Payment_Status,Date%20Approved&Animator=ilike.*anshuman*&Status=eq.Approved", headers=headers)
print("Anshuman Approved Projects:", res.json())

# 3. Check if 'bonus_amount' exists in 'invoices'
res = requests.get(f"{supabase_url}/rest/v1/invoices?select=bonus_amount&limit=1", headers=headers)
print("bonus_amount query response:", res.json())
