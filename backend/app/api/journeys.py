"""
Journeys / Safe Windows API
Handles Safe Window start/end/check-in, trusted place auto-complete,
missed-check-in escalation, and guardian notifications.
"""
import httpx
import logging
import math
from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta

from app.core.auth import get_current_user
from app.db.client import get_service_role_client
from app.services.notification_service import notification_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/journeys", tags=["journeys"])


# ── Shared helper ────────────────────────────────────────────────────────────

def _get_ward_name(service_client, user_id: str, user_obj=None) -> str:
    name = getattr(user_obj, "email", None) or user_id
    try:
        res = service_client.table("profiles").select("full_name, email").eq("id", user_id).execute()
        if res.data:
            name = res.data[0].get("full_name") or res.data[0].get("email") or name
    except Exception:
        pass
    return name


def _notify_safety_recipients(service_client, ward_id: str, ward_name: str,
                               event_type: str, title: str, message: str,
                               metadata: dict = None):
    """
    Send an in_app_notification to every linked guardian AND active family member.
    Non-fatal — logs on individual failures.
    """
    recipient_ids: list[str] = []
    try:
        links = service_client.table("guardian_links").select("guardian_user_id") \
            .eq("user_id", ward_id).eq("status", "ACTIVE").execute()
        recipient_ids += [r["guardian_user_id"] for r in (links.data or [])]
    except Exception as e:
        logger.warning(f"_notify_safety_recipients: guardian fetch failed: {e}")

    seen: set[str] = set()
    for rid in recipient_ids:
        if not rid or rid in seen:
            continue
        seen.add(rid)
        try:
            service_client.table("in_app_notifications").insert({
                "user_id": rid,
                "actor_user_id": ward_id,
                "type": event_type,
                "title": title,
                "message": message,
                "metadata": metadata or {},
            }).execute()
        except Exception as e:
            logger.warning(f"_notify_safety_recipients: failed for {rid}: {e}")

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
    route_polyline: Optional[str] = None
    distance_km: Optional[float] = None
    estimated_duration_minutes: Optional[int] = None

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
                    url = f"{osrm_base_url}/route/v1/driving/{s_lng},{s_lat};{d_lng},{d_lat}?overview=full&geometries=polyline"
                    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (SafeHer Backend)'})
                    with urllib.request.urlopen(req, timeout=5) as response:
                        data = json.loads(response.read().decode())
                        if data.get("code") == "Ok" and data.get("routes"):
                            route = data["routes"][0]
                            dist_meters = route["distance"]
                            dur_seconds = route["duration"]
                            
                            distance_km = round(dist_meters / 1000.0, 2)
                            estimated_duration_minutes = max(1, math.ceil(dur_seconds / 60))
                            route_polyline = route.get("geometry")
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

        if estimated_duration_minutes is None:
            exp_dur = journey_in.get("expected_duration_minutes")
            if exp_dur is not None:
                try:
                    exp_dur_f = float(exp_dur)
                    if math.isfinite(exp_dur_f) and exp_dur_f > 0:
                        estimated_duration_minutes = int(math.ceil(exp_dur_f))
                except (ValueError, TypeError):
                    pass
            
        # Resolve trusted place if provided
        trusted_place_id = journey_in.get("trusted_place_id")
        destination_name = journey_in.get("destination_name") or journey_in.get("destination_label") or journey_in.get("destination_address") or journey_in.get("destination") or journey_in.get("to")
        destination_radius_meters = 100
        notify_guardians_on_arrival = True

        if trusted_place_id:
            try:
                tp = supabase.table("trusted_places").select("*").eq("id", trusted_place_id).eq("user_id", user.id).eq("is_active", True).execute()
                if tp.data:
                    place = tp.data[0]
                    # If no manual destination provided, use the trusted place coordinates
                    if d_lat is None and d_lng is None:
                        d_lat = place["latitude"]
                        d_lng = place["longitude"]
                    destination_name = destination_name or place.get("name") or place.get("label")
                    destination_radius_meters = place.get("radius_meters", 100)
                    notify_guardians_on_arrival = place.get("notify_guardians_on_arrival", True)
                else:
                    trusted_place_id = None  # silently ignore invalid ID
            except Exception as tp_err:
                logger.warning(f"Could not resolve trusted_place_id {trusted_place_id}: {tp_err}")
                trusted_place_id = None

        start_address_val = journey_in.get("start_address") or journey_in.get("start_label") or journey_in.get("from")

        journey_data = {
            "user_id": user.id,
            "status": "active",
            "severity": "NORMAL",
            "duration_minutes": duration_minutes_int,
            "duration_seconds": duration_seconds_int,
            "check_in_interval_minutes": check_in_interval_minutes_int,
            "check_in_interval_seconds": check_in_interval_seconds_int,
            "start_latitude": s_lat,
            "start_longitude": s_lng,
            "start_address": start_address_val,
            "destination_latitude": d_lat,
            "destination_longitude": d_lng,
            "destination_address": journey_in.get("destination_address") or journey_in.get("destination") or journey_in.get("to"),
            "destination_name": destination_name,
            "destination_radius_meters": destination_radius_meters,
            "notify_guardians_on_arrival": notify_guardians_on_arrival,
            "trusted_place_id": trusted_place_id,
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
            "route_status": route_status,
        }
        # Strip None values so DB defaults apply
        journey_data = {k: v for k, v in journey_data.items() if v is not None}

        print("POST /api/journeys normalized fields:", {
            "start_address": start_address_val,
            "destination_name": destination_name,
            "trusted_place_id": trusted_place_id,
            "duration_minutes": duration_minutes_int,
            "check_in_interval_minutes": check_in_interval_minutes_int,
        })

        result = supabase.table("safe_windows").insert(journey_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to start journey")

        created_journey = result.data[0]
        journey_id_new = created_journey["id"]

        # Bell notification → guardians + family: Safe Window started
        try:
            ward_name = _get_ward_name(supabase, user.id, user)
            dest_label = destination_name or "destination"
            _notify_safety_recipients(
                supabase,
                ward_id=user.id,
                ward_name=ward_name,
                event_type="safe_window_started",
                title="Safe Window started",
                message=f"{ward_name} started a journey to {dest_label}.",
                metadata={
                    "journey_id": journey_id_new,
                    "ward_id": user.id,
                    "ward_name": ward_name,
                    "trusted_place_id": trusted_place_id,
                    "destination_name": dest_label,
                    "destination_latitude": d_lat,
                    "destination_longitude": d_lng,
                    "started_at": now.isoformat().replace("+00:00", "Z"),
                },
            )
        except Exception as notif_err:
            logger.warning(f"safe_window_started notification failed: {notif_err}")

        return created_journey
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
        
        journeys = result.data or []
        now = datetime.now(timezone.utc)
        
        # Defensive sweep: if an active journey has expired, escalate it before returning
        for i, journey in enumerate(journeys):
            if journey.get("status") == "active":
                due_str = journey.get("check_in_due_at")
                if due_str:
                    due_dt = parse_utc(due_str)
                    if due_dt and now > due_dt:
                        try:
                            from app.services.journey_service import JourneyService
                            escalate_res = JourneyService.escalate_journey(journey["id"], user.id, reason="AUTO_SWEEP")
                            if escalate_res.get("success") and escalate_res.get("safe_window"):
                                journeys[i] = escalate_res["safe_window"]
                        except Exception as e:
                            logger.error(f"Defensive sweep failed for {journey['id']}: {e}")
        
        return journeys
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error fetching journeys: {str(e)}", exc_info=True)
        raise HTTPException(status_code=503, detail={"error": "Database unavailable", "message": str(e)})

@router.post("/{journey_id}/complete", response_model=JourneyResponse)
def complete_journey(journey_id: str, auth_data: dict = Depends(get_current_user),
                     completed_reason: str = "MANUAL"):
    """
    Manually end a Safe Window.
    completed_reason: MANUAL | REACHED_TRUSTED_PLACE
    """
    user = auth_data["user"]
    supabase = get_service_role_client()

    try:
        now_str = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        update_data = {
            "status": "completed",
            "completed_at": now_str,
            "completed_reason": completed_reason,
        }
        result = supabase.table("safe_windows").update(update_data) \
            .eq("id", journey_id).eq("user_id", user.id).eq("status", "active").execute()
        if not result.data:
            # Already completed/missed — fetch and return current state
            existing = supabase.table("safe_windows").select("*").eq("id", journey_id).eq("user_id", user.id).execute()
            if not existing.data:
                raise HTTPException(status_code=404, detail="Journey not found")
            return existing.data[0]

        completed_journey = result.data[0]
        logger.info(f"[TRUSTED PLACE UPDATE] journey_completed journeyId = {journey_id}")
        logger.info(f"[TRUSTED PLACE UPDATE] completed_reason = {completed_reason}")

        # ── Best-effort final stats ──────────────────────────────────────────
        # Compute distance, duration, and average speed from the breadcrumb trail
        # and persist back to safe_windows. Non-fatal on any failure.
        try:
            stats = _compute_journey_stats(supabase, journey_id, completed_journey)
            if stats:
                supabase.table("safe_windows").update({
                    "final_distance_m": stats["total_distance_m"],
                    "final_duration_seconds": stats["duration_seconds"],
                    "avg_speed_kmh": stats["avg_speed_kmh"],
                }).eq("id", journey_id).execute()
                # Reflect stats in the return value without a second DB round-trip
                completed_journey = {**completed_journey, **{
                    "final_distance_m": stats["total_distance_m"],
                    "final_duration_seconds": stats["duration_seconds"],
                    "avg_speed_kmh": stats["avg_speed_kmh"],
                }}
                logger.info(f"[JOURNEY STATS] persisted for {journey_id}: {stats}")
        except Exception as stats_err:
            logger.warning(f"[JOURNEY STATS] non-fatal stats computation failed for {journey_id}: {stats_err}")

        # Verify family status after completion
        try:
            from app.api.family_locations import _resolve_member_status
            family_status_after = _resolve_member_status(supabase, user.id)
            logger.info(f"[TRUSTED PLACE UPDATE] family_status_after = {family_status_after}")
        except Exception as status_err:
            logger.warning(f"[TRUSTED PLACE UPDATE] failed to resolve family status: {status_err}")

        # Bell notification → guardians + family
        try:
            ward_name = _get_ward_name(supabase, user.id, user)
            dest_label = (
                completed_journey.get("destination_name")
                or completed_journey.get("destination_address")
                or "destination"
            )
            if completed_reason == "REACHED_TRUSTED_PLACE":
                event_type = "safe_window_reached_trusted_place"
                title = "Reached safely"
                message = f"{ward_name} reached {dest_label} safely."
                logger.info(f"[TRUSTED PLACE NOTIFICATION] guardian notification triggered for ward = {user.id}, destination = {dest_label}")
            else:
                event_type = "safe_window_ended"
                title = "Safe Window ended"
                message = f"{ward_name} ended their Safe Window."

            _notify_safety_recipients(
                supabase,
                ward_id=user.id,
                ward_name=ward_name,
                event_type=event_type,
                title=title,
                message=message,
                metadata={
                    "journey_id": journey_id,
                    "ward_id": user.id,
                    "ward_name": ward_name,
                    "trusted_place_id": completed_journey.get("trusted_place_id"),
                    "destination_name": dest_label,
                    "completed_reason": completed_reason,
                    "completed_at": now_str,
                    "latitude": completed_journey.get("current_latitude"),
                    "longitude": completed_journey.get("current_longitude"),
                },
            )
            if completed_reason == "REACHED_TRUSTED_PLACE":
                logger.info(f"[TRUSTED PLACE NOTIFICATION] guardian notification created successfully")
        except Exception as notif_err:
            logger.warning(f"[TRUSTED PLACE NOTIFICATION] guardian notification failed: {notif_err}")

        # Ward notification (always emit so client can clear notifications)
        try:
            dest_label = (
                completed_journey.get("destination_name")
                or completed_journey.get("destination_address")
                or "destination"
            )
            title = "Safe Window completed" if completed_reason == "REACHED_TRUSTED_PLACE" else "Safe Window ended"
            msg = f"You reached {dest_label} safely." if completed_reason == "REACHED_TRUSTED_PLACE" else "Your Safe Window has ended."
            
            supabase.table("in_app_notifications").insert({
                "user_id": user.id,
                "actor_user_id": user.id,
                "type": "safe_window_completed" if completed_reason == "REACHED_TRUSTED_PLACE" else "safe_window_ended",
                "title": title,
                "message": msg,
                "metadata": {
                    "journey_id": journey_id,
                    "trusted_place_id": completed_journey.get("trusted_place_id"),
                    "destination_name": dest_label,
                    "completed_reason": completed_reason,
                    "action": "clear_journey_notifications",
                },
            }).execute()
            logger.info(f"[TRUSTED PLACE NOTIFICATION] ward notification (clear_journey_notifications) created successfully")
        except Exception as ward_notif_err:
            logger.warning(f"[TRUSTED PLACE NOTIFICATION] ward notification failed: {ward_notif_err}")

        return completed_journey
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
            res = handle_missed_checkin(journey_id, auth_data)
            if isinstance(res, dict) and "safe_window" in res:
                return res["safe_window"]
            return res

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
    try:
        from app.services.journey_service import JourneyService
        return JourneyService.escalate_journey(journey_id, user.id, reason="MISSED_CHECKIN")
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
    """
    Update the ward's current position during an active journey.

    Backward-compatible: response shape is unchanged (JourneyResponse from safe_windows).
    New behavior (v2): also inserts a breadcrumb row into journey_location_updates.
    The breadcrumb insert is best-effort — a failure there is logged but does NOT
    fail the overall request or change the HTTP response shape in any way.
    """
    user = auth_data["user"]
    supabase = get_service_role_client()

    try:
        now_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

        lat = location_in.get("latitude") or location_in.get("current_latitude")
        lng = location_in.get("longitude") or location_in.get("current_longitude")

        update_data = {
            "current_latitude": lat,
            "current_longitude": lng,
            "current_address": location_in.get("address") or location_in.get("current_address"),
            "location_accuracy": location_in.get("accuracy"),
            "location_provider": location_in.get("provider"),
            "last_location_at": location_in.get("captured_at") or now_iso,
        }

        # Remove None values so DB defaults are preserved
        update_data = {k: v for k, v in update_data.items() if v is not None}

        result = supabase.table("safe_windows").update(update_data).eq("id", journey_id).eq("user_id", user.id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Journey not found")

        # ── Best-effort breadcrumb insert ────────────────────────────────────
        # Failures here are intentionally non-fatal: the primary location update
        # on safe_windows already succeeded.  The guardian live map falls back to
        # a 2-minute HTTP reconciliation poll, so occasional missed breadcrumbs
        # do not leave the guardian with a permanently broken polyline.
        if lat is not None and lng is not None:
            try:
                breadcrumb = {
                    "journey_id": journey_id,
                    "user_id": user.id,
                    "lat": float(lat),
                    "lng": float(lng),
                    "recorded_at": location_in.get("captured_at") or now_iso,
                }
                # Optional fields — only include when provided by the mobile client
                if location_in.get("heading") is not None:
                    breadcrumb["heading"] = float(location_in["heading"])
                if location_in.get("speed_ms") is not None:
                    breadcrumb["speed_ms"] = float(location_in["speed_ms"])
                if location_in.get("accuracy") is not None:
                    breadcrumb["accuracy"] = float(location_in["accuracy"])

                supabase.table("journey_location_updates").insert(breadcrumb).execute()
            except Exception as breadcrumb_err:
                # Non-fatal: log and continue — does NOT affect the HTTP response
                logger.warning(
                    f"[breadcrumb] non-fatal insert failure for journey {journey_id}: {breadcrumb_err}"
                )

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


@router.post("/{journey_id}/reached-trusted-place", response_model=JourneyResponse)
def reached_trusted_place(journey_id: str, auth_data: dict = Depends(get_current_user)):
    """
    Called by mobile when the ward enters the trusted place radius.
    Marks the Safe Window completed with reason=REACHED_TRUSTED_PLACE
    and sends guardian and ward notifications.
    Idempotent: duplicate calls for the same journey will not create duplicate notifications.
    """
    user = auth_data["user"]
    supabase = get_service_role_client()

    try:
        # Check if journey is already completed with REACHED_TRUSTED_PLACE
        existing = supabase.table("safe_windows").select("*").eq("id", journey_id).eq("user_id", user.id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Journey not found")
        
        journey = existing.data[0]
        
        # If already completed with REACHED_TRUSTED_PLACE, return current state without creating new notifications
        if journey.get("status") == "completed" and journey.get("completed_reason") == "REACHED_TRUSTED_PLACE":
            logger.info(f"[TRUSTED PLACE NOTIFICATION] skipped_duplicate = journey already completed with REACHED_TRUSTED_PLACE, journey_id = {journey_id}")
            return journey
        
        # If already completed with different reason, return current state (duplicate_noop)
        if journey.get("status") == "completed":
            logger.info(f"[TRUSTED PLACE UPDATE] duplicate_noop journeyId = {journey_id}, already completed with reason = {journey.get('completed_reason')}")
            return journey
        
        # If still active, proceed with completion
        return complete_journey(journey_id, auth_data, completed_reason="REACHED_TRUSTED_PLACE")
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error in reached-trusted-place: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{journey_id}/escalation-check")
def escalation_check(journey_id: str, auth_data: dict = Depends(get_current_user)):
    """
    Idempotent escalation check for an escalated Safe Window.
    Call this from the mobile app or guardian dashboard refresh.
    Escalation timeline (from escalated_at):
      0 min  → HIGH, initial notification already sent by missed-checkin
      1 min  → repeat guardian notification (safe_window_escalation_repeat)
      3 min  → CRITICAL severity (safe_window_escalated_critical)
      5 min  → emergency contacts escalation attempt (emergency_contacts_escalated)
    Stops if any guardian has taken an action (acknowledge/responding/resolved).
    """
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        # Fetch the journey — caller must own it or be a linked guardian
        journey_res = service_client.table("safe_windows").select("*").eq("id", journey_id).execute()
        if not journey_res.data:
            raise HTTPException(status_code=404, detail="Journey not found")

        journey = journey_res.data[0]
        ward_id = journey["user_id"]

        # Auth: must be ward or active guardian
        if ward_id != user.id:
            link = service_client.table("guardian_links").select("id") \
                .eq("guardian_user_id", user.id).eq("user_id", ward_id).eq("status", "ACTIVE").execute()
            if not link.data:
                raise HTTPException(status_code=403, detail="Not authorized")

        severity = journey.get("severity", "NORMAL")
        escalated_at_raw = journey.get("escalated_at")
        notif_count = journey.get("escalation_notif_count", 0) or 0

        # Only act on escalated journeys that are still active
        if severity not in ("HIGH", "CRITICAL") or journey.get("status") != "active":
            return {"action": "no_op", "reason": "Journey not actively escalated", "severity": severity}

        if not escalated_at_raw:
            return {"action": "no_op", "reason": "escalated_at not set"}

        escalated_at = datetime.fromisoformat(escalated_at_raw.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        elapsed_secs = (now - escalated_at).total_seconds()

        # Check if a guardian has already responded — stop escalation
        alert_res = service_client.table("sos_alerts").select("id") \
            .eq("safe_window_id", journey_id).eq("status", "ACTIVE").execute()
        if alert_res.data:
            alert_id = alert_res.data[0]["id"]
            actions = service_client.table("guardian_alert_actions").select("action_type") \
                .eq("alert_id", alert_id).in_("action_type",
                    ["I_AM_RESPONDING", "RESPONDING", "RESOLVED", "FALSE_ALARM",
                     "CALLED_WARD", "NAVIGATING_TO_WARD"]).execute()
            if actions.data:
                return {"action": "no_op", "reason": "Guardian already responded — escalation paused"}
        else:
            alert_id = None

        ward_name = _get_ward_name(service_client, ward_id)
        dest_label = journey.get("destination_name") or journey.get("destination_address") or "destination"
        lat = journey.get("current_latitude") or journey.get("start_latitude")
        lon = journey.get("current_longitude") or journey.get("start_longitude")
        last_notif_raw = journey.get("last_escalation_notif_at")
        last_notif_secs = 0
        if last_notif_raw:
            try:
                last_notif_dt = datetime.fromisoformat(last_notif_raw.replace("Z", "+00:00"))
                last_notif_secs = (now - last_notif_dt).total_seconds()
            except Exception:
                pass

        action_taken = "no_op"
        now_str = now.isoformat().replace("+00:00", "Z")

        # 5 min → emergency contacts escalation
        if elapsed_secs >= 300 and notif_count < 4:
            new_severity = "CRITICAL"
            _notify_safety_recipients(
                service_client, ward_id=ward_id, ward_name=ward_name,
                event_type="emergency_contacts_escalated",
                title="CRITICAL: No guardian response",
                message=f"{ward_name}'s Safe Window is CRITICAL. No guardian has responded.",
                metadata={"journey_id": journey_id, "ward_id": ward_id, "severity": "CRITICAL",
                          "elapsed_secs": int(elapsed_secs), "latitude": lat, "longitude": lon},
            )
            try:
                notification_service.send_sos_sms_to_emergency_contacts(
                    user_id=ward_id, alert_id=alert_id or "",
                    alert_payload={"trigger_type": "JOURNEY_MISSED_CHECKIN"},
                    user=type("U", (), {"id": ward_id, "email": ward_name})(),
                )
            except Exception as sms_err:
                logger.warning(f"escalation SMS failed: {sms_err}")
            action_taken = "emergency_contacts_escalated"

        # 3 min → CRITICAL severity
        elif elapsed_secs >= 180 and severity != "CRITICAL":
            new_severity = "CRITICAL"
            _notify_safety_recipients(
                service_client, ward_id=ward_id, ward_name=ward_name,
                event_type="safe_window_escalated_critical",
                title="CRITICAL alert ⚠️",
                message=f"{ward_name}'s Safe Window alert is now CRITICAL. Immediate response needed.",
                metadata={"journey_id": journey_id, "ward_id": ward_id, "severity": "CRITICAL",
                          "elapsed_secs": int(elapsed_secs), "latitude": lat, "longitude": lon},
            )
            action_taken = "escalated_to_critical"

        # 1 min repeat notification (but only once per 60s and max 2 repeats)
        elif elapsed_secs >= 60 and last_notif_secs >= 60 and notif_count < 3:
            new_severity = severity  # keep HIGH
            _notify_safety_recipients(
                service_client, ward_id=ward_id, ward_name=ward_name,
                event_type="safe_window_escalation_repeat",
                title="Missed check-in — still no response",
                message=f"{ward_name} still hasn't checked in. Please respond.",
                metadata={"journey_id": journey_id, "ward_id": ward_id, "severity": "HIGH",
                          "elapsed_secs": int(elapsed_secs), "latitude": lat, "longitude": lon},
            )
            action_taken = "repeat_notification"

        else:
            new_severity = severity
            return {"action": "no_op", "reason": "No threshold reached yet", "elapsed_secs": int(elapsed_secs)}

        # Persist severity + notif tracking
        service_client.table("safe_windows").update({
            "severity": new_severity,
            "last_escalation_notif_at": now_str,
            "escalation_notif_count": notif_count + 1,
        }).eq("id", journey_id).execute()

        return {
            "action": action_taken,
            "severity": new_severity,
            "elapsed_secs": int(elapsed_secs),
            "notif_count": notif_count + 1,
        }

    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"escalation_check failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Escalation check failed")


# ── Shared helper: compute stats from breadcrumb trail ───────────────────────

def _compute_journey_stats(service_client, journey_id: str, journey_row: dict) -> Optional[Dict]:
    """
    Compute final journey statistics from journey_location_updates breadcrumbs.
    Returns None if fewer than 2 breadcrumb points exist (can't compute distance).
    Uses Haversine formula consistent with geoUtils.ts on the mobile side.
    Non-fatal callers should wrap this in try/except.
    """
    import math

    rows = (
        service_client.table("journey_location_updates")
        .select("lat,lng,recorded_at")
        .eq("journey_id", journey_id)
        .order("recorded_at", desc=False)
        .execute()
    )

    points = rows.data or []
    if len(points) < 2:
        return None

    def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        R = 6371000.0
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dp = math.radians(lat2 - lat1)
        dl = math.radians(lon2 - lon1)
        a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    total_m = 0.0
    for i in range(1, len(points)):
        try:
            total_m += haversine_m(
                float(points[i - 1]["lat"]), float(points[i - 1]["lng"]),
                float(points[i]["lat"]),     float(points[i]["lng"]),
            )
        except (TypeError, ValueError):
            pass

    # Wall-clock duration from first to last breadcrumb
    try:
        t_start = datetime.fromisoformat(str(points[0]["recorded_at"]).replace("Z", "+00:00"))
        t_end   = datetime.fromisoformat(str(points[-1]["recorded_at"]).replace("Z", "+00:00"))
        duration_secs = max(0, int((t_end - t_start).total_seconds()))
    except Exception:
        # Fall back to journey started_at / completed_at if breadcrumb timestamps are missing
        try:
            t_start = parse_utc(journey_row.get("started_at"))
            t_end   = parse_utc(journey_row.get("completed_at") or datetime.now(timezone.utc).isoformat())
            duration_secs = max(0, int((t_end - t_start).total_seconds()))
        except Exception:
            duration_secs = 0

    avg_speed_kmh: Optional[float] = None
    if duration_secs > 0:
        avg_speed_kmh = round((total_m / 1000.0) / (duration_secs / 3600.0), 2)

    return {
        "total_distance_m": round(total_m, 1),
        "duration_seconds": duration_secs,
        "avg_speed_kmh": avg_speed_kmh,
        "point_count": len(points),
    }


# ── GET /{journey_id}/locations — breadcrumb trail ───────────────────────────

@router.get("/{journey_id}/locations")
def get_journey_locations(
    journey_id: str,
    limit: int = 200,
    auth_data: dict = Depends(get_current_user),
):
    """
    Returns the ordered breadcrumb trail for a journey.

    Access: the ward who owns the journey OR an active guardian of that ward.
    Cap: max 500 rows (sufficient for the current 60-minute max journey duration
         at the 8s/15m throttle — ~450 rows worst-case). Ordered ASC by recorded_at
         so the guardian live map can build the polyline in arrival order.
    """
    user = auth_data["user"]
    service_client = get_service_role_client()

    # Hard cap: never return more than 500 rows regardless of caller's limit param
    effective_limit = min(max(1, limit), 500)

    try:
        # Verify the journey exists and caller is authorized
        journey_res = service_client.table("safe_windows").select("user_id").eq("id", journey_id).execute()
        if not journey_res.data:
            raise HTTPException(status_code=404, detail="Journey not found")

        ward_id = journey_res.data[0]["user_id"]

        if ward_id != user.id:
            # Check active guardian link
            link = service_client.table("guardian_links").select("id") \
                .eq("guardian_user_id", user.id).eq("user_id", ward_id).eq("status", "ACTIVE").execute()
            if not link.data:
                raise HTTPException(status_code=403, detail="Not authorized to view this journey")

        rows = (
            service_client.table("journey_location_updates")
            .select("id,lat,lng,heading,speed_ms,accuracy,recorded_at")
            .eq("journey_id", journey_id)
            .order("recorded_at", desc=False)
            .limit(effective_limit)
            .execute()
        )

        return rows.data or []

    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"get_journey_locations failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not fetch journey locations")


# ── GET /{journey_id}/stats — final journey statistics ───────────────────────

@router.get("/{journey_id}/stats")
def get_journey_stats(
    journey_id: str,
    auth_data: dict = Depends(get_current_user),
):
    """
    Returns computed journey statistics.

    For completed journeys: returns the persisted final_distance_m / final_duration_seconds
    / avg_speed_kmh from safe_windows (written by POST /complete).
    For active journeys: computes live from the breadcrumb trail on demand.

    Access: ward or active guardian.
    """
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        journey_res = service_client.table("safe_windows").select("*").eq("id", journey_id).execute()
        if not journey_res.data:
            raise HTTPException(status_code=404, detail="Journey not found")

        journey = journey_res.data[0]
        ward_id = journey["user_id"]

        if ward_id != user.id:
            link = service_client.table("guardian_links").select("id") \
                .eq("guardian_user_id", user.id).eq("user_id", ward_id).eq("status", "ACTIVE").execute()
            if not link.data:
                raise HTTPException(status_code=403, detail="Not authorized")

        # For completed journeys, return cached stats if available
        if journey.get("status") == "completed" and journey.get("final_distance_m") is not None:
            return {
                "journey_id": journey_id,
                "total_distance_m": journey["final_distance_m"],
                "duration_seconds": journey.get("final_duration_seconds"),
                "avg_speed_kmh": journey.get("avg_speed_kmh"),
                "point_count": None,  # not cached; call /locations for count
                "started_at": journey.get("started_at"),
                "ended_at": journey.get("completed_at"),
                "source": "cached",
            }

        # Otherwise compute live from breadcrumb trail
        stats = _compute_journey_stats(service_client, journey_id, journey)
        if not stats:
            return {
                "journey_id": journey_id,
                "total_distance_m": 0.0,
                "duration_seconds": 0,
                "avg_speed_kmh": None,
                "point_count": 0,
                "started_at": journey.get("started_at"),
                "ended_at": journey.get("completed_at"),
                "source": "insufficient_data",
            }

        return {
            "journey_id": journey_id,
            **stats,
            "started_at": journey.get("started_at"),
            "ended_at": journey.get("completed_at"),
            "source": "live",
        }

    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"get_journey_stats failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not compute journey stats")
