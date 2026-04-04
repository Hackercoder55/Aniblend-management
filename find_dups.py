import csv
import json
import urllib.request
import os

SUPABASE_URL = "https://qhgdamefwmhpjkqpoxvy.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZ2RhbWVmd21ocGprcXBveHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNDU1NzcsImV4cCI6MjA4NjkyMTU3N30.kqST2VJZyiBgI6VMaLIf2WwPM5LgGD8Toi8ic3xWUIQ"

req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/projects?select=*", headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"})
with urllib.request.urlopen(req) as response:
    projects = json.loads(response.read().decode())

from collections import defaultdict

proj_map = defaultdict(list)
for p in projects:
    if p.get("Status") in ["Pending", "Ongoing", "Active", "Review", "Changes Requested", "Ready to Render", "Render QA"]:
        proj_map[p.get("Project_ID")].append(p)

for pid, plist in proj_map.items():
    if len(plist) > 1:
        thread_ids = set()
        dates = set()
        for p in plist:
            tid = p.get("Thread_ID")
            if tid: thread_ids.add(tid)
            d = p.get("Date Assigned")
            if d: dates.add(d)
        
        if len(thread_ids) > 1 or (len(thread_ids) == 1 and None in [p.get("Thread_ID") for p in plist]) or len(dates) > 1:
            print(f"Possible duplicate Project_ID: {pid}")
            for p in plist:
                print(f"  - Animator: {p.get('Animator')} (Thread: {p.get('Thread_ID')}, Date: {p.get('Date Assigned')})")
