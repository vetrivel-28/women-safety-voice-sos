import sys
import os

# Ensure app can be imported
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.db.client import get_service_role_client

def check():
    client = get_service_role_client()
    res = client.table("safe_windows").select("user_id").eq("status", "active").execute()
    users = [r["user_id"] for r in (res.data or [])]
    from collections import Counter
    counts = Counter(users)
    duplicates = {k: v for k, v in counts.items() if v > 1}
    print(f"Total active journeys: {len(users)}")
    print(f"Duplicates: {duplicates}")

if __name__ == "__main__":
    check()
