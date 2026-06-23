import asyncio
import os
from supabase import create_client, Client
import httpx
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

async def main():
    print("--- E2E VERIFICATION SCRIPT ---")
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    
    import uuid
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    password = "password123"
    print(f"Signing up new user: {email}...")
    
    try:
        auth_response = supabase.auth.sign_up({"email": email, "password": password})
        session = auth_response.session
        print(f"Signup successful! User ID: {auth_response.user.id}")
    except Exception as e:
        print(f"Signup failed: {e}")
        return

    # Simulate the React Native fetch()
    payload = {
        "trigger_type": "SILENT_SOS",
        "status": "ACTIVE",
        "cancel_method": "NONE",
        "visible_message": "Silent SOS Test",
        "latitude": 40.7128,
        "longitude": -74.0060,
        "map_link": "https://www.google.com/maps?q=40.7128,-74.0060"
    }
    
    print("\nSending POST request to FastAPI...")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {session.access_token}"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post("http://127.0.0.1:8000/api/alerts", json=payload, headers=headers)
        
        print(f"Response Status: {response.status_code}")
        print(f"Response JSON: {response.json()}")

    # Verify Database Insert
    print("\nVerifying Database Insert via Supabase (bypassing backend)...")
    db_response = supabase.table("sos_alerts").select("*").eq("user_id", auth_response.user.id).order("created_at", desc=True).limit(1).execute()
    
    if db_response.data:
        print("Database Verification: SUCCESS!")
        row = db_response.data[0]
        print(f"Row ID: {row['id']}")
        print(f"Trigger Type: {row['trigger_type']}")
        print(f"Status: {row['status']}")
    else:
        print("Database Verification: FAILED (No rows found)")

if __name__ == "__main__":
    asyncio.run(main())
