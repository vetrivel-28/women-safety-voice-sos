import logging
from fastapi import APIRouter, Depends, HTTPException, status
from app.core.auth import get_current_user
from app.db.client import get_service_role_client
from app.schemas.alert import AlertCreate, AlertResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sos", tags=["sos"])

from app.services.notification_service import notification_service

@router.post("/create", response_model=AlertResponse, status_code=status.HTTP_201_CREATED)
def create_sos_alert(alert_in: AlertCreate, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    logger.info(f"Creating SOS alert for user_id: {user.id} with trigger_type: {alert_in.trigger_type}")

    service_client = get_service_role_client()
    
    # Upsert profile to prevent FK constraint failure
    try:
        service_client.table("profiles").upsert({
            "id": user.id,
            "email": user.email,
        }).execute()
        logger.info(f"Ensured profile exists for user {user.id}")
    except Exception as e:
        logger.warning(f"Profile upsert failed, but continuing: {e}")

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
    except Exception as e:
        logger.error(f"insert exception: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save alert to database"
        )
        
    # Trigger guardian notification, do not fail endpoint on error
    try:
        location = None
        if alert_in.latitude and alert_in.longitude:
            location = {"lat": alert_in.latitude, "long": alert_in.longitude}
            
        # Optional: Notify primary if specifically passed from frontend
        if alert_in.guardian_phone or getattr(alert_in, 'guardian_email', None):
            contact = {
                "name": alert_in.guardian_name,
                "phone": alert_in.guardian_phone,
                "email": getattr(alert_in, 'guardian_email', None)
            }
            notif_status = notification_service.notify_guardian(
                contact=contact,
                alert_type=norm_trigger,
                user=user,
                location=location
            )
            logger.info(f"Primary Notification status: {notif_status}")
            
        # Notify all stored guardians
        all_status = notification_service.notify_all_guardians(
            user_id=user.id,
            alert_type=norm_trigger,
            user=user,
            location=location
        )
        logger.info(f"All stored guardians notification status: {all_status}")
    except Exception as e:
        logger.error(f"Notification error (ignored): {e}")
        
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
    except Exception as e:
        logger.error(f"Error updating alert: {e}")
        raise HTTPException(status_code=500, detail="Could not update alert")
