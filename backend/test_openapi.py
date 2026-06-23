import httpx
import os

env = dict(line.strip().split('=', 1) for line in open('.env') if line.strip() and not line.startswith('#'))
url = f"{env['SUPABASE_URL']}/rest/v1/"
headers = {
    'apikey': env['SUPABASE_SERVICE_ROLE_KEY'], 
    'Authorization': f"Bearer {env['SUPABASE_SERVICE_ROLE_KEY']}",
    'Accept': 'application/openapi+json'
}

r = httpx.get(url, headers=headers)
data = r.json()
print("TABLES:", list(data.get('definitions', {}).keys()))
