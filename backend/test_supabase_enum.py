import sys
from app.db.client import get_service_role_client
from enum import Enum

class TriggerType(str, Enum):
    MANUAL_SOS = "MANUAL_SOS"

def test_insert_enum():
    client = get_service_role_client()
    user_id = 'b2f80fdf-6faa-46f0-9f26-47c0f83d5185'
    alert_data = {
        "user_id": user_id,
        "trigger_type": TriggerType.MANUAL_SOS,
        "status": "ACTIVE",
        "cancel_method": "NONE",
        "visible_message": "SOS Test Enum",
        "location_lat": 12.3,
        "location_long": 45.6,
        "location_map_link": "http://map",
    }
    try:
        res = client.table("sos_alerts").insert(alert_data).execute()
        print("INSERT RESULT:", res)
    except Exception as e:
        print("INSERT EXCEPTION:", type(e), str(e))

if __name__ == "__main__":
    test_insert_enum()
