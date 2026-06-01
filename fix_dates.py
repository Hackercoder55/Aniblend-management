"""
Fix bad Date Assigned / Date Approved formats in Supabase projects table.
Old format (wrong): "21-05-26 06:35 PM" or "21-05-26 06:35 AM"
Correct format: "22 May 2026"
"""
import re
from supabase import create_client

SUPABASE_URL = "https://qhgdamefwmhpjkqpoxvy.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZ2RhbWVmd21ocGprcXBveHZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNDU1NzcsImV4cCI6MjA4NjkyMTU3N30.kqST2VJZyiBgI6VMaLIf2WwPM5LgGD8Toi8ic3xWUIQ"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Matches: "21-05-26 06:35 PM" or "21-05-26 06:35 AM"
BUGGY_PATTERN = re.compile(r"^(\d{2})-(\d{2})-(\d{2})\s+\d{2}:\d{2}\s+[AP]M$")

MONTH_ABBR = {
    "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
    "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
    "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec"
}

def fix_date(bad_date: str):
    """Convert '21-05-26 06:35 PM' -> '21 May 2026'"""
    m = BUGGY_PATTERN.match(bad_date.strip())
    if not m:
        return None
    day, month, year_short = m.group(1), m.group(2), m.group(3)
    month_abbr = MONTH_ABBR.get(month)
    if not month_abbr:
        return None
    return f"{day} {month_abbr} 20{year_short}"

print("Fetching all projects...")
all_data = []
page = 0
while True:
    res = supabase.table("projects").select('Project_ID,"Date Assigned","Date Approved",Approved_Date').range(page * 1000, (page + 1) * 1000 - 1).execute()
    if not res.data:
        break
    all_data.extend(res.data)
    if len(res.data) < 1000:
        break
    page += 1

print(f"Total projects fetched: {len(all_data)}")

fixed_count = 0
projects_updated = 0
errors = 0

for p in all_data:
    pid = p.get("Project_ID")
    updates = {}

    for col in ["Date Assigned", "Date Approved", "Approved_Date"]:
        val = p.get(col)
        if val and isinstance(val, str):
            fixed = fix_date(val)
            if fixed:
                updates[col] = fixed
                print(f"  [{pid}] {col}: '{val}' -> '{fixed}'")

    if updates:
        try:
            supabase.table("projects").update(updates).eq("Project_ID", pid).execute()
            fixed_count += len(updates)
            projects_updated += 1
        except Exception as e:
            print(f"  ERROR updating {pid}: {e}")
            errors += 1

print(f"\nDone! Fixed {fixed_count} date fields across {projects_updated} projects. Errors: {errors}")
