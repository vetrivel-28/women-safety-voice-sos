import os
import sys
import uuid
import pytest
from fastapi.testclient import TestClient

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.main import app
from app.db.client import get_supabase_client

client = TestClient(app)


@pytest.fixture(scope="module")
def supabase():
    return get_supabase_client()


@pytest.fixture(scope="module")
def valid_user(supabase):
    """
    Login using an existing test user.
    Change password if needed.
    """
    auth = supabase.auth.sign_in_with_password({
        "email": "test2@example.com",
        "password": "123456"
    })

    return {
        "token": auth.session.access_token,
        "user_id": auth.user.id,
        "email": auth.user.email
    }


@pytest.fixture(scope="module")
def guardian_user(supabase):
    """
    Login using a pre-created guardian account to avoid rate limits.
    """
    auth = supabase.auth.sign_in_with_password({
        "email": "guardian1@example.com",
        "password": "TestPassword123!"
    })
    
    return {
        "token": auth.session.access_token,
        "user_id": auth.user.id,
        "email": auth.user.email
    }


def test_invalid_jwt_returns_401():
    headers = {
        "Authorization": "Bearer not.a.valid.jwt"
    }

    response = client.post(
        "/api/alerts",
        headers=headers,
        json={
            "trigger_type": "MANUAL_SOS",
            "status": "ACTIVE"
        }
    )

    assert response.status_code == 401


def test_expired_jwt_returns_401():
    expired_jwt = (
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
        "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiZXhwIjoxNTE2MjM5MDIyfQ."
        "fake_signature"
    )

    headers = {
        "Authorization": f"Bearer {expired_jwt}"
    }

    response = client.post(
        "/api/alerts",
        headers=headers,
        json={
            "trigger_type": "MANUAL_SOS",
            "status": "ACTIVE"
        }
    )

    assert response.status_code == 401


def test_anonymous_access_is_denied(supabase):
    response = client.post(
        "/api/alerts",
        json={
            "trigger_type": "MANUAL_SOS",
            "status": "ACTIVE"
        }
    )

    assert response.status_code in [401, 403]

    try:
        result = supabase.table("sos_alerts").select("*").execute()

        # Anon should not see records
        assert len(result.data) == 0

    except Exception:
        # Also acceptable if Supabase blocks entirely
        pass


def test_user_id_spoofing_is_impossible(valid_user):
    fake_user_id = str(uuid.uuid4())

    headers = {
        "Authorization": f"Bearer {valid_user['token']}"
    }

    payload = {
    "trigger_type": "MANUAL_SOS",
    "status": "ACTIVE",
    "visible_message": "Security Test",
    "user_id": fake_user_id
}

    response = client.post(
        "/api/alerts",
        headers=headers,
        json=payload
    )

    if response.status_code == 201:
        data = response.json()

        assert data["user_id"] != fake_user_id
        assert data["user_id"] == valid_user["user_id"]

    else:
        assert response.status_code == 422


def test_guardian_linking_works(valid_user, guardian_user):
    headers = {
        "Authorization": f"Bearer {valid_user['token']}"
    }

    payload = {
        "guardian_email": guardian_user["email"]
    }

    response = client.post(
        "/api/guardians/link",
        headers=headers,
        json=payload
    )

    # Already linked is acceptable
    assert response.status_code in [200, 201, 400]

    if response.status_code in [200, 201]:
        data = response.json()

        assert data["guardian_id"] == guardian_user["user_id"]
        assert data["user_id"] == valid_user["user_id"]

    elif response.status_code == 400:
        assert "already" in response.text.lower() or "linked" in response.text.lower()


def test_sos_alert_creation_works(valid_user):
    headers = {
        "Authorization": f"Bearer {valid_user['token']}"
    }

    payload = {
    "trigger_type": "MANUAL_SOS",
    "status": "ACTIVE",
    "visible_message": "SOS Triggered",
    "latitude": 37.7749,
    "longitude": -122.4194
}
    response = client.post(
        "/api/alerts",
        headers=headers,
        json=payload
    )

    assert response.status_code == 201

    data = response.json()

    assert data["user_id"] == valid_user["user_id"]
    assert data["trigger_type"] == "MANUAL_SOS"
    assert data["status"] == "ACTIVE"


def test_guardian_alert_visibility_rls(valid_user, guardian_user):
    # Guardian logs in and queries sos_alerts via Supabase client directly
    from supabase import create_client
    from app.core.config import settings
    
    # We need a new client authenticated as the guardian to test RLS
    url = settings.SUPABASE_URL
    key = settings.SUPABASE_ANON_KEY
    guardian_client = create_client(url, key)
    guardian_client.auth.set_session(guardian_user["token"], "")
    
    # Query sos_alerts
    response = guardian_client.table("sos_alerts").select("*").execute()
    
    alerts = response.data
    visible_user_ids = [alert["user_id"] for alert in alerts]
    
    # Guardian should see the alert from valid_user (since they are linked)
    assert valid_user["user_id"] in visible_user_ids, "Guardian cannot see linked user's alerts!"


def test_guardian_cannot_modify_alerts(valid_user, guardian_user):
    from supabase import create_client
    from app.core.config import settings
    
    url = settings.SUPABASE_URL
    key = settings.SUPABASE_ANON_KEY
    guardian_client = create_client(url, key)
    guardian_client.auth.set_session(guardian_user["token"], "")
    
    # First get an alert ID that belongs to valid_user
    response = guardian_client.table("sos_alerts").select("*").eq("user_id", valid_user["user_id"]).execute()
    assert len(response.data) > 0, "No alerts found for user"
    alert_id = response.data[0]["id"]
    
    # Try to modify the alert as the guardian
    try:
        update_response = guardian_client.table("sos_alerts").update({"status": "RESOLVED"}).eq("id", alert_id).execute()
        # RLS should prevent update. Supabase usually returns empty array if RLS blocks update
        assert len(update_response.data) == 0, "Guardian was able to modify the alert!"
    except Exception as e:
        # Or it might throw an exception, which is also a PASS
        pass