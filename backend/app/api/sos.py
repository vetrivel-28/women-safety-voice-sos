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

    alert_data = {
        "user_id": user.id,
        "trigger_type": alert_in.trigger_type.value,
        "status": alert_in.status.value,
        "cancel_method": alert_in.cancel_method.value if alert_in.cancel_method else "NONE",
        "visible_message": alert_in.visible_message,
        "location_lat": alert_in.latitude,
        "location_long": alert_in.longitude,
        "location_map_link": alert_in.map_link,
    }
    
    try:
        result = service_client.table("sos_alerts").insert(alert_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to insert alert")
            
        created_alert = result.data[0]
        
        # Trigger guardian notification
        if alert_in.guardian_phone or alert_in.guardian_email:
            contact = {
                "name": alert_in.guardian_name,
                "phone": alert_in.guardian_phone,
                "email": alert_in.guardian_email
            }
            location = None
            if alert_in.latitude and alert_in.longitude:
                location = {"lat": alert_in.latitude, "long": alert_in.longitude}
                
            notif_status = notification_service.notify_guardian(
                contact=contact,
                alert_type=alert_in.trigger_type.value,
                user=user,
                location=location
            )
            logger.info(f"Notification status: {notif_status}")
            
        return created_alert
    except Exception as e:
        logger.error(f"insert exception: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save alert to database"
        )

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
