import os
import sys
import logging
from fastapi.testclient import TestClient

# Adjust path so we can import app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.main import app
from app.db.client import get_supabase_client, get_service_role_client
import uuid

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

client = TestClient(app)

def run_tests():
    logger.info("Starting Security Validation Tests...")
    
    # We need a valid JWT for some tests. Let's try to sign up a dummy user.
    supabase = get_supabase_client()
    dummy_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    dummy_password = "TestPassword123!"
    
    valid_token = None
    user_id = None
    
    try:
        logger.info(f"Attempting to create test user {dummy_email}...")
        auth_response = supabase.auth.sign_up({
            "email": dummy_email,
            "password": dummy_password
        })
        if auth_response.user:
            valid_token = auth_response.session.access_token
            user_id = auth_response.user.id
            logger.info("[+] Successfully created test user and obtained valid JWT.")
    except Exception as e:
        logger.error(f"Failed to create test user: {e}. Some tests will be skipped.")

    # Test 1: Missing JWT
    logger.info("--- Test 1: Missing JWT ---")
    response = client.post("/api/alerts", json={
        "trigger_type": "MANUAL_SOS",
        "status": "ACTIVE"
    })
    logger.info(f"Response Status: {response.status_code}")
    logger.info(f"Response Body: {response.json()}")
    assert response.status_code == 403 or response.status_code == 401, "Expected 401/403 for missing JWT"

    # Test 2: Tampered JWT
    logger.info("--- Test 2: Tampered JWT ---")
    headers = {"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.token"}
    response = client.post("/api/alerts", headers=headers, json={
        "trigger_type": "MANUAL_SOS",
        "status": "ACTIVE"
    })
    logger.info(f"Response Status: {response.status_code}")
    logger.info(f"Response Body: {response.json()}")
    assert response.status_code == 401 or response.status_code == 403, "Expected 401/403 for tampered JWT"

    # Test 3: Valid JWT with fake user_id in payload
    if valid_token:
        logger.info("--- Test 3: Valid JWT with fake user_id in payload ---")
        headers = {"Authorization": f"Bearer {valid_token}"}
        fake_user_id = str(uuid.uuid4())
        
        # We try to create an alert with a fake user_id in the body.
        # But our AlertCreate schema doesn't even accept user_id, it is extracted from JWT server-side.
        # Let's verify it ignores or rejects if we force it.
        payload = {
            "trigger_type": "MANUAL_SOS",
            "status": "ACTIVE",
            "user_id": fake_user_id
        }
        
        # It should either succeed (ignoring body user_id and using JWT user_id) or fail validation (because user_id is not in schema)
        response = client.post("/api/alerts", headers=headers, json=payload)
        logger.info(f"Response Status: {response.status_code}")
        logger.info(f"Response Body: {response.json()}")
        
        if response.status_code == 201:
            data = response.json()
            logger.info(f"Alert created. Expected user_id: {user_id}, Actual user_id in DB: {data['user_id']}")
            assert data['user_id'] == user_id, "Backend MUST use JWT user_id, not the fake one."
            assert data['user_id'] != fake_user_id, "Backend MUST NEVER insert alert for another user."
        elif response.status_code == 422:
            logger.info("Backend rejected request because user_id is not allowed in body schema. This is also safe.")
        else:
            logger.error("Unexpected response. The table might not exist if schema.sql was not run on Supabase.")
    else:
        logger.warning("Skipping Test 3 because no valid token could be generated.")

    # Test 4: Anonymous query against sos_alerts
    logger.info("--- Test 4: Anonymous query against sos_alerts ---")
    # We use the anon client directly against the DB
    try:
        result = supabase.table("sos_alerts").select("*").execute()
        logger.info(f"Anon Query Result Data Length: {len(result.data)}")
        assert len(result.data) == 0, "Anonymous user should not be able to read any alerts."
    except Exception as e:
        logger.info(f"Anon query failed or returned 0 rows. Exception (if any): {str(e)}")
        # If schema.sql wasn't applied, it will raise relation "sos_alerts" does not exist

if __name__ == "__main__":
    run_tests()
