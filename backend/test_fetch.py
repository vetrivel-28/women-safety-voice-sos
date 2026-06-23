import httpx
import os
import json
from app.db.client import get_supabase_client
from app.core.config import settings

def test_fetch_simulation():
    # We don't have a valid user token, so we'll just check if the backend is reachable
    try:
        r = httpx.get("http://127.0.0.1:8000/")
        print("Backend Root:", r.status_code)
    except Exception as e:
        print("Backend unreachable:", e)

if __name__ == "__main__":
    test_fetch_simulation()
