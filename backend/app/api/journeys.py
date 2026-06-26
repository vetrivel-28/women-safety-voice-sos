import logging
from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
import math

from app.core.auth import get_current_user
from app.db.client import get_user_supabase_client, get_service_role_client
from app.services.notification_service import notification_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/journeys", tags=["journeys"])

class JourneyCreate(BaseModel):
    duration_minutes: Optional[int] = None
    durationSeconds: Optional[int] = None
    start_latitude: Optional[float] = None
    start_longitude: Optional[float] = None
    start_address: Optional[str] = None
    destination_latitude: Optional[float] = None
    destination_longitude: Optional[float] = None
    destination_address: Optional[str] = None
    destination: Optional[str] = None
    expected_duration_minutes: Optional[int] = None
    journey_name: Optional[str] = "Safe Journey"

    class Config:
        extra = "allow"

class JourneyResponse(BaseModel):
    id: str
    user_id: str
    status: str
    started_at: datetime
    ends_at: Optional[datetime]
    completed_at: Optional[datetime]
    missed_at: Optional[datetime]
    duration_minutes: Optional[int]
    duration_seconds: Optional[int]
    start_latitude: Optional[float]
    start_longitude: Optional[float]
    start_address: Optional[str]
    destination_latitude: Optional[float]
    destination_longitude: Optional[float]
    destination_address: Optional[str]
    current_latitude: Optional[float]
    current_longitude: Optional[float]
    current_address: Optional[str]
    last_location_at: Optional[datetime]

    class Config:
        extra = "allow"

def parse_utc(value):
    if not value:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

