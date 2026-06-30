from fastapi import APIRouter, Depends, HTTPException, status
import logging
import httpx
from typing import List, Dict, Any

from app.core.auth import get_current_user
from app.db.client import get_service_role_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

@router.get("", response_model=List[Dict[str, Any]])
def get_notifications(auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        res = service_client.table("notification_events") \
            .select("id, created_at, status, message, recipient, metadata") \
            .eq("user_id", user.id) \
            .eq("event_type", "IN_APP_NOTIFICATION") \
            .order("created_at", desc=True) \
            .limit(50) \
            .execute()
            
        return res.data or []
    except Exception as e:
        logger.error(f"Error fetching notifications: {e}")
        raise HTTPException(status_code=500, detail="Could not fetch notifications")

@router.get("/unread-count")
def get_unread_count(auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        res = service_client.table("notification_events") \
            .select("id", count="exact") \
            .eq("user_id", user.id) \
            .eq("event_type", "IN_APP_NOTIFICATION") \
            .eq("status", "UNREAD") \
            .execute()
        
        return {"count": res.count or 0}
    except Exception as e:
        logger.error(f"Error fetching unread count: {e}")
        raise HTTPException(status_code=500, detail="Could not fetch unread count")

@router.post("/{notification_id}/read")
def mark_read(notification_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        res = service_client.table("notification_events") \
            .update({"status": "READ"}) \
            .eq("id", notification_id) \
            .eq("user_id", user.id) \
            .execute()
            
        if not res.data:
            raise HTTPException(status_code=404, detail="Notification not found")
            
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error marking notification read: {e}")
        raise HTTPException(status_code=500, detail="Could not update notification")

@router.post("/read-all")
def mark_all_read(auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        service_client.table("notification_events") \
            .update({"status": "READ"}) \
            .eq("user_id", user.id) \
            .eq("event_type", "IN_APP_NOTIFICATION") \
            .eq("status", "UNREAD") \
            .execute()
            
        return {"success": True}
    except Exception as e:
        logger.error(f"Error marking all notifications read: {e}")
        raise HTTPException(status_code=500, detail="Could not update notifications")
