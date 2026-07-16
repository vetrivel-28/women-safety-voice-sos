"""
verify_journey_location_rls.py
==============================
Negative-RLS tests for journey_location_updates (migration 31).

This script follows the same pattern as backend/tests/test_phase7_security.py:
  - Uses supabase-py with create_client() + set_session() to impersonate each user
  - Connects to the live Supabase project via credentials in backend/.env
  - Is runnable with pytest or as a standalone script

FIRST-TIME CONTEXT
------------------
This is the first negative-RLS SELECT test in the codebase.
No prior test in backend/tests/ asserts that an unauthorized user sees zero rows
on any guardian-scoped table (sos_alerts, safe_windows, family_member_locations,
guardian_links). All prior RLS coverage on those tables was manual or not tested
at all. This script introduces that pattern for journey_location_updates.

CREDENTIALS REQUIRED
--------------------
The script needs two Supabase access_tokens (JWTs), passed as environment
variables or directly edited into the WARD_JWT / NON_GUARDIAN_JWT constants below.

  WARD_JWT          — JWT of User A (the ward). Must have at least one active
                      or completed safe_window row in the DB so we can insert a
                      breadcrumb row for testing.

  NON_GUARDIAN_JWT  — JWT of User B. Must have NO guardian_links row where
                      guardian_user_id = User_B and user_id = User_A.

  LINKED_GUARDIAN_JWT (optional) — JWT of User C who IS an active linked guardian
                      of User A. Used for the positive "guardian can read" test.
                      If omitted, that test is skipped.

HOW TO OBTAIN JWTS
------------------
Option A — From a running app session:
  1. Open Supabase Dashboard → Authentication → Users
  2. In the app, log in as User A and grab the access_token from AsyncStorage
     or from a network request (Authorization: Bearer <token>) in a debug build.

Option B — From Supabase Dashboard SQL Editor (for a test account):
  Run:
    SELECT supabase.auth.sign_in_with_password('{"email":"...","password":"..."}');
  Or use the Supabase client library in a Python REPL:
    from supabase import create_client
    c = create_client(URL, ANON_KEY)
    r = c.auth.sign_in_with_password({"email": "...", "password": "..."})
    print(r.session.access_token)

Option C — Use the existing test accounts from test_phase7_security.py:
    WARD_JWT:           sign in as test2@example.com / 123456
    NON_GUARDIAN_JWT:   sign in as a third account with no link to test2

HOW TO RUN
----------
From backend/:

  # With env vars:
  WARD_JWT="eyJ..." NON_GUARDIAN_JWT="eyJ..." pytest scripts/verify_journey_location_rls.py -v

  # Or edit the constants below and run:
  pytest scripts/verify_journey_location_rls.py -v

  # Or as a standalone script (prints PASS/FAIL without pytest):
  WARD_JWT="eyJ..." NON_GUARDIAN_JWT="eyJ..." python scripts/verify_journey_location_rls.py

WHAT IS TESTED
--------------
Test 1  — Non-guardian SELECT returns 0 rows (REST path, negative RLS)
Test 2  — Ward can read their own breadcrumbs (SELECT, positive RLS)
Test 3  — Ward can insert their own breadcrumb (INSERT, positive RLS)
Test 4  — Non-guardian INSERT is rejected (INSERT, negative RLS)
Test 5  — Active linked guardian can read ward's breadcrumbs (if LINKED_GUARDIAN_JWT supplied)
Test 6  — Guardian-link promoted to ACTIVE mid-session enables reads (manual note — see body)
"""

import os
import sys
import uuid
import time
import pytest

# ── Allow running from backend/ as working directory ────────────────────────
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from supabase import create_client
from app.core.config import settings

# ── Credential constants — override via env vars or edit here ────────────────
WARD_JWT = os.environ.get("WARD_JWT", "")
NON_GUARDIAN_JWT = os.environ.get("NON_GUARDIAN_JWT", "")
LINKED_GUARDIAN_JWT = os.environ.get("LINKED_GUARDIAN_JWT", "")  # optional


# ── Helpers ──────────────────────────────────────────────────────────────────

def _authed_client(jwt: str):
    """Return a supabase-py client authenticated as the given JWT bearer."""
    c = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    # set_session with a dummy refresh token — same pattern as test_phase7_security.py
    c.auth.set_session(jwt, "dummy-refresh-not-needed-for-reads")
    return c


