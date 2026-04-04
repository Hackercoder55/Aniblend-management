import os
import urllib.request
import json

def get_keys():
    url, key = '', ''
    with open('d:\\Docs\\TFA Dashboard\\tfa-dashboard\\.env.local', 'r') as f:
        for line in f:
            if 'NEXT_PUBLIC_SUPABASE_URL=' in line: url = line.split('=')[1].strip().strip('\"').strip()
            elif 'SUPABASE_SERVICE_ROLE_KEY=' in line: key = line.split('=')[1].strip().strip('\"').strip()
    return url, key

url, key = get_keys()

def test_fetch():
    req = urllib.request.Request(f"{url}/rest/v1/invoices?employee_id=eq.1058", headers={'apikey': key, 'Authorization': f'Bearer {key}'})
    res = urllib.request.urlopen(req)
    invoices = json.loads(res.read())
    print("Anshuman Invoices:", invoices)
    
test_fetch()
