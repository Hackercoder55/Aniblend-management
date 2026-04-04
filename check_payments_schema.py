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

res = requests.get(f"{supabase_url}/rest/v1/payments?limit=1", headers=headers)
print("Payments Response Status:", res.status_code)
if res.status_code == 200:
    data = res.json()
    if data:
        print("Keys:", data[0].keys())
    else:
        print("Empty array, let's try an OPTIONS request or fetching schema...")
else:
    print(res.text)
