import os
import requests
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_ANON_KEY")

response = requests.get(f"{url}/rest/v1/?apikey={key}")
if response.status_code == 200:
    data = response.json()
    print("--- USERS TABLE ---")
    if "users" in data["definitions"]:
        print(data["definitions"]["users"]["properties"])
    
    print("\n--- SOS ALERTS TABLE ---")
    if "sos_alerts" in data["definitions"]:
        print(data["definitions"]["sos_alerts"]["properties"])
else:
    print(f"Failed to fetch schema: {response.status_code}")