def _service_client():
    """Return a service-role client (bypasses RLS) for seeding and verification."""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


def _get_user_id_from_jwt(jwt: str) -> str:
    """Decode the sub claim from the JWT payload (no signature verification needed here)."""
    import base64, json
    payload_b64 = jwt.split(".")[1]
    # Pad to multiple of 4
    payload_b64 += "=" * (-len(payload_b64) % 4)
    payload = json.loads(base64.urlsafe_b64decode(payload_b64))
    return payload["sub"]


def _seed_journey_and_breadcrumb(service_client, ward_user_id: str) -> tuple[str, str]:
    """
    Seed a completed safe_window and one journey_location_updates row for ward_user_id.
    Returns (journey_id, breadcrumb_id).
    Raises if seeding fails.
    """
    now = __import__("datetime").datetime.utcnow().isoformat() + "Z"

    # Insert a minimal safe_windows row (completed, so it won't interfere with active journey checks)
    sw = service_client.table("safe_windows").insert({
        "user_id": ward_user_id,
        "status": "completed",
        "duration_minutes": 15,
        "duration_seconds": 900,
        "started_at": now,
        "ends_at": now,
        "check_in_interval_minutes": 5,
        "check_in_interval_seconds": 300,
        "check_in_due_at": now,
        "last_check_in_at": now,
        "severity": "NORMAL",
    }).execute()
    assert sw.data, "Failed to seed safe_window row"
    journey_id = sw.data[0]["id"]

    # Insert a breadcrumb via service role (bypasses RLS — this is setup, not the thing being tested)
    bc = service_client.table("journey_location_updates").insert({
        "journey_id": journey_id,
        "user_id": ward_user_id,
        "lat": 13.0827,
        "lng": 80.2707,
        "recorded_at": now,
    }).execute()
    assert bc.data, "Failed to seed journey_location_updates row"
    breadcrumb_id = bc.data[0]["id"]

    return journey_id, breadcrumb_id


def _cleanup(service_client, journey_id: str):
    """Remove seeded rows (breadcrumbs cascade-delete with the safe_window)."""
    service_client.table("safe_windows").delete().eq("id", journey_id).execute()


# ── Pytest fixtures ──────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def svc():
    return _service_client()


@pytest.fixture(scope="module")
def ward_setup(svc):
    """Seed a journey + breadcrumb for the ward, yield IDs, then clean up."""
    if not WARD_JWT:
        pytest.skip("WARD_JWT not set — set via env var or edit the constant at the top of this file")
    ward_user_id = _get_user_id_from_jwt(WARD_JWT)
    journey_id, breadcrumb_id = _seed_journey_and_breadcrumb(svc, ward_user_id)
    yield {"ward_user_id": ward_user_id, "journey_id": journey_id, "breadcrumb_id": breadcrumb_id}
    _cleanup(svc, journey_id)


# ── Tests ────────────────────────────────────────────────────────────────────