@router.post("", response_model=JourneyResponse, status_code=status.HTTP_201_CREATED)
def start_journey(journey_in: dict, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    supabase = get_user_supabase_client(auth_data["token"])

    try:
        # Pre-check for active journey
        existing = supabase.table("safe_windows").select("id").eq("user_id", user.id).eq("status", "active").execute()
        if existing.data:
            raise HTTPException(status_code=409, detail="You already have an active safe window. End it before starting another.")

        now = datetime.now(timezone.utc)
        
        dur_secs_in = journey_in.get("duration_seconds") or journey_in.get("durationSeconds")
        dur_mins_in = journey_in.get("duration_minutes")
        
        duration_seconds_int = (
            int(dur_secs_in) if dur_secs_in is not None
            else int(float(dur_mins_in) * 60) if dur_mins_in is not None
            else 900
        )
        duration_minutes_int = max(1, math.ceil(duration_seconds_int / 60))

        interval_secs_in = journey_in.get("check_in_interval_seconds")
        interval_mins_in = journey_in.get("check_in_interval_minutes")

        check_in_interval_seconds_int = (
            int(interval_secs_in) if interval_secs_in is not None
            else duration_seconds_int if duration_seconds_int <= 60
            else int(float(interval_mins_in) * 60) if interval_mins_in is not None
            else 300
        )
        check_in_interval_minutes_int = max(1, math.ceil(check_in_interval_seconds_int / 60))
            
        from datetime import timedelta
        ends_at = now + timedelta(seconds=duration_seconds_int)
        check_in_due_at = now + timedelta(seconds=check_in_interval_seconds_int)
        if check_in_due_at > ends_at:
            check_in_due_at = ends_at
            
        assert check_in_due_at <= ends_at, "Check in due time must be <= ends at"
            
        journey_data = {
            "user_id": user.id,
            "status": "active",
            "duration_minutes": duration_minutes_int,
            "duration_seconds": duration_seconds_int,
            "check_in_interval_minutes": check_in_interval_minutes_int,
            "check_in_interval_seconds": check_in_interval_seconds_int,
            "start_latitude": journey_in.get("start_latitude"),
            "start_longitude": journey_in.get("start_longitude"),
            "start_address": journey_in.get("start_address") or journey_in.get("from"),
            "destination_latitude": journey_in.get("destination_latitude"),
            "destination_longitude": journey_in.get("destination_longitude"),
            "destination_address": journey_in.get("destination_address") or journey_in.get("destination") or journey_in.get("to"),
            "started_at": now.isoformat().replace("+00:00", "Z"),
            "ends_at": ends_at.isoformat().replace("+00:00", "Z"),
            "last_check_in_at": now.isoformat().replace("+00:00", "Z"),
            "check_in_due_at": check_in_due_at.isoformat().replace("+00:00", "Z")
        }
        
        result = supabase.table("safe_windows").insert(journey_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to start journey")

        # TEMP DEBUG — remove before final commit
        print(f"POST /api/journeys START: current_user.id={user.id}, created row id={result.data[0]['id']}")

        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        # Catch unique index violation race condition
        if 'duplicate key value' in str(e) or 'one_active_safe_window_per_user' in str(e):
            raise HTTPException(status_code=409, detail="You already have an active safe window. End it before starting another.")
        logger.error(f"Error starting journey: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("", response_model=List[JourneyResponse])
def get_journeys(auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    supabase = get_user_supabase_client(auth_data["token"])

    try:
        result = supabase.table("safe_windows").select("*").eq("user_id", user.id).order("started_at", desc=True).execute()
        
        # TEMP DEBUG — remove before final commit
        print(f"GET /api/journeys current_user.id: {user.id}")
        print(f"GET /api/journeys row count: {len(result.data) if result.data else 0}")
        
        return result.data
    except Exception as e:
        logger.error(f"Error fetching journeys: {str(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail={"error": "Database unavailable", "message": str(e)})

@router.post("/{journey_id}/complete", response_model=JourneyResponse)
def complete_journey(journey_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    supabase = get_user_supabase_client(auth_data["token"])

    try:
        now_str = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        update_data = {
            "status": "completed",
            "completed_at": now_str
        }
        result = supabase.table("safe_windows").update(update_data).eq("id", journey_id).eq("user_id", user.id).eq("status", "active").execute()
        if not result.data:
            # Check if it exists but just isn't active
            existing = supabase.table("safe_windows").select("*").eq("id", journey_id).eq("user_id", user.id).execute()
            if not existing.data:
                raise HTTPException(status_code=404, detail="Journey not found")
            return existing.data[0] # already completed/missed
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error completing journey: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{journey_id}/check-in", response_model=JourneyResponse)
def check_in_journey(journey_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        # Fetch the row to see ends_at and interval
        existing = service_client.table("safe_windows").select("*").eq("id", journey_id).eq("user_id", user.id).eq("status", "active").execute()
        if not existing.data:
            # Maybe already completed/missed?
            fetch_any = service_client.table("safe_windows").select("*").eq("id", journey_id).eq("user_id", user.id).execute()
            if not fetch_any.data:
                raise HTTPException(status_code=404, detail="Journey not found")
            return fetch_any.data[0]
            
        journey = existing.data[0]
        now = datetime.now(timezone.utc)
        
        # Parse ends_at
        ends_at_dt = parse_utc(journey["ends_at"])
        check_in_due_dt = parse_utc(journey.get("check_in_due_at"))
        
        if now >= ends_at_dt:
            # Mark completed instead of extending
            update_res = service_client.table("safe_windows").update({
                "status": "completed",
                "completed_at": now.isoformat().replace("+00:00", "Z")
            }).eq("id", journey_id).eq("user_id", user.id).eq("status", "active").execute()
            return update_res.data[0] if update_res.data else journey
            
        if check_in_due_dt and now >= check_in_due_dt:
            # Late check-in routing -> missed
            return handle_missed_checkin(journey_id, auth_data)

        # Otherwise standard check-in
        interval_secs = journey.get("check_in_interval_seconds")
        if not interval_secs:
            interval_mins = float(journey.get("check_in_interval_minutes") or 5)
            interval_secs = int(interval_mins * 60)
            
        from datetime import timedelta
        check_in_due_at = now + timedelta(seconds=interval_secs)
        if check_in_due_at > ends_at_dt:
            check_in_due_at = ends_at_dt
            
        update_data = {
            "last_check_in_at": now.isoformat().replace("+00:00", "Z"),
            "check_in_due_at": check_in_due_at.isoformat().replace("+00:00", "Z")
        }
        
        result = service_client.table("safe_windows").update(update_data).eq("id", journey_id).eq("user_id", user.id).eq("status", "active").execute()
        return result.data[0] if result.data else journey
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking in: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{journey_id}/missed-checkin", status_code=status.HTTP_200_OK)
def handle_missed_checkin(journey_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        now_str = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        # Mark journey as missed atomically
        update_res = service_client.table("safe_windows").update({
            "status": "missed",
            "missed_at": now_str,
            "missed_check_in_at": now_str
        }).eq("id", journey_id).eq("user_id", user.id).eq("status", "active").execute()
        
        if not update_res.data:
            # Check if it was already updated
            existing = service_client.table("safe_windows").select("*").eq("id", journey_id).eq("user_id", user.id).execute()
            if not existing.data:
                raise HTTPException(status_code=404, detail="Journey not found")
            journey = existing.data[0]
            return {"success": True, "safe_window": journey, "alert": None, "guardian_notified": False, "reason": "Already processed"}
            
        journey = update_res.data[0]
        
        # Check if SOS alert already exists to prevent duplicate
        sos_existing = service_client.table("sos_alerts").select("id").eq("safe_window_id", journey_id).eq("trigger_type", "JOURNEY_MISSED_CHECKIN").execute()
        
        alert_data = None
        guardian_notified = False
        reason = "Alert already exists"
        
        if not sos_existing.data:
            # Create an SOS Alert
            sos_data = {
                "user_id": user.id,
                "trigger_type": "JOURNEY_MISSED_CHECKIN",
                "safe_window_id": journey_id,
                "status": "ACTIVE",
                "location_lat": journey.get("start_latitude"),
                "location_long": journey.get("start_longitude")
            }
            
            sos_res = service_client.table("sos_alerts").insert(sos_data).execute()
            
            if sos_res.data:
                alert_data = sos_res.data[0]
                # Notify contacts about the missed check-in (optional, non-blocking)
                location = None
                if journey.get("start_latitude") and journey.get("start_longitude"):
                     location = {
                         "lat": journey.get("start_latitude"),
                         "long": journey.get("start_longitude")
                     }
                try:
                    notification_service.notify_all_guardians(
                        user_id=user.id,
                        alert_type="JOURNEY_MISSED_CHECKIN",
                        user=user,
                        location=location
                    )
                    guardian_notified = True
                    reason = "Success"
                except Exception as ne:
                    logger.error(f"Notification error: {ne}")
                    guardian_notified = False
                    reason = str(ne)
            
        return {
            "success": True,
            "safe_window": journey,
            "alert": alert_data,
            "guardian_notified": guardian_notified,
            "reason": reason
        }
    except Exception as e:
        logger.error(f"Error handling missed checkin: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{journey_id}/location", response_model=JourneyResponse)
@router.post("/{journey_id}/location", response_model=JourneyResponse)
def update_location(journey_id: str, location_in: dict, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    supabase = get_user_supabase_client(auth_data["token"])

    try:
        update_data = {
            "current_latitude": location_in.get("latitude") or location_in.get("current_latitude"),
            "current_longitude": location_in.get("longitude") or location_in.get("current_longitude"),
            "current_address": location_in.get("address") or location_in.get("current_address"),
            "last_location_at": datetime.utcnow().isoformat()
        }
        
        # Remove None values
        update_data = {k: v for k, v in update_data.items() if v is not None}
        
        result = supabase.table("safe_windows").update(update_data).eq("id", journey_id).eq("user_id", user.id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Journey not found")
        return result.data[0]
    except Exception as e:
        logger.error(f"Error updating journey location: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
