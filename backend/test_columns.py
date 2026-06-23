import httpx
import os

env = dict(line.strip().split('=', 1) for line in open('.env') if line.strip() and not line.startswith('#'))
url = f"{env['SUPABASE_URL']}/rest/v1/sos_alerts?limit=1"
headers = {
    'apikey': env['SUPABASE_SERVICE_ROLE_KEY'], 
    'Authorization': f"Bearer {env['SUPABASE_SERVICE_ROLE_KEY']}"
}

r = httpx.get(url, headers=headers)
data = r.json()
if data:
    print("LIVE SCHEMA COLUMNS:")
    print(", ".join(data[0].keys()))
else:
    print("NO DATA")