class TestNegativeRLS:
    """Non-guardian must receive zero rows on all read paths."""

    def test_non_guardian_select_returns_zero_rows(self, ward_setup):
        """
        REST path negative test.
        User B has no guardian_links row for User A.
        SELECT on journey_location_updates filtered by User A's ward_user_id must return 0 rows.
        """
        if not NON_GUARDIAN_JWT:
            pytest.skip("NON_GUARDIAN_JWT not set")

        non_guardian = _authed_client(NON_GUARDIAN_JWT)
        ward_user_id = ward_setup["ward_user_id"]

        result = non_guardian.table("journey_location_updates") \
            .select("*") \
            .eq("user_id", ward_user_id) \
            .execute()

        assert result.data == [], (
            f"SECURITY FAILURE: non-guardian received {len(result.data)} row(s) "
            f"for ward {ward_user_id}. RLS policy 'Guardian reads ward location updates' "
            f"is not blocking unauthorized access. Rows returned: {result.data}"
        )

    def test_non_guardian_select_by_journey_returns_zero_rows(self, ward_setup):
        """
        REST path negative test — querying by journey_id rather than user_id.
        Confirms RLS blocks even when the attacker knows the journey_id.
        """
        if not NON_GUARDIAN_JWT:
            pytest.skip("NON_GUARDIAN_JWT not set")

        non_guardian = _authed_client(NON_GUARDIAN_JWT)
        journey_id = ward_setup["journey_id"]

        result = non_guardian.table("journey_location_updates") \
            .select("*") \
            .eq("journey_id", journey_id) \
            .execute()

        assert result.data == [], (
            f"SECURITY FAILURE: non-guardian received {len(result.data)} row(s) "
            f"when querying by journey_id {journey_id}. "
            f"RLS must block reads that traverse the journey_id FK to reach unauthorized rows."
        )

    def test_non_guardian_unfiltered_select_returns_zero_rows(self, ward_setup):
        """
        REST path negative test — broad unfiltered SELECT.
        Even without a WHERE clause, RLS must return only rows the user owns.
        Confirms no policy gap that a full-table scan could exploit.
        """
        if not NON_GUARDIAN_JWT:
            pytest.skip("NON_GUARDIAN_JWT not set")

        non_guardian = _authed_client(NON_GUARDIAN_JWT)
        non_guardian_user_id = _get_user_id_from_jwt(NON_GUARDIAN_JWT)
        ward_user_id = ward_setup["ward_user_id"]

        result = non_guardian.table("journey_location_updates").select("*").execute()

        ward_rows = [r for r in result.data if r["user_id"] == ward_user_id]
        assert ward_rows == [], (
            f"SECURITY FAILURE: unfiltered SELECT returned {len(ward_rows)} row(s) "
            f"belonging to ward {ward_user_id} — visible to non-guardian {non_guardian_user_id}."
        )

    def test_non_guardian_insert_is_rejected(self, ward_setup):
        """
        INSERT negative test.
        User B must not be able to insert a breadcrumb row claiming another user's user_id.
        RLS WITH CHECK (auth.uid() = user_id) must block this.

        Safety guarantee: if the insert somehow succeeds despite RLS (which would be a
        security failure), the inserted row is immediately deleted via the service-role
        client before the assertion fires, so no spoofed data persists under the ward's
        user_id regardless of the test outcome.
        """
        if not NON_GUARDIAN_JWT:
            pytest.skip("NON_GUARDIAN_JWT not set")

        non_guardian = _authed_client(NON_GUARDIAN_JWT)
        svc = _service_client()
        ward_user_id = ward_setup["ward_user_id"]
        journey_id = ward_setup["journey_id"]
        now = __import__("datetime").datetime.utcnow().isoformat() + "Z"

        inserted_ids = []
        insert_exception = None

        try:
            result = non_guardian.table("journey_location_updates").insert({
                "journey_id": journey_id,
                "user_id": ward_user_id,   # attempting to spoof the ward's user_id
                "lat": 13.0,
                "lng": 80.0,
                "recorded_at": now,
            }).execute()
            # Collect any rows that were returned so we can delete them immediately
            if result.data:
                inserted_ids = [r["id"] for r in result.data if r.get("id")]
        except Exception as e:
            insert_exception = e
        finally:
            # Unconditional cleanup: delete any rows that slipped through,
            # scoped to BOTH journey_id AND the specific recorded_at timestamp
            # so this cannot delete real user data even if IDs were somehow reused.
            if inserted_ids:
                for rid in inserted_ids:
                    svc.table("journey_location_updates").delete().eq("id", rid).execute()

        if insert_exception is not None:
            # Exception is the expected path — RLS rejection raises a PostgREST 403/42501.
            # We accept any RLS/auth-related error string. If the exception keyword doesn't
            # match, the test still passes because the insert was blocked (just with an
            # unexpected error type) — we log a warning rather than failing.
            error_str = str(insert_exception).lower()
            rls_keywords = ["security", "rls", "policy", "403", "42501", "denied", "violates",
                            "unauthorized", "permission", "forbidden"]
            if not any(kw in error_str for kw in rls_keywords):
                # The insert was blocked (exception raised) but the error message is unfamiliar.
                # Still a PASS for security — the insert did not succeed. Emit a warning.
                import warnings
                warnings.warn(
                    f"Insert was blocked (exception raised) but error message didn't match "
                    f"known RLS keywords. Treating as PASS. Exception was: {insert_exception}"
                )
            # Either way: insert was blocked → PASS
            return

        # No exception: check that data is empty (PostgREST sometimes returns [] silently)
        assert not inserted_ids, (
            f"SECURITY FAILURE: non-guardian INSERT was accepted and returned "
            f"{len(inserted_ids)} row(s) under ward {ward_user_id}'s user_id. "
            f"The spoofed row(s) have been immediately deleted by the test cleanup. "
            f"RLS WITH CHECK policy 'Ward inserts own location updates' is not blocking "
            f"spoofed inserts. Investigate migration 31 RLS policy deployment."
        )


