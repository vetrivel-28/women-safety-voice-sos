import asyncio
from supabase import create_client
import os

from dotenv import load_dotenv
load_dotenv(".env")

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(url, key)

def get_orphans():
    users = supabase.auth.admin.list_users()
    auth_user_ids = {u.id: u.email for u in users}
    
    profiles = supabase.table("profiles").select("id").execute()
    profile_ids = {p["id"] for p in profiles.data}
    
    orphans = {}
    for uid, email in auth_user_ids.items():
        if uid not in profile_ids:
            orphans[uid] = email
            
    print(f"Total Auth Users: {len(auth_user_ids)}")
    print(f"Total Profiles: {len(profile_ids)}")
    print(f"Orphan Count: {len(orphans)}")
    for uid, email in orphans.items():
        print(f"Orphan UUID: {uid}, Email: {email}")

if __name__ == "__main__":
    get_orphans()
