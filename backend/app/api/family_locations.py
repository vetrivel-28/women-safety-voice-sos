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


class NearbyResponder(BaseModel):
    user_id: str
    name: str
    role: str
    distance_km: float
    last_updated: str
    status: str


class NearbyRespondersResponse(BaseModel):
    family_id: str
    origin_available: bool
    responders: list[NearbyResponder]


def _haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate distance between two points in meters using the Haversine formula.
    Consistent with mobile distanceBetweenPointsMeters logic.
    """
    import math
    R = 6371000  # Earth's radius in meters
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = (math.sin(delta_lat / 2) ** 2 +
         math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c


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

        print(f"[LOCATIONS RESPONSE DEBUG] familyId={family_id} count={len(result)}", flush=True)
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


@router.get("/{family_id}/nearby-responders", response_model=NearbyRespondersResponse)
def get_nearby_responders(family_id: str, auth_data: dict = Depends(get_current_user)):
    """
    Returns nearby family members who can respond to emergencies.
    Origin: current authenticated user's last known location.
    Privacy: no coordinates returned, excludes self and members without sharing enabled.
    """
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        # Reuse the exact membership/security check from /api/family/{family_id}/locations
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

        # Get current user's last known location as origin
        locs_res = (
            service_client.table("family_member_locations")
            .select("*")
            .eq("family_id", family_id)
            .eq("user_id", user.id)
            .execute()
        )

        origin_available = False
        origin_lat = None
        origin_lon = None

        if locs_res.data and locs_res.data[0].get("sharing_enabled"):
            loc_data = locs_res.data[0]
            origin_lat = loc_data.get("latitude")
            origin_lon = loc_data.get("longitude")
            if origin_lat is not None and origin_lon is not None:
                origin_available = True

        if not origin_available:
            return NearbyRespondersResponse(
                family_id=family_id,
                origin_available=False,
                responders=[]
            )

        # Fetch all locations for this family
        all_locs_res = (
            service_client.table("family_member_locations")
            .select("*")
            .eq("family_id", family_id)
            .execute()
        )
        
        loc_map = {loc["user_id"]: loc for loc in all_locs_res.data or []}

        responders = []
        
        for m in members:
            # Skip self
            if m["user_id"] == user.id:
                continue
            
            loc = loc_map.get(m["user_id"])
            
            # Must have location, sharing enabled, and valid coordinates
            if not loc:
                continue
            if not loc.get("sharing_enabled"):
                continue
            if loc.get("latitude") is None or loc.get("longitude") is None:
                continue
            
            try:
                lat = float(loc["latitude"])
                lon = float(loc["longitude"])
            except (ValueError, TypeError):
                continue
            
            # Calculate distance
            distance_meters = _haversine_distance_meters(origin_lat, origin_lon, lat, lon)
            distance_km = round(distance_meters / 1000.0, 2)
            
            # Get member status
            status = _resolve_member_status(service_client, m["user_id"])
            
            # Get name from profile
            profile = m.get("profiles", {})
            name = profile.get("full_name") or profile.get("email") or m["user_id"]
            
            responders.append({
                "user_id": m["user_id"],
                "name": name,
                "role": m["role"],
                "distance_km": distance_km,
                "last_updated": loc.get("updated_at"),
                "status": status,
            })
        
        # Sort by distance (nearest first)
        responders.sort(key=lambda r: r["distance_km"])
        
        return NearbyRespondersResponse(
            family_id=family_id,
            origin_available=True,
            responders=responders
        )
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error fetching nearby responders: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
