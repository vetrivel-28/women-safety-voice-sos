import httpx
import logging
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from app.core.auth import get_current_user
from app.db.client import get_service_role_client
from app.schemas.alert import AlertCreate, AlertResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sos", tags=["sos"])

from app.services.notification_service import notification_service

@router.post("/create", response_model=AlertResponse, status_code=status.HTTP_201_CREATED)
def create_sos_alert(alert_in: AlertCreate, background_tasks: BackgroundTasks, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    logger.info(f"Creating SOS alert for user_id: {user.id} with trigger_type: {alert_in.trigger_type}")

    service_client = get_service_role_client()
    
    # Upsert profile to prevent FK constraint failure.
    # Fetch first to preserve existing guardian_code (column is NOT NULL).
    try:
        import re as _re
        import random as _random
        existing_profile = service_client.table("profiles").select("id, guardian_code").eq("id", user.id).execute()
        
        if not existing_profile.data:
            # Generate a valid 6-digit code for new profile
            for _ in range(50):
                candidate = f"{_random.randint(0, 999999):06d}"
                collision = service_client.table("profiles").select("id").eq("guardian_code", candidate).neq("id", user.id).execute()
                if not collision.data:
                    new_code = candidate
                    break
            else:
                new_code = f"{_random.randint(0, 999999):06d}"
            
            service_client.table("profiles").insert({
                "id": user.id,
                "email": user.email or "",
                "full_name": "",
                "guardian_code": new_code,
            }).execute()
        else:
            existing_code = (existing_profile.data[0] or {}).get("guardian_code", "")
            if not existing_code or not _re.match(r'^[0-9]{6}$', str(existing_code)):
                # Fix invalid code inline
                for _ in range(50):
                    candidate = f"{_random.randint(0, 999999):06d}"
                    collision = service_client.table("profiles").select("id").eq("guardian_code", candidate).neq("id", user.id).execute()
                    if not collision.data:
                        new_code = candidate
                        break
                else:
                    new_code = f"{_random.randint(0, 999999):06d}"
                service_client.table("profiles").update({"guardian_code": new_code}).eq("id", user.id).execute()
        logger.info(f"Ensured profile exists for user {user.id}")
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.warning(f"Profile ensure failed (non-fatal): {e}")

    raw_trigger = alert_in.trigger_type.value if hasattr(alert_in.trigger_type, 'value') else str(alert_in.trigger_type)
    norm_trigger = raw_trigger
    if raw_trigger in ['MANUAL', 'SOS', 'MANUAL_SOS']:
        norm_trigger = 'MANUAL_SOS'
    elif raw_trigger in ['SILENT', 'SILENT_SOS']:
        norm_trigger = 'SILENT_SOS'
    elif raw_trigger in ['JOURNEY_MISSED_CHECKIN', 'SAFE_WINDOW_MISSED_CHECKIN', 'JOURNEY_MISSED']:
        norm_trigger = 'JOURNEY_MISSED_CHECKIN'
    elif raw_trigger in ['DEAD_MAN', 'DEAD_MAN_MISSED', 'DEAD_MAN_CHECKIN_MISSED']:
        norm_trigger = 'DEAD_MAN_MISSED'

    alert_data = {
        "user_id": user.id,
        "trigger_type": norm_trigger,
        "status": alert_in.status.value,
        "cancel_method": alert_in.cancel_method.value if alert_in.cancel_method else "NONE",
        "visible_message": alert_in.visible_message,
        "location_lat": alert_in.latitude,
        "location_long": alert_in.longitude,
        "location_map_link": alert_in.map_link,
    }
    try:
        from datetime import datetime, timezone
        
        # Auto-resolve previous active alerts for this user
        try:
            service_client.table("sos_alerts").update({
                "status": "RESOLVED",
                "cancel_method": "AUTO_RESOLVED",
                "cancelled_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            }).eq("user_id", user.id).eq("status", "ACTIVE").execute()
        except Exception as resolve_err:
            logger.warning(f"Failed to auto-resolve previous alerts: {resolve_err}")

        result = service_client.table("sos_alerts").insert(alert_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to insert alert")
            
        created_alert = result.data[0]
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"insert exception: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save alert to database"
        )
        
    def fire_notifications():
        try:
            location = None
            if alert_in.latitude and alert_in.longitude:
                location = {"lat": alert_in.latitude, "long": alert_in.longitude}
                
            # Log primary creation event
            notification_service.send_sos_sms_to_emergency_contacts(
                user_id=user.id,
                alert_id=created_alert["id"],
                alert_payload={"id": created_alert["id"], "trigger_type": norm_trigger, "location": location},
                user=user
            )
            
            # Notify all stored guardians
            all_status = notification_service.notify_all_guardians(
                user_id=user.id,
                alert_type=norm_trigger,
                user=user,
                location=location,
                alert_id=created_alert["id"]
            )
            logger.info(f"All stored guardians notification status: {all_status}")

            # Notify all family members
            family_status = notification_service.notify_family_members(
                user_id=user.id,
                alert_type=norm_trigger,
                user=user,
                location=location,
                alert_id=created_alert["id"]
            )
            logger.info(f"Family members notification status: {family_status}")
        except httpx.TimeoutException:
            raise
        except httpx.RequestError:
            raise
        except Exception as e:
            logger.error(f"Notification error (ignored): {e}")

    # Trigger guardian notification in background
    background_tasks.add_task(fire_notifications)
        
    return created_alert

from pydantic import BaseModel
from typing import Optional
from app.schemas.alert import AlertStatus, CancelMethod

class AlertUpdate(BaseModel):
    status: AlertStatus
    cancel_method: Optional[CancelMethod] = None

@router.patch("/{alert_id}", response_model=AlertResponse)
def update_sos_alert(alert_id: str, alert_update: AlertUpdate, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()
    
    # First verify ownership
    try:
        existing = service_client.table("sos_alerts").select("*").eq("id", alert_id).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Alert not found")
            
        if existing.data[0]["user_id"] != user.id:
            raise HTTPException(status_code=403, detail="Not authorized to modify this alert")
            
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error checking alert ownership: {e}")
        raise HTTPException(status_code=500, detail="Database error")

    new_status = alert_update.status.value
    
    # Handle duress pin logic
    if alert_update.cancel_method == CancelMethod.DURESS_PIN:
        new_status = AlertStatus.SILENT_DURESS_ACTIVE.value

    update_data = {
        "status": new_status,
        "cancel_method": alert_update.cancel_method.value if alert_update.cancel_method else "NONE"
    }
    
    if new_status in [AlertStatus.RESOLVED.value, AlertStatus.CANCELLED.value]:
        # You could add cancelled_at or resolved_at if schema supports it, but let's stick to status
        pass

    try:
        result = service_client.table("sos_alerts").update(update_data).eq("id", alert_id).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update alert")
        return result.data[0]
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error updating alert: {e}")
        raise HTTPException(status_code=500, detail="Could not update alert")

@router.get("/{alert_id}/notification-events")
def get_alert_events(alert_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()
    
    import uuid
    try:
        uuid.UUID(str(alert_id))
    except ValueError:
        return []
    
    try:
        # Check ownership
        alert_res = service_client.table("sos_alerts").select("user_id").eq("id", alert_id).execute()
        if not alert_res.data:
            return []
            
        owner_id = alert_res.data[0]["user_id"]
        
        # If not owner, check if active guardian
        if owner_id != user.id:
            guardian_res = service_client.table("guardian_links").select("id").eq("user_id", owner_id).eq("guardian_user_id", user.id).eq("status", "ACTIVE").execute()
            if not guardian_res.data:
                raise HTTPException(status_code=403, detail="Not authorized to view this alert's events")
                
        # Fetch events
        events_res = service_client.table("notification_events").select("*").eq("alert_id", alert_id).order("created_at", desc=False).execute()
        return events_res.data or []
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error fetching alert events: {e}")
        return []

@router.post("/{alert_id}/view")
def log_alert_view(alert_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    
    try:
        # The service internally checks idempotency
        notification_service._log_event(
            event_type="GUARDIAN_ALERT_VIEWED",
            status="SUCCESS",
            user_id=user.id,
            alert_id=alert_id,
            message="Guardian viewed the alert details"
        )
        return {"success": True}
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Failed to log alert view: {e}")
        return {"success": False}

@router.post("/{alert_id}/ack")
def acknowledge_sos_alert(alert_id: str, contact: str):
    """
    Endpoint for a contact to acknowledge an SOS alert via SMS link.
    """
    service_client = get_service_role_client()
    try:
        from datetime import datetime, timezone
        # Mark target as acknowledged
        res = service_client.table("sos_escalation_targets")\
            .update({"acknowledged_at": datetime.now(timezone.utc).isoformat()})\
            .eq("sos_alert_id", alert_id)\
            .eq("target_ref", contact)\
            .execute()
            
        if not res.data:
            raise HTTPException(status_code=404, detail="Target not found for this alert")
            
        # Transition alert to acknowledged if it was active
        alert = service_client.table("sos_alerts").select("status").eq("id", alert_id).execute()
        if alert.data and alert.data[0]["status"] == "active":
            service_client.table("sos_alerts").update({"status": "acknowledged"}).eq("id", alert_id).execute()
            
        return {"message": "SOS acknowledged successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error acknowledging SOS: {e}")
        raise HTTPException(status_code=500, detail="Could not acknowledge alert")
