"""
Safety Summary API
Provides a consolidated safety status for the current authenticated user.
"""
import logging
import httpx
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.db.client import get_service_role_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/safety", tags=["safety"])

# Location is considered stale after 5 minutes (same as family_locations)
STALE_MINUTES = 5


class SafetySummaryResponse(BaseModel):
    user_id: str
    safe_window_active: bool
    active_journey_id: Optional[str] = None
    sos_active: bool
    missed_check_in: bool
    last_location: Dict[str, Any]
    trusted_place_reached: bool
    summary: str


def _resolve_member_status(service_client, user_id: str) -> tuple:
    """
    Compute a member's current safety status from live data.
    Returns: (sos_active, missed_check_in, safe_window_active, trusted_place_reached)
    """
    sos_active = False
    missed_check_in = False
    safe_window_active = False
    trusted_place_reached = False
    active_journey_id = None

    try:
        # Check for active SOS
        sos = service_client.table("sos_alerts").select("id").eq("user_id", user_id).in_("status", ["ACTIVE", "SILENT_DURESS_ACTIVE"]).limit(1).execute()
        if sos.data:
            sos_active = True
            return sos_active, missed_check_in, safe_window_active, trusted_place_reached, active_journey_id

        # Check for active Safe Window
        journey = service_client.table("safe_windows").select("id, missed_check_in_at, completed_reason, trusted_place_id").eq("user_id", user_id).eq("status", "active").limit(1).execute()
        if journey.data:
            safe_window_active = True
            active_journey_id = journey.data[0].get("id")
            if journey.data[0].get("missed_check_in_at"):
                missed_check_in = True

        # Check for recently completed journey with trusted place reached
        # Look at completed journeys in the last hour
        one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
        completed = service_client.table("safe_windows").select("id, completed_reason, completed_at, trusted_place_id") \
            .eq("user_id", user_id).eq("status", "completed") \
            .eq("completed_reason", "REACHED_TRUSTED_PLACE") \
            .gte("completed_at", one_hour_ago.isoformat().replace("+00:00", "Z")) \
            .order("completed_at", desc=True).limit(1).execute()
        if completed.data:
            trusted_place_reached = True

    except Exception as e:
        logger.warning(f"Error resolving member status: {e}")

    return sos_active, missed_check_in, safe_window_active, trusted_place_reached, active_journey_id


@router.get("/summary", response_model=SafetySummaryResponse)
def get_safety_summary(auth_data: dict = Depends(get_current_user)):
    """
    Returns a consolidated safety summary for the current authenticated user.
    Privacy: only current user's data, no coordinates, no other family members exposed.
    """
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        # Resolve safety status
        sos_active, missed_check_in, safe_window_active, trusted_place_reached, active_journey_id = _resolve_member_status(service_client, user.id)

        # Get last known location from family_member_locations
        stale_threshold = datetime.now(timezone.utc) - timedelta(minutes=STALE_MINUTES)
        last_location = {
            "has_location": False,
            "updated_at": None,
            "is_stale": True,
        }

        try:
            # Get user's active family to find location
            membership = service_client.table("family_members").select("family_id").eq("user_id", user.id).eq("status", "active").execute()
            if membership.data:
                family_id = membership.data[0]["family_id"]
                loc = service_client.table("family_member_locations").select("*").eq("family_id", family_id).eq("user_id", user.id).execute()
                if loc.data:
                    loc_data = loc.data[0]
                    last_location["has_location"] = True
                    last_location["updated_at"] = loc_data.get("updated_at")
                    
                    # Check if stale
                    if loc_data.get("updated_at"):
                        try:
                            dt = datetime.fromisoformat(loc_data["updated_at"].replace("Z", "+00:00"))
                            last_location["is_stale"] = dt < stale_threshold
                        except Exception:
                            last_location["is_stale"] = True
        except Exception as loc_err:
            logger.warning(f"Error fetching last location: {loc_err}")

        # Generate summary text based on priority order
        summary = ""
        if sos_active:
            summary = "SOS alert is active. Your emergency contacts and guardians have been notified."
        elif missed_check_in:
            summary = "You missed a Safe Window check-in. Your guardians have been notified."
        elif safe_window_active:
            if last_location["has_location"] and not last_location["is_stale"]:
                summary = "Your Safe Window is active and your location is being tracked."
            else:
                summary = "Your Safe Window is active. Please ensure location sharing is enabled."
        elif trusted_place_reached:
            summary = "You're safe. Your trusted-place arrival was confirmed and your last location was updated recently."
        elif last_location["has_location"]:
            if last_location["is_stale"]:
                summary = "Your last location update is stale. Please share your location to keep your family informed."
            else:
                summary = "You're safe. Your last location was updated recently."
        else:
            summary = "No recent safety activity available. Start a Safe Window or share your location to keep your family informed."

        return SafetySummaryResponse(
            user_id=user.id,
            safe_window_active=safe_window_active,
            active_journey_id=active_journey_id,
            sos_active=sos_active,
            missed_check_in=missed_check_in,
            last_location=last_location,
            trusted_place_reached=trusted_place_reached,
            summary=summary,
        )
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error fetching safety summary: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
