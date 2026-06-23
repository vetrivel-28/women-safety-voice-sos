import sys
from app.db.client import get_service_role_client

def test_insert_none():
    client = get_service_role_client()
    user_id = 'b2f80fdf-6faa-46f0-9f26-47c0f83d5185'
    alert_data = {
        "user_id": user_id,
        "trigger_type": "MANUAL_SOS",
        "status": "ACTIVE",
        "cancel_method": "NONE",
        "visible_message": "SOS Test None",
        "location_lat": None,
        "location_long": None,
        "location_map_link": None,
    }
    try:
        res = client.table("sos_alerts").insert(alert_data).execute()
        print("INSERT RESULT NONE:", res)
    except Exception as e:
        print("INSERT EXCEPTION NONE:", type(e), str(e))

if __name__ == "__main__":
    test_insert_none()