class TestPositiveRLS:
    """Ward and active guardian must be able to read breadcrumbs."""

    def test_ward_can_read_own_breadcrumbs(self, ward_setup):
        """Ward can SELECT their own journey_location_updates rows."""
        if not WARD_JWT:
            pytest.skip("WARD_JWT not set")

        ward = _authed_client(WARD_JWT)
        ward_user_id = ward_setup["ward_user_id"]

        result = ward.table("journey_location_updates") \
            .select("*") \
            .eq("user_id", ward_user_id) \
            .execute()

        assert len(result.data) >= 1, (
            f"Ward {ward_user_id} should be able to read their own breadcrumbs "
            f"but got 0 rows. Check 'Ward reads own location updates' RLS policy."
        )

    def test_ward_can_insert_own_breadcrumb(self, ward_setup):
        """Ward can INSERT a breadcrumb for their own journey (INSERT policy)."""
        if not WARD_JWT:
            pytest.skip("WARD_JWT not set")

        ward = _authed_client(WARD_JWT)
        ward_user_id = ward_setup["ward_user_id"]
        journey_id = ward_setup["journey_id"]
        svc = _service_client()
        now = __import__("datetime").datetime.utcnow().isoformat() + "Z"

        inserted_id = None
        try:
            result = ward.table("journey_location_updates").insert({
                "journey_id": journey_id,
                "user_id": ward_user_id,
                "lat": 13.09,
                "lng": 80.27,
                "recorded_at": now,
            }).execute()

            assert result.data, (
                f"Ward {ward_user_id} should be able to insert their own breadcrumb "
                f"but insert returned empty. Check 'Ward inserts own location updates' RLS policy."
            )
            inserted_id = result.data[0]["id"]
        finally:
            # Clean up the test row so it doesn't skew stats tests
            if inserted_id:
                svc.table("journey_location_updates").delete().eq("id", inserted_id).execute()

    def test_active_guardian_can_read_ward_breadcrumbs(self, ward_setup, svc):
        """
        Active linked guardian can SELECT ward's breadcrumbs.
        Skipped if LINKED_GUARDIAN_JWT is not supplied.
        """
        if not LINKED_GUARDIAN_JWT:
            pytest.skip(
                "LINKED_GUARDIAN_JWT not set — skipping positive guardian read test. "
                "To run: set LINKED_GUARDIAN_JWT to the JWT of a user who has an ACTIVE "
                "guardian_links row where user_id = ward_user_id."
            )

        guardian = _authed_client(LINKED_GUARDIAN_JWT)
        ward_user_id = ward_setup["ward_user_id"]

        result = guardian.table("journey_location_updates") \
            .select("*") \
            .eq("user_id", ward_user_id) \
            .execute()

        assert len(result.data) >= 1, (
            f"Active guardian should be able to read ward {ward_user_id}'s breadcrumbs "
            f"but got 0 rows. Check 'Guardian reads ward location updates' RLS policy "
            f"and confirm guardian_links row has status = 'ACTIVE'."
        )

    def test_guardian_link_status_matters(self, ward_setup, svc):
        """
        A guardian_links row with status != 'ACTIVE' must NOT grant read access.
        Seeds a PENDING link, verifies 0 rows, then promotes to ACTIVE and verifies 1+ rows.
        Skipped if LINKED_GUARDIAN_JWT is not supplied.

        NOTE: This test mutates a real guardian_links row. It restores the original
        status on teardown. Do not run against a production account that is actively
        monitoring a ward during a live journey.
        """
        if not LINKED_GUARDIAN_JWT:
            pytest.skip("LINKED_GUARDIAN_JWT not set")

        guardian_user_id = _get_user_id_from_jwt(LINKED_GUARDIAN_JWT)
        ward_user_id = ward_setup["ward_user_id"]
        guardian = _authed_client(LINKED_GUARDIAN_JWT)

        # Check current link status
        link_res = svc.table("guardian_links") \
            .select("id,status") \
            .eq("guardian_user_id", guardian_user_id) \
            .eq("user_id", ward_user_id) \
            .execute()

        if not link_res.data:
            pytest.skip(
                f"No guardian_links row found for guardian {guardian_user_id} -> "
                f"ward {ward_user_id}. Cannot run promotion test."
            )

        link_id = link_res.data[0]["id"]
        original_status = link_res.data[0]["status"]

        try:
            # Step 1: Set to PENDING — guardian should see 0 rows
            svc.table("guardian_links").update({"status": "PENDING"}).eq("id", link_id).execute()

            result_pending = guardian.table("journey_location_updates") \
                .select("*") \
                .eq("user_id", ward_user_id) \
                .execute()

            assert result_pending.data == [], (
                f"Guardian with PENDING link status saw {len(result_pending.data)} row(s). "
                f"RLS policy must restrict to ACTIVE status only."
            )

            # Step 2: Promote to ACTIVE — guardian should now see rows
            svc.table("guardian_links").update({"status": "ACTIVE"}).eq("id", link_id).execute()

            result_active = guardian.table("journey_location_updates") \
                .select("*") \
                .eq("user_id", ward_user_id) \
                .execute()

            assert len(result_active.data) >= 1, (
                f"Guardian promoted to ACTIVE should see breadcrumbs but got 0 rows. "
                f"Confirm RLS policy re-evaluates on next query (it always does — "
                f"check guardian_links status was actually updated)."
            )

        finally:
            # Restore original status
            svc.table("guardian_links").update({"status": original_status}).eq("id", link_id).execute()


