import httpx
import logging
from typing import List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import get_current_user
from app.db.client import get_service_role_client, get_supabase_client
from app.schemas.guardian import (
    GuardianLinkRequest,
    GuardianLinkResponse,
    GuardianCreate,
    GuardianResponse,
    GuardianUpdate
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/guardians", tags=["guardians"])


@router.get("/me/code")
def get_my_guardian_code(auth_data: dict = Depends(get_current_user)):
    """
    Returns the authenticated user's 6-digit ward code.
    Generates and persists a new code if one is missing or invalid.
    """
    user = auth_data["user"]
    service_client = get_service_role_client()
    import re
    import random

    try:
        res = service_client.table("profiles").select("guardian_code, id, email, full_name").eq("id", user.id).execute()

        # If no profile exists, create a minimal one so we can save the code
        if not res.data:
            service_client.table("profiles").upsert({
                "id": user.id,
                "email": user.email or "",
                "full_name": "",
            }).execute()
            res = service_client.table("profiles").select("guardian_code, id, email, full_name").eq("id", user.id).execute()

        if not res.data:
            raise HTTPException(status_code=500, detail="Could not find or create profile")

        profile = res.data[0]
        current_code = profile.get("guardian_code") or ""

        # Validate: must be exactly 6 digits, no SH- prefix, no spaces
        if not re.match(r"^[0-9]{6}$", str(current_code)):
            # Generate a unique 6-digit code
            for _ in range(50):
                candidate = f"{random.randint(0, 999999):06d}"
                collision = service_client.table("profiles").select("id").eq("guardian_code", candidate).neq("id", user.id).execute()
                if not collision.data:
                    code = candidate
                    break
            else:
                raise HTTPException(status_code=500, detail="Could not generate unique ward code")

            service_client.table("profiles").update({"guardian_code": code}).eq("id", user.id).execute()
            current_code = code

        return {
            "user_id": profile["id"],
            "email": profile.get("email"),
            "full_name": profile.get("full_name"),
            "ward_code": current_code,
            "code": current_code,
        }
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.exception("Error fetching ward code")
        raise HTTPException(status_code=500, detail="Could not fetch ward code")

@router.get("", response_model=List[dict])
def get_guardians(auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        # Get links where this user is the user_id (they linked a guardian)
        result = service_client.table("guardian_links").select("id, status, created_at, profiles!guardian_links_guardian_id_fkey(id, full_name, phone, email)").eq("user_id", user.id).execute()
        
        # Flatten the response to be somewhat compatible
        mapped = []
        for row in result.data or []:
            prof = row.get("profiles", {})
            mapped.append({
                "id": row["id"],
                "guardian_user_id": prof.get("id"),
                "name": prof.get("full_name") or "Unknown",
                "phone": prof.get("phone") or "",
                "email": prof.get("email") or "",
                "status": row["status"],
                "created_at": row["created_at"]
            })
        return mapped
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error fetching guardians: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not fetch guardians")

from typing import Optional

def safe_dt(value):
    return str(value) if value else ""

def normalize_profile(profile_value):
    if isinstance(profile_value, list):
        return profile_value[0] if profile_value else {}
    if isinstance(profile_value, dict):
        return profile_value
    return {}

def compute_protected_user_status(service_client, user_id: str):
    data = {
        "protected_user_id": user_id,
        "protectedUserId": user_id,
        "status": "UNKNOWN",
        "active_alert_count": 0,
        "activeAlertCount": 0,
        "active_journey_count": 0,
        "activeJourneyCount": 0,
        "latest_activity": None,
        "last_location": {
            "latitude": None,
            "longitude": None,
            "accuracy": None,
            "captured_at": None
        }
    }
    
    try:
        alerts = service_client.table("sos_alerts").select("*").eq("user_id", user_id).execute()
        alert_list = [a for a in alerts.data or [] if str(a.get("status") or "").upper() in ["ACTIVE", "SILENT_DURESS_ACTIVE"]]
    except Exception as e:
        logger.error(f"Error fetching alerts: {e}")
        alert_list = []
        
    data["active_alert_count"] = len(alert_list)
    data["activeAlertCount"] = len(alert_list)
    
    latest_sos = None
    for a in alert_list:
        if not latest_sos or safe_dt(a.get("created_at")) > safe_dt(latest_sos.get("created_at")):
            latest_sos = a
            
    if latest_sos:
        data["latest_activity"] = {
            "type": "SOS_ALERT",
            "title": "Active SOS",
            "message": latest_sos.get("visible_message") or "SOS Alert Sent",
            "created_at": latest_sos.get("created_at")
        }
        if latest_sos.get("location_lat") is not None and latest_sos.get("location_long") is not None:
            data["last_location"] = {
                "latitude": latest_sos.get("location_lat"),
                "longitude": latest_sos.get("location_long"),
                "accuracy": latest_sos.get("location_accuracy"),
                "captured_at": latest_sos.get("created_at")
            }

    try:
        journeys = service_client.table("safe_windows").select("*").eq("user_id", user_id).execute()
        journey_list = journeys.data or []
    except Exception as e:
        logger.error(f"Error fetching safe windows: {e}")
        journey_list = []
    
    active_journeys = [j for j in journey_list if str(j.get("status") or "").lower() == "active"]
    missed_journeys = [j for j in journey_list if str(j.get("status") or "").lower() == "missed"]
    
    data["active_journey_count"] = len(active_journeys)
    data["activeJourneyCount"] = len(active_journeys)
    
    latest_journey = None
    for j in active_journeys + missed_journeys:
        if not latest_journey or safe_dt(j.get("started_at")) > safe_dt(latest_journey.get("started_at")):
            latest_journey = j
            
    if latest_journey and not data["latest_activity"]:
        data["latest_activity"] = {
            "type": "JOURNEY",
            "title": "Active Journey" if str(latest_journey.get("status")).lower() == "active" else "Missed Check-in",
            "message": "User is sharing location",
            "created_at": latest_journey.get("started_at")
        }
        
    if latest_journey and data["last_location"]["latitude"] is None:
        if latest_journey.get("current_latitude") is not None and latest_journey.get("current_longitude") is not None:
            data["last_location"] = {
                "latitude": latest_journey.get("current_latitude"),
                "longitude": latest_journey.get("current_longitude"),
                "accuracy": None,
                "captured_at": None
            }

    if data["active_alert_count"] > 0:
        data["status"] = "EMERGENCY"
    elif len(missed_journeys) > 0:
        data["status"] = "MISSED_CHECKIN"
    elif data["active_journey_count"] > 0:
        data["status"] = "ACTIVE_JOURNEY"
    else:
        data["status"] = "SAFE"
        
    return data

@router.get("/dashboard")
def get_guardian_dashboard(auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()
    try:

        # 1. Fetch ALL linked users
        links = service_client.table("guardian_links").select("user_id").eq("guardian_user_id", user.id).execute()
        base_uids = [row.get("user_id") for row in links.data or [] if row.get("user_id")]
                
        if not base_uids:
            return []
            
        profiles_res = service_client.table("profiles").select("id, full_name, phone, email").in_("id", base_uids).execute()
        profiles_map = {p["id"]: p for p in profiles_res.data or []}
        
        result = []
        for uid in base_uids:
            prof = profiles_map.get(uid, {})
            user_data = compute_protected_user_status(service_client, uid)
            user_data["name"] = prof.get("full_name") or "Unknown"
            user_data["phone"] = prof.get("phone")
            user_data["email"] = prof.get("email")
            result.append(user_data)

        return result
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.exception("Failed to fetch guardian dashboard")
        raise HTTPException(status_code=500, detail="Could not fetch dashboard")

@router.get("/users/{protected_user_id}/summary")
def get_user_summary(protected_user_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()
    try:
        links = service_client.table("guardian_links").select("status").eq("guardian_user_id", user.id).eq("user_id", protected_user_id).eq("status", "ACTIVE").execute()
        if not links.data:
            raise HTTPException(status_code=403, detail="Not authorized")
            
        prof = service_client.table("profiles").select("*").eq("id", protected_user_id).execute()
        
        # Pull all, then filter safely to avoid ENUM crashes
        aj_res = service_client.table("safe_windows").select("*").eq("user_id", protected_user_id).execute()
        aa_res = service_client.table("sos_alerts").select("*").eq("user_id", protected_user_id).execute()
        
        aj_list = [j for j in aj_res.data or [] if str(j.get("status") or "").lower() in ["active", "missed"]]
        aj_list.sort(key=lambda x: safe_dt(x.get("started_at")), reverse=True)
        
        rc_list = [j for j in aj_res.data or [] if str(j.get("status") or "").lower() in ["completed", "cancelled"]]
        rc_list.sort(key=lambda x: safe_dt(x.get("started_at")), reverse=True)
        rc_list = rc_list[:5]
        
        aa_list = [a for a in aa_res.data or [] if str(a.get("status") or "").upper() in ["ACTIVE", "SILENT_DURESS_ACTIVE"]]
        aa_list.sort(key=lambda x: safe_dt(x.get("created_at")), reverse=True)
        
        ra_list = aa_res.data or []
        ra_list.sort(key=lambda x: safe_dt(x.get("created_at")), reverse=True)
        ra_list = ra_list[:20]
        
        status_data = compute_protected_user_status(service_client, protected_user_id)
        
        profile_data = normalize_profile(prof.data)
        
        return {
            "protected_user_id": protected_user_id,
            "protectedUserId": protected_user_id,
            "profile": profile_data,
            "status": status_data["status"],
            "active_alert_count": status_data["active_alert_count"],
            "active_journey_count": status_data["active_journey_count"],
            "latest_location": status_data["last_location"],
            "active_journey": aj_list[0] if aj_list else None,
            "active_alerts": aa_list,
            "recent_completed_journeys": rc_list,
            "recent_activity": ra_list
        }
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.exception("get_user_summary failed")
        raise HTTPException(status_code=500, detail="Could not fetch summary")

@router.get("/users/{protected_user_id}/activity")
def get_user_activity(protected_user_id: str, limit: int = 20, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()
    try:
        links = service_client.table("guardian_links").select("status").eq("guardian_user_id", user.id).eq("user_id", protected_user_id).eq("status", "ACTIVE").execute()
        if not links.data:
            raise HTTPException(status_code=403, detail="Not authorized")
            
        ra = service_client.table("sos_alerts").select("*").eq("user_id", protected_user_id).order("created_at", desc=True).limit(limit).execute()
        return ra.data or []
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Could not fetch activity")

@router.get("/watching", response_model=List[dict])
def get_watching(
    protected_user_id: Optional[str] = None,
    status: Optional[str] = None,
    active_only: bool = False,
    limit: int = 50,
    auth_data: dict = Depends(get_current_user)
):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        # Get links where this user is the guardian
        query = service_client.table("guardian_links").select("id, status, created_at, profiles!guardian_links_user_id_fkey(id, full_name, phone, email)").eq("guardian_user_id", user.id)
        if protected_user_id:
            query = query.eq("user_id", protected_user_id)
        if status:
            query = query.eq("status", status)
        if active_only:
            query = query.eq("status", "ACTIVE")
            
        result = query.limit(limit).execute()
        mapped = []
        for row in result.data or []:
            prof = row.get("profiles", {})
            mapped.append({
                "id": row["id"],
                "protected_user_id": prof.get("id"),
                "name": prof.get("full_name") or "Unknown",
                "phone": prof.get("phone") or "",
                "email": prof.get("email") or "",
                "status": row["status"],
                "created_at": row["created_at"]
            })
        return mapped
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error fetching protected users: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not fetch protected users")

@router.get("/alerts", response_model=List[dict])
def get_guardian_alerts(
    protected_user_id: Optional[str] = None,
    status: Optional[str] = None,
    active_only: bool = False,
    limit: int = 50,
    auth_data: dict = Depends(get_current_user)
):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        # Get users this guardian is watching
        links = service_client.table("guardian_links").select("user_id").eq("guardian_user_id", user.id).execute()
        protected_user_ids = [link["user_id"] for link in links.data or []]
        
        if not protected_user_ids:
            return []
            
        if protected_user_id:
            if protected_user_id not in protected_user_ids:
                return []
            protected_user_ids = [protected_user_id]
            
        query = service_client.table("sos_alerts").select("*, profiles!sos_alerts_user_id_fkey(full_name, phone)").in_("user_id", protected_user_ids)
        if status:
            query = query.eq("status", status)
        if active_only:
            query = query.in_("status", ["ACTIVE", "SILENT_DURESS_ACTIVE"])
            
        alerts = query.order("created_at", desc=True).limit(limit).execute()
        return alerts.data or []
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error fetching guardian alerts: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not fetch guardian alerts")

@router.put("/alerts/{alert_id}/resolve", status_code=status.HTTP_200_OK)
def resolve_guardian_alert(alert_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        # First ensure this user is actually a guardian of the person who created the alert
        links = service_client.table("guardian_links").select("user_id").eq("guardian_user_id", user.id).execute()
        protected_user_ids = [link["user_id"] for link in links.data or []]
        
        if not protected_user_ids:
            raise HTTPException(status_code=403, detail="Not authorized to resolve this alert")

        # Now fetch the alert to check its owner
        alert = service_client.table("sos_alerts").select("user_id, status").eq("id", alert_id).execute()
        if not alert.data:
            raise HTTPException(status_code=404, detail="Alert not found")
            
        if alert.data[0]["user_id"] not in protected_user_ids:
            raise HTTPException(status_code=403, detail="Not authorized to resolve this alert")

        # Resolve the alert
        result = service_client.table("sos_alerts").update({"status": "RESOLVED"}).eq("id", alert_id).execute()
        return {"status": "success"}
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error resolving guardian alert: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not resolve guardian alert")

@router.get("/safe-windows", response_model=List[dict])
def get_guardian_safe_windows(
    protected_user_id: Optional[str] = None,
    status: Optional[str] = None,
    active_only: bool = False,
    limit: int = 50,
    auth_data: dict = Depends(get_current_user)
):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        links = service_client.table("guardian_links").select("user_id").eq("guardian_user_id", user.id).execute()
        protected_user_ids = [link["user_id"] for link in links.data or []]
        
        if not protected_user_ids:
            return []
            
        if protected_user_id:
            if protected_user_id not in protected_user_ids:
                return []
            protected_user_ids = [protected_user_id]
            
        # Fetch all, filter in Python to avoid enum case crashes and support normalize_profile
        query = service_client.table("safe_windows").select("*, profiles!safe_windows_user_id_fkey(full_name, phone)").in_("user_id", protected_user_ids)
        windows = query.order("started_at", desc=True).limit(limit).execute()
        
        result = []
        for w in windows.data or []:
            w["profiles"] = normalize_profile(w.get("profiles"))
            
            w_status = str(w.get("status") or "").lower()
            if status and w_status != status.lower():
                continue
            if active_only and w_status not in ["active", "missed"]:
                continue
            result.append(w)
            
        return result
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.exception("get_guardian_safe_windows failed")
        raise HTTPException(status_code=500, detail="Could not fetch guardian safe windows")

@router.get("/safe-windows/{window_id}", response_model=dict)
def get_guardian_safe_window(window_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        links = service_client.table("guardian_links").select("user_id").eq("guardian_user_id", user.id).execute()
        protected_user_ids = [link["user_id"] for link in links.data or []]
        
        if not protected_user_ids:
            raise HTTPException(status_code=404, detail="Safe window not found or unauthorized")
            
        window = service_client.table("safe_windows").select("*, profiles!safe_windows_user_id_fkey(full_name, phone)").eq("id", window_id).in_("user_id", protected_user_ids).execute()
        if not window.data:
            raise HTTPException(status_code=404, detail="Safe window not found or unauthorized")
            
        return window.data[0]
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error fetching guardian safe window: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not fetch guardian safe window")

@router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_guardian_link(link_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        result = service_client.table("guardian_links").delete().eq("id", link_id).eq("user_id", user.id).execute()
        return
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error deleting guardian link: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not delete guardian link")


@router.post(
    "/link",
    status_code=status.HTTP_201_CREATED
)
def link_guardian(
    link_in: GuardianLinkRequest,
    auth_data: dict = Depends(get_current_user)
):
    """
    Guardian enters ward's 6-digit code to monitor that ward.
    """
    user = auth_data["user"]
    service_client = get_service_role_client()

    code = getattr(link_in, "ward_code", None) or getattr(link_in, "code", None) or getattr(link_in, "guardian_code", None)
    
    import re
    if not code or not re.match(r"^[0-9]{6}$", code):
        raise HTTPException(status_code=400, detail="Invalid ward code. Must be exactly 6 digits.")

    logger.info(f"Guardian {user.id} attempting to link ward code {code}")

    try:
        # Find protected user profile by ward_code (which is stored in guardian_code for now)
        ward_result = (
            service_client
            .table("profiles")
            .select("id,full_name")
            .eq("guardian_code", code)
            .execute()
        )

        if not ward_result.data:
            raise HTTPException(
                status_code=404,
                detail="Ward not found for this code"
            )

        ward_id = ward_result.data[0]["id"]
        ward_name = ward_result.data[0].get("full_name") or "Unknown"

        # Prevent self-linking
        if ward_id == user.id:
            raise HTTPException(
                status_code=400,
                detail="Cannot link yourself"
            )

        # Check for existing link
        existing_link = (
            service_client
            .table("guardian_links")
            .select("*")
            .eq("user_id", ward_id)
            .eq("guardian_user_id", user.id)
            .execute()
        )

        if existing_link.data:
            from fastapi.responses import JSONResponse
            return JSONResponse(status_code=200, content={
                "message": "Already linked",
                "protected_user_id": ward_id,
                "name": ward_name,
                "status": existing_link.data[0]["status"]
            })

        # Create guardian link
        link_data = {
            "user_id": ward_id,
            "guardian_user_id": user.id,
            "status": "ACTIVE"
        }

        result = (
            service_client
            .table("guardian_links")
            .insert(link_data)
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=500,
                detail="Failed to create guardian link"
            )

        # Notify the ward that they have a new guardian (bell notification)
        try:
            guardian_profile = (
                service_client.table("profiles")
                .select("full_name, email")
                .eq("id", user.id)
                .execute()
            )
            gp = guardian_profile.data[0] if guardian_profile.data else {}
            guardian_display = gp.get("full_name") or gp.get("email") or "Someone"

            service_client.table("in_app_notifications").insert({
                "user_id": ward_id,
                "actor_user_id": user.id,
                "type": "guardian_linked",
                "title": "New guardian",
                "message": f"{guardian_display} is now monitoring you as a guardian.",
                "metadata": {
                    "guardian_id": user.id,
                    "guardian_name": guardian_display,
                },
            }).execute()
        except Exception as notif_err:
            logger.warning(f"Failed to insert guardian_linked notification: {notif_err}")

        return {
            "message": "Ward linked successfully",
            "protected_user_id": ward_id,
            "name": ward_name,
            "status": "ACTIVE"
        }
    except HTTPException:
        raise

    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(
            f"Error linking guardian: {str(e)}",
            exc_info=True
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not link guardian"
        )

from typing import Optional
from pydantic import BaseModel
from app.services.notification_service import notification_service

class ActionRequest(BaseModel):
    action_type: str
    message: Optional[str] = None

@router.post("/alerts/{alert_id}/actions")
def create_guardian_action(alert_id: str, payload: ActionRequest, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    import uuid
    try:
        uuid.UUID(str(alert_id))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid alert_id format")

    try:
        # Check if alert exists
        alert_res = service_client.table("sos_alerts").select("user_id, safe_window_id").eq("id", alert_id).execute()
        if not alert_res.data:
            raise HTTPException(status_code=404, detail="Alert not found")
        
        protected_user_id = alert_res.data[0]["user_id"]
        journey_id = alert_res.data[0].get("safe_window_id")

        # Check guardian link
        link_res = service_client.table("guardian_links").select("id").eq("guardian_user_id", user.id).eq("user_id", protected_user_id).eq("status", "ACTIVE").execute()
        
        if not link_res.data:
            raise HTTPException(status_code=403, detail="Not authorized as active guardian")
            
        action_data = {
            "alert_id": alert_id,
            "guardian_user_id": user.id,
            "protected_user_id": protected_user_id,
            "journey_id": journey_id,
            "action_type": payload.action_type,
            "message": payload.message,
            "status": "success",
            "metadata": {}
        }
        
        result = service_client.table("guardian_alert_actions").insert(action_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create action")
            
        if payload.action_type in ["RESOLVED", "FALSE_ALARM"]:
            try:
                service_client.table("sos_alerts").update({
                    "status": "RESOLVED",
                    "cancel_method": "GUARDIAN_" + payload.action_type
                }).eq("id", alert_id).execute()
            except httpx.TimeoutException:
                raise
            except httpx.RequestError:
                raise
            except Exception as e:
                logger.warning(f"Failed to auto-resolve alert from action: {e}")

        # Log timeline event
        notification_service._log_event(
            event_type="GUARDIAN_ACTION",
            status="SUCCESS",
            user_id=protected_user_id,
            guardian_user_id=user.id,
            alert_id=alert_id,
            journey_id=journey_id,
            message=payload.message or payload.action_type,
            metadata={
                "action_type": payload.action_type
            }
        )

        # Map action to a friendly title — normalize legacy/alternate action type names
        ACTION_NORMALIZATION = {
            "MARK_VIEWED": "VIEWED_ALERT",
            "DISMISSED": "DISMISSED_ALERT",
            "CALLED_USER": "CALLED_WARD",
            "SENT_MESSAGE": "MESSAGED_WARD",
            "NAVIGATING_TO_YOU": "NAVIGATING_TO_WARD",
        }
        normalized_action_type = ACTION_NORMALIZATION.get(payload.action_type, payload.action_type)

        action_titles = {
            "VIEWED_ALERT": "Guardian viewed alert",
            "I_AM_RESPONDING": "Guardian is responding",
            "NAVIGATING_TO_WARD": "Guardian is on the way",
            "CALLING_POLICE": "Guardian is calling police",
            "CALLED_WARD": "Guardian called the ward",
            "MESSAGED_WARD": "Guardian sent a message",
            "RESOLVED": "Guardian resolved the alert",
            "FALSE_ALARM": "Guardian marked false alarm",
            "DISMISSED_ALERT": "Guardian dismissed the alert",
        }
        title = action_titles.get(normalized_action_type, f"Guardian action: {normalized_action_type}")
        msg = payload.message or "Guardian reacted to your SOS."

        # Insert IN_APP_NOTIFICATION for the protected user
        try:
            service_client.table("in_app_notifications").insert({
                "user_id": protected_user_id,
                "actor_user_id": user.id,
                "alert_id": alert_id,
                "journey_id": journey_id,
                "type": normalized_action_type,
                "title": title,
                "message": msg,
                "metadata": {
                    "action_type": normalized_action_type,
                    "original_action_type": payload.action_type,
                }
            }).execute()
        except Exception as e:
            logger.warning(f"Failed to create in-app notification: {e}")
        return result.data[0]
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error creating action: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not create action")

@router.get("/alerts/{alert_id}/actions")
def get_guardian_actions(alert_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    import uuid
    try:
        uuid.UUID(str(alert_id))
    except ValueError:
        return []

    try:
        # Check if alert exists
        alert_res = service_client.table("sos_alerts").select("user_id").eq("id", alert_id).execute()
        if not alert_res.data:
            return []
            
        protected_user_id = alert_res.data[0]["user_id"]
        
        # Must be owner or active guardian
        if protected_user_id != user.id:
            link_res = service_client.table("guardian_links").select("id").eq("guardian_user_id", user.id).eq("user_id", protected_user_id).eq("status", "ACTIVE").execute()
            if not link_res.data:
                return []
                
        # Fetch actions without embedded profiles to avoid schema cache issues
        result = service_client.table("guardian_alert_actions").select(
            "id, action_type, message, status, created_at, guardian_user_id"
        ).eq("alert_id", alert_id).order("created_at", desc=True).execute()
        
        actions = result.data or []
        if not actions:
            return []
            
        guardian_ids = list(set([a["guardian_user_id"] for a in actions if a.get("guardian_user_id")]))
        profiles_map = {}
        if guardian_ids:
            try:
                prof_res = service_client.table("profiles").select("id, full_name, email").in_("id", guardian_ids).execute()
                for p in prof_res.data or []:
                    profiles_map[p["id"]] = p
            except httpx.TimeoutException:
                raise
            except httpx.RequestError:
                raise
            except Exception as e:
                logger.warning(f"Failed to fetch profiles for actions: {e}")
        
        mapped = []
        for row in actions:
            prof = profiles_map.get(row.get("guardian_user_id"), {})
            mapped.append({
                "id": row["id"],
                "alert_id": alert_id,
                "guardian_user_id": row.get("guardian_user_id"),
                "guardian_name": prof.get("full_name") or prof.get("email") or "Guardian",
                "guardian_phone": prof.get("phone") or "",
                "action_type": row["action_type"],
                "message": row["message"],
                "status": row["status"],
                "created_at": row["created_at"]
            })
            
        return mapped
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error fetching actions: {e}", exc_info=True)
        return []


@router.get("/safety-recipients")
def get_safety_recipients(auth_data: dict = Depends(get_current_user)):
    """
    Returns all safety recipients for the authenticated ward:
    - Direct guardians (via guardian_links, status=ACTIVE)
    - Approved/active family members (via family_members, status=active)

    This is the single resolver used by Spec 2 notification dispatch.
    Each entry has: user_id, name, email, phone, source ('guardian' | 'family'), family_id (if family)
    """
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        recipients: list[dict] = []
        seen_ids: set[str] = set()

        # 1. Direct guardians
        try:
            links_res = service_client.table("guardian_links").select(
                "guardian_user_id, profiles!guardian_links_guardian_id_fkey(id, full_name, phone, email)"
            ).eq("user_id", user.id).eq("status", "ACTIVE").execute()

            for row in links_res.data or []:
                prof = normalize_profile(row.get("profiles", {}))
                gid = prof.get("id") or row.get("guardian_user_id")
                if gid and gid not in seen_ids:
                    seen_ids.add(gid)
                    recipients.append({
                        "user_id": gid,
                        "name": prof.get("full_name") or "Unknown",
                        "email": prof.get("email") or "",
                        "phone": prof.get("phone") or "",
                        "source": "guardian",
                        "family_id": None,
                    })
        except Exception as e:
            logger.warning(f"Could not fetch guardian recipients: {e}")

        # 2. Active family members (excluding the ward themselves)
        try:
            membership_res = service_client.table("family_members").select("family_id").eq("user_id", user.id).eq("status", "active").execute()
            if membership_res.data:
                family_id = membership_res.data[0]["family_id"]
                members_res = service_client.table("family_members").select(
                    "user_id, profiles:user_id(id, full_name, phone, email)"
                ).eq("family_id", family_id).eq("status", "active").neq("user_id", user.id).execute()

                for row in members_res.data or []:
                    prof = normalize_profile(row.get("profiles", {}))
                    mid = prof.get("id") or row.get("user_id")
                    if mid and mid not in seen_ids:
                        seen_ids.add(mid)
                        recipients.append({
                            "user_id": mid,
                            "name": prof.get("full_name") or "Unknown",
                            "email": prof.get("email") or "",
                            "phone": prof.get("phone") or "",
                            "source": "family",
                            "family_id": family_id,
                        })
        except Exception as e:
            logger.warning(f"Could not fetch family recipients: {e}")

        return recipients

    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.exception("Failed to fetch safety recipients")
        raise HTTPException(status_code=500, detail="Could not fetch safety recipients")
