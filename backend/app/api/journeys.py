import httpx
import logging
from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
import math

from app.core.auth import get_current_user
from app.db.client import get_service_role_client
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
    supabase = get_service_role_client()

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

        ALLOWED_CHECKIN_MINUTES = {3, 5, 10}
        
        interval_mins_in = journey_in.get("check_in_interval_minutes")
        
        if interval_mins_in not in ALLOWED_CHECKIN_MINUTES:
            check_in_interval_minutes_int = 5
        else:
            check_in_interval_minutes_int = interval_mins_in
            
        check_in_interval_seconds_int = check_in_interval_minutes_int * 60
            
        from datetime import timedelta
        ends_at = now + timedelta(seconds=duration_seconds_int)
        check_in_due_at = now + timedelta(seconds=check_in_interval_seconds_int)
        if check_in_due_at > ends_at:
            check_in_due_at = ends_at
            
        assert check_in_due_at <= ends_at, "Check in due time must be <= ends at"
            
        def validate_coord(lat, lng, label):
            if lat is not None or lng is not None:
                if lat is None or lng is None:
                    raise ValueError(f"{label} latitude and longitude must both be provided")
                try:
                    lat_f = float(lat)
                    lng_f = float(lng)
                except (ValueError, TypeError):
                    raise ValueError(f"{label} coordinates must be numeric")
                if math.isnan(lat_f) or math.isnan(lng_f):
                    raise ValueError(f"{label} coordinates cannot be NaN")
                if not (-90 <= lat_f <= 90):
                    raise ValueError(f"{label} latitude must be between -90 and 90")
                if not (-180 <= lng_f <= 180):
                    raise ValueError(f"{label} longitude must be between -180 and 180")
                return lat_f, lng_f
            return None, None
            
        try:
            s_lat, s_lng = validate_coord(journey_in.get("start_latitude"), journey_in.get("start_longitude"), "Start")
            d_lat, d_lng = validate_coord(journey_in.get("destination_latitude"), journey_in.get("destination_longitude"), "Destination")
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
            
        import os
        import urllib.request
        import json
        
        distance_km = None
        estimated_duration_minutes = None
        route_polyline = None
        route_provider = "google"
        route_status = "unavailable"
        
        if s_lat is not None and s_lng is not None and d_lat is not None and d_lng is not None:
            api_key = os.getenv("GOOGLE_MAPS_API_KEY")
            routing_provider = os.getenv("ROUTING_PROVIDER")
            
            if not api_key or routing_provider == "osrm":
                route_provider = "osrm"
                osrm_base_url = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org")
                try:
                    url = f"{osrm_base_url}/route/v1/driving/{s_lng},{s_lat};{d_lng},{d_lat}?overview=false"
                    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (SafeHer Backend)'})
                    with urllib.request.urlopen(req, timeout=5) as response:
                        data = json.loads(response.read().decode())
                        if data.get("code") == "Ok" and data.get("routes"):
                            route = data["routes"][0]
                            dist_meters = route["distance"]
                            dur_seconds = route["duration"]
                            
                            distance_km = round(dist_meters / 1000.0, 2)
                            estimated_duration_minutes = max(1, math.ceil(dur_seconds / 60))
                            route_status = "calculated"
                        else:
                            route_status = "unavailable"
                except Exception as ex:
                    logger.warning(f"Failed to fetch OSRM route ETA: {ex}")
                    route_status = "unavailable"
            else:
                route_provider = "google"
                try:
                    url = f"https://maps.googleapis.com/maps/api/directions/json?origin={s_lat},{s_lng}&destination={d_lat},{d_lng}&key={api_key}"
                    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                    with urllib.request.urlopen(req, timeout=5) as response:
                        data = json.loads(response.read().decode())
                        if data.get("status") == "OK" and data.get("routes"):
                            route = data["routes"][0]
                            leg = route["legs"][0]
                            dist_meters = leg["distance"]["value"]
                            dur_seconds = leg["duration"]["value"]
                            
                            distance_km = round(dist_meters / 1000.0, 2)
                            estimated_duration_minutes = max(1, math.ceil(dur_seconds / 60))
                            route_polyline = route.get("overview_polyline", {}).get("points")
                            route_status = "calculated"
                        else:
                            route_status = "api_error"
                except Exception as ex:
                    logger.warning(f"Failed to fetch Google route ETA: {ex}")
                    route_status = "api_error"
            
        journey_data = {
            "user_id": user.id,
            "status": "active",
            "duration_minutes": duration_minutes_int,
            "duration_seconds": duration_seconds_int,
            "check_in_interval_minutes": check_in_interval_minutes_int,
            "check_in_interval_seconds": check_in_interval_seconds_int,
            "start_latitude": s_lat,
            "start_longitude": s_lng,
            "start_address": journey_in.get("start_address") or journey_in.get("from"),
            "destination_latitude": d_lat,
            "destination_longitude": d_lng,
            "destination_address": journey_in.get("destination_address") or journey_in.get("destination") or journey_in.get("to"),
            "start_place_id": journey_in.get("start_place_id"),
            "destination_place_id": journey_in.get("destination_place_id"),
            "location_provider": journey_in.get("location_provider"),
            "started_at": now.isoformat().replace("+00:00", "Z"),
            "ends_at": ends_at.isoformat().replace("+00:00", "Z"),
            "last_check_in_at": now.isoformat().replace("+00:00", "Z"),
            "check_in_due_at": check_in_due_at.isoformat().replace("+00:00", "Z"),
            "distance_km": distance_km,
            "estimated_duration_minutes": estimated_duration_minutes,
            "estimated_arrival_at": (now + timedelta(minutes=estimated_duration_minutes)).isoformat().replace("+00:00", "Z") if estimated_duration_minutes else None,
            "route_polyline": route_polyline,
            "route_provider": route_provider,
            "route_status": route_status
        }
        
        result = supabase.table("safe_windows").insert(journey_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to start journey")

        # TEMP DEBUG — remove before final commit
        print(f"POST /api/journeys START: current_user.id={user.id}, created row id={result.data[0]['id']}")

        return result.data[0]
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
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
    supabase = get_service_role_client()

    try:
        result = supabase.table("safe_windows").select("*").eq("user_id", user.id).order("started_at", desc=True).execute()
        
        # TEMP DEBUG — remove before final commit
        print(f"GET /api/journeys current_user.id: {user.id}")
        print(f"GET /api/journeys row count: {len(result.data) if result.data else 0}")
        
        return result.data
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error fetching journeys: {str(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail={"error": "Database unavailable", "message": str(e)})

@router.post("/{journey_id}/complete", response_model=JourneyResponse)
def complete_journey(journey_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    supabase = get_service_role_client()

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
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
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
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
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
        # Mark journey missed check-in atomically without ending it
        update_res = service_client.table("safe_windows").update({
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
        
        # Log SAFE_WINDOW_MISSED
        try:
            notification_service._log_event(
                alert_id=None,
                user_id=user.id,
                event_type="SAFE_WINDOW_MISSED",
                status="SUCCESS",
                message="Journey check-in missed",
                journey_id=journey_id
            )
        except httpx.TimeoutException:
            raise
        except httpx.RequestError:
            raise
        except Exception as e:
            logger.error(f"Failed to log SAFE_WINDOW_MISSED: {e}")
        
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
                "location_long": journey.get("start_longitude"),
                "visible_message": "Journey Mode check-in missed",
                "cancel_method": "NONE"
            }
            # Auto-resolve previous active alerts for this user
            try:
                service_client.table("sos_alerts").update({
                    "status": "RESOLVED",
                    "cancel_method": "AUTO_RESOLVED",
                    "cancelled_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
                }).eq("user_id", user.id).eq("status", "ACTIVE").execute()
            except Exception as resolve_err:
                logger.warning(f"Failed to auto-resolve previous alerts: {resolve_err}")

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
                    notification_service.send_sos_sms_to_emergency_contacts(
                        user_id=user.id,
                        alert_id=alert_data["id"],
                        alert_payload={"id": alert_data["id"], "trigger_type": "JOURNEY_MISSED_CHECKIN", "location": location},
                        user=user
                    )
                    
                    notification_service.notify_all_guardians(
                        user_id=user.id,
                        alert_type="JOURNEY_MISSED_CHECKIN",
                        user=user,
                        location=location,
                        alert_id=alert_data["id"] if alert_data else None
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
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error handling missed checkin: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{journey_id}/location", response_model=JourneyResponse)
@router.post("/{journey_id}/location", response_model=JourneyResponse)
def update_location(journey_id: str, location_in: dict, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    supabase = get_service_role_client()

    try:
        from datetime import datetime
        update_data = {
            "current_latitude": location_in.get("latitude") or location_in.get("current_latitude"),
            "current_longitude": location_in.get("longitude") or location_in.get("current_longitude"),
            "current_address": location_in.get("address") or location_in.get("current_address"),
            "location_accuracy": location_in.get("accuracy"),
            "location_provider": location_in.get("provider"),
            "last_location_at": location_in.get("captured_at") or datetime.utcnow().isoformat()
        }
        
        # Remove None values
        update_data = {k: v for k, v in update_data.items() if v is not None}
        
        result = supabase.table("safe_windows").update(update_data).eq("id", journey_id).eq("user_id", user.id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Journey not found")
        return result.data[0]
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error updating journey location: {str(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail="Service unavailable (Supabase failure)")
