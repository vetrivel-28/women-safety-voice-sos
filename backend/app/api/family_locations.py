"""
Family Live Location API
Manages family member location sharing for the live map feature.
"""
import logging
import httpx
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.auth import get_current_user
from app.db.client import get_service_role_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/family", tags=["family-locations"])

# Location is considered stale after 5 minutes
STALE_MINUTES = 5


class LocationUpdate(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    status: Optional[str] = None   # SAFE | IN_SAFE_WINDOW | SOS_ACTIVE | CHECKIN_MISSED | OFFLINE
    source: Optional[str] = None


class SharingToggle(BaseModel):
    sharing_enabled: bool


def _resolve_member_status(service_client, user_id: str) -> str:
    """Compute a member's current safety status from live data."""
    try:
        sos = service_client.table("sos_alerts").select("id").eq("user_id", user_id).in_("status", ["ACTIVE", "SILENT_DURESS_ACTIVE"]).limit(1).execute()
        if sos.data:
            return "SOS_ACTIVE"
        journey = service_client.table("safe_windows").select("id, missed_check_in_at").eq("user_id", user_id).eq("status", "active").limit(1).execute()
        if journey.data:
            if journey.data[0].get("missed_check_in_at"):
                return "CHECKIN_MISSED"
            return "IN_SAFE_WINDOW"
    except Exception:
        pass
    return "SAFE"


@router.get("/{family_id}/locations")
def get_family_locations(family_id: str, auth_data: dict = Depends(get_current_user)):
    """
    Returns location sharing state for all active members.
    If sharing_enabled is false, coordinates are omitted.
    """
    user = auth_data["user"]
    service_client = get_service_role_client()
    try:
        # Auth and members fetch
        members_res = (
            service_client.table("family_members")
            .select("id, user_id, role, status, profiles:user_id(id, full_name, email)")
            .eq("family_id", family_id)
            .eq("status", "active")
            .execute()
        )
        
        # Verify caller is in the active members list
        is_member = any(m["user_id"] == user.id for m in members_res.data or [])
        if not is_member:
            raise HTTPException(status_code=403, detail="Not an active member of this family")

        members = members_res.data or []

        # Fetch all locations for this family
        locs_res = (
            service_client.table("family_member_locations")
            .select("*")
            .eq("family_id", family_id)
            .execute()
        )
        
        loc_map = {loc["user_id"]: loc for loc in locs_res.data or []}

        stale_threshold = datetime.now(timezone.utc) - timedelta(minutes=STALE_MINUTES)
        result = []
        
        for m in members:
            loc = loc_map.get(m["user_id"])
            has_location = bool(loc)
            
            # Default missing locations to safe offline state
            loc_data = loc or {}
            sharing_enabled = loc_data.get("sharing_enabled", False)
            status = loc_data.get("status", "OFFLINE")
            is_stale = False
            
            if has_location and loc_data.get("updated_at"):
                try:
                    dt = datetime.fromisoformat(loc_data["updated_at"].replace("Z", "+00:00"))
                    if dt < stale_threshold:
                        status = "OFFLINE"
                        is_stale = True
                    else:
                        is_stale = False
                except Exception:
                    is_stale = True
            
            resp_obj = {
                "id": loc_data.get("id"),
                "family_id": family_id,
                "user_id": m["user_id"],
                "role": m["role"],
                "profiles": m.get("profiles"),
                "has_location": has_location,
                "sharing_enabled": sharing_enabled,
                "status": status,
                "source": loc_data.get("source"),
                "updated_at": loc_data.get("updated_at"),
                "is_stale": is_stale,
            }
            
            # Privacy mask: omit coordinates if not sharing
            if sharing_enabled:
                resp_obj["latitude"] = loc_data.get("latitude")
                resp_obj["longitude"] = loc_data.get("longitude")
                resp_obj["accuracy"] = loc_data.get("accuracy")
            else:
                resp_obj["latitude"] = None
                resp_obj["longitude"] = None
                resp_obj["accuracy"] = None
                
            result.append(resp_obj)

        return result
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error fetching family locations: {str(e)}", exc_info=True)
        # Return detailed error if it's a Supabase error string
        detail_msg = f"Could not fetch family locations: {str(e)}"
        raise HTTPException(status_code=500, detail=detail_msg)


@router.put("/me/location")
@router.post("/me/location")
def update_my_location(location_in: LocationUpdate, auth_data: dict = Depends(get_current_user)):
    """
    Current user upserts their location for their active family.
    Only works if the user is an active family member.
    """
    user = auth_data["user"]
    service_client = get_service_role_client()
    try:
        membership = (
            service_client.table("family_members")
            .select("family_id")
            .eq("user_id", user.id)
            .eq("status", "active")
            .execute()
        )
        if not membership.data:
            raise HTTPException(status_code=400, detail="Not an active family member")

        family_id = membership.data[0]["family_id"]
        now_str = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

        # Resolve live safety status if not explicitly provided
        live_status = location_in.status or _resolve_member_status(service_client, user.id)

        row = {
            "family_id": family_id,
            "user_id": user.id,
            "latitude": location_in.latitude,
            "longitude": location_in.longitude,
            "accuracy": location_in.accuracy,
            "status": live_status,
            "source": location_in.source,
            "updated_at": now_str,
        }

        # Upsert on (family_id, user_id) unique constraint
        res = (
            service_client.table("family_member_locations")
            .upsert(row, on_conflict="family_id,user_id")
            .execute()
        )
        return res.data[0] if res.data else {"detail": "Location updated"}
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error updating family location: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not update location")


@router.patch("/me/location-sharing")
def update_location_sharing(toggle: SharingToggle, auth_data: dict = Depends(get_current_user)):
    """Toggle whether this user's location is shared with their family."""
    user = auth_data["user"]
    service_client = get_service_role_client()
    try:
        membership = (
            service_client.table("family_members")
            .select("family_id")
            .eq("user_id", user.id)
            .eq("status", "active")
            .execute()
        )
        if not membership.data:
            raise HTTPException(status_code=400, detail="Not an active family member")

        family_id = membership.data[0]["family_id"]
        now_str = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

        # If a location row exists, update sharing_enabled; otherwise create it at (0,0) as placeholder
        existing = (
            service_client.table("family_member_locations")
            .select("id")
            .eq("family_id", family_id)
            .eq("user_id", user.id)
            .execute()
        )

        if existing.data:
            service_client.table("family_member_locations").update(
                {"sharing_enabled": toggle.sharing_enabled, "updated_at": now_str}
            ).eq("family_id", family_id).eq("user_id", user.id).execute()
        elif not toggle.sharing_enabled:
            # Only insert placeholder if turning OFF, using null coordinates
            service_client.table("family_member_locations").insert({
                "family_id": family_id,
                "user_id": user.id,
                "status": "OFFLINE",
                "sharing_enabled": False,
                "updated_at": now_str,
            }).execute()

        return {"sharing_enabled": toggle.sharing_enabled}
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error updating location sharing: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not update sharing preference")