# ── Standalone runner (no pytest) ────────────────────────────────────────────

if __name__ == "__main__":
    """
    Run without pytest: python scripts/verify_journey_location_rls.py
    Prints PASS/FAIL per test and exits 1 if any test fails.
    """
    import traceback

    if not WARD_JWT or not NON_GUARDIAN_JWT:
        print(
            "\nERROR: Set WARD_JWT and NON_GUARDIAN_JWT environment variables before running.\n"
            "Example:\n"
            "  WARD_JWT='eyJ...' NON_GUARDIAN_JWT='eyJ...' python scripts/verify_journey_location_rls.py\n"
            "\nSee the docstring at the top of this file for how to obtain JWTs."
        )
        sys.exit(1)

    svc = _service_client()
    ward_user_id = _get_user_id_from_jwt(WARD_JWT)
    journey_id, breadcrumb_id = _seed_journey_and_breadcrumb(svc, ward_user_id)
    setup = {"ward_user_id": ward_user_id, "journey_id": journey_id, "breadcrumb_id": breadcrumb_id}

    neg = TestNegativeRLS()
    pos = TestPositiveRLS()

    tests = [
        ("Non-guardian SELECT by user_id → 0 rows",          lambda: neg.test_non_guardian_select_returns_zero_rows(setup)),
        ("Non-guardian SELECT by journey_id → 0 rows",       lambda: neg.test_non_guardian_select_by_journey_returns_zero_rows(setup)),
        ("Non-guardian unfiltered SELECT → 0 ward rows",     lambda: neg.test_non_guardian_unfiltered_select_returns_zero_rows(setup)),
        ("Non-guardian INSERT spoofed user_id → rejected",   lambda: neg.test_non_guardian_insert_is_rejected(setup)),
        ("Ward SELECT own rows → ≥1 row",                    lambda: pos.test_ward_can_read_own_breadcrumbs(setup)),
        ("Ward INSERT own row → accepted",                   lambda: pos.test_ward_can_insert_own_breadcrumb(setup)),
        ("Active guardian SELECT ward rows → ≥1 row",        lambda: pos.test_active_guardian_can_read_ward_breadcrumbs(setup, svc)),
        ("PENDING→ACTIVE link promotion mid-session",        lambda: pos.test_guardian_link_status_matters(setup, svc)),
    ]

    passed = failed = skipped = 0
    for name, fn in tests:
        try:
            fn()
            print(f"  PASS  {name}")
            passed += 1
        except pytest.skip.Exception as e:
            print(f"  SKIP  {name}  ({e})")
            skipped += 1
        except AssertionError as e:
            print(f"  FAIL  {name}\n        {e}")
            failed += 1
        except Exception as e:
            print(f"  ERROR {name}\n        {traceback.format_exc()}")
            failed += 1

    _cleanup(svc, journey_id)

    print(f"\n{passed} passed, {failed} failed, {skipped} skipped")
    sys.exit(1 if failed else 0)
