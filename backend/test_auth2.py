import os
import httpx
from app.db.client import get_supabase_client
from app.core.config import settings
import uuid

def test_auth():
    print("Skipping real auth test, just testing supabase.auth methods")
    client = get_supabase_client()
    print("Methods:", dir(client.auth))

if __name__ == "__main__":
    test_auth()
