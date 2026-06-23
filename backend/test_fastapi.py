import json
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import settings

client = TestClient(app)

def test_api():
    token = settings.SUPABASE_ANON_KEY # Wait, anon key isn't a valid user JWT. But we can see if it reaches the Supabase auth validation and fails there, or if it somehow gets past.
    # Actually, we can just use the user token if we have one. But we don't.
    # We can mock the get_current_user dependency!
    from app.api import alerts
    from app.core.auth import get_current_user
    
    class MockUser:
        id = 'b2f80fdf-6faa-46f0-9f26-47c0f83d5185'
        
    def mock_get_current_user():
        return {"user": MockUser(), "token": "dummy"}
        
    app.dependency_overrides[get_current_user] = mock_get_current_user
    
    payload = {
        "trigger_type": "MANUAL_SOS",
        "status": "ACTIVE",
        "cancel_method": "NONE",
        "visible_message": "SOS Test via FastAPI",
        "latitude": 12.3,
        "longitude": 45.6,
        "map_link": "http://map"
    }
    
    response = client.post("/api/alerts", json=payload)
    print("STATUS:", response.status_code)
    print("RESPONSE:", response.json())

if __name__ == "__main__":
    test_api()
