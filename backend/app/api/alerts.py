import logging
from fastapi import APIRouter, Depends, HTTPException, status
from app.core.auth import get_current_user
from app.db.client import get_service_role_client
from app.schemas.alert import AlertCreate, AlertResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

@router.post("", response_model=AlertResponse, status_code=status.HTTP_201_CREATED)
def create_alert(alert_in: AlertCreate, auth_data: dict = Depends(get_current_user)):
    """
    Creates an SOS Alert.
    Requires a valid JWT. The user_id is extracted from the JWT, never the request body.
    """
    user = auth_data["user"]
    logger.info(f"Creating alert for user_id: {user.id} with trigger_type: {alert_in.trigger_type}")

    # Use the service-role client to insert as requested in Phase 7 - Work 1
    # This bypasses RLS for the insert, but we enforce security in this endpoint
    service_client = get_service_role_client()
    
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
    
    logger.info("SOS_DEBUG: request received")
    logger.info(f"user={user.id}")
    logger.info(f"payload={alert_data}")
    
    try:
        result = service_client.table("sos_alerts").insert(alert_data).execute()
        logger.info(f"insert result: {result.data}")
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to insert alert")
        
        logger.info(f"Successfully created alert {result.data[0]['id']} for user {user.id}")
        return result.data[0]
    except Exception as e:
        logger.error(f"insert exception: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save alert to database"
        )
