import sys
import os
import json

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from app.db.client import get_service_role_client

def run_checks():
    client = get_service_role_client()
    
    r1 = client.table("safe_windows").select("*").eq("status", "active").execute()
    r2 = client.table("sos_alerts").select("*").eq("status", "ACTIVE").execute()
    r3 = client.table("in_app_notifications").select("*").is_("read_at", "null").execute()
    r4 = client.table("sos_escalation_targets").select("*").is_("acknowledged_at", "null").execute()
    
    users = [r["user_id"] for r in (r1.data or [])]
    from collections import Counter
    counts1 = Counter(users)
    dupes1 = {k: v for k, v in counts1.items() if v > 1}
    
    users_sos = [r["user_id"] for r in (r2.data or [])]
    counts2 = Counter(users_sos)
    dupes2 = {k: v for k, v in counts2.items() if v > 1}
    
    output = {
        "safe_windows_active": r1.data,
        "sos_alerts_active": r2.data,
        "in_app_notifications_unread_count": len(r3.data or []),
        "sos_escalation_targets_unack_count": len(r4.data or []),
        "safe_windows_dupes": dupes1,
        "sos_alerts_dupes": dupes2,
    }
    
    with open("db_dump.json", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

if __name__ == "__main__":
    run_checks()
