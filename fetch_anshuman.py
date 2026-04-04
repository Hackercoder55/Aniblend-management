import os
import sys

def get_keys():
    url, key = "", ""
    with open("d:\\Docs\\TFA Dashboard\\tfa-dashboard\\.env.local", "r") as f:
        for line in f:
            if "NEXT_PUBLIC_SUPABASE_URL=" in line:
                url = line.split("=", 1)[1].strip().strip('"')
            elif "SUPABASE_SERVICE_ROLE_KEY=" in line:
                key = line.split("=", 1)[1].strip().strip('"')
    return url, key

url, key = get_keys()

import urllib.request, json
req = urllib.request.Request(url + "/rest/v1/invoices?employee_id=eq.1058", headers={'apikey': key, 'Authorization': 'Bearer ' + key})
res = urllib.request.urlopen(req)
print(json.dumps(json.loads(res.read()), indent=2))
