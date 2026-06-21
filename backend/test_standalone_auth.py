import sys
import logging
from app.db.client import get_supabase_client

logging.basicConfig(level=logging.INFO)

def test_auth(jwt_token: str):
    print(f"[*] Testing supabase.auth.get_user() with standalone sync script")
    client = get_supabase_client()
    try:
        user = client.auth.get_user(jwt_token)
        print("[+] Success! User ID:", user.user.id)
    except Exception as e:
        print("[-] Error:", type(e).__name__, str(e))

if __name__ == "__main__":
    if len(sys.argv) > 1:
        test_auth(sys.argv[1])
    else:
        print("Provide JWT token as argument")
