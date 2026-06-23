import logging
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from app.core.auth import get_current_user
from app.db.client import get_service_role_client
from app.schemas.alert import AlertResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

@router.get("", response_model=List[AlertResponse])
def get_alerts(auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()
    try:
        # Get users that this user is a guardian for
        links_result = service_client.table("guardian_links").select("user_id").eq("guardian_id", user.id).execute()
        linked_user_ids = [link["user_id"] for link in links_result.data] if links_result.data else []
        
        # Include the user's own id
        target_user_ids = [user.id] + linked_user_ids
        
        result = service_client.table("sos_alerts").select("*").in_("user_id", target_user_ids).order("created_at", desc=True).execute()
        return result.data
    except Exception as e:
        logger.error(f"Failed to fetch alerts: {e}")
        raise HTTPException(status_code=500, detail="Could not fetch alerts")

@router.get("/active", response_model=List[AlertResponse])
def get_active_alerts(auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()
    try:
        # Get users that this user is a guardian for
        links_result = service_client.table("guardian_links").select("user_id").eq("guardian_id", user.id).execute()
        linked_user_ids = [link["user_id"] for link in links_result.data] if links_result.data else []
        
        # Include the user's own id
        target_user_ids = [user.id] + linked_user_ids
        
        result = service_client.table("sos_alerts").select("*").in_("user_id", target_user_ids).in_("status", ["ACTIVE", "SILENT_DURESS_ACTIVE"]).order("created_at", desc=True).execute()
        return result.data
    except Exception as e:
        logger.error(f"Failed to fetch active alerts: {e}")
        raise HTTPException(status_code=500, detail="Could not fetch active alerts")
