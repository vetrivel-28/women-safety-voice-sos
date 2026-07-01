from fastapi import APIRouter, Depends, HTTPException, status
import logging
from typing import List, Dict, Any
from datetime import datetime, timezone

from app.core.auth import get_current_user
from app.db.client import get_service_role_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

# Permission/config errors that should NOT be silently swallowed
_PERMISSION_KEYWORDS = ("permission denied", "42501", "insufficient privilege")

def _is_permission_error(e: Exception) -> bool:
    msg = str(e).lower()
    return any(kw in msg for kw in _PERMISSION_KEYWORDS)


@router.get("", response_model=List[Dict[str, Any]])
def get_notifications(auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        res = service_client.table("in_app_notifications") \
            .select("id, created_at, read_at, type, title, message, metadata") \
            .eq("user_id", user.id) \
            .order("created_at", desc=True) \
            .limit(50) \
            .execute()

        return res.data or []
    except Exception as e:
        if _is_permission_error(e):
            logger.error(
                f"DB PERMISSION ERROR on in_app_notifications for user {user.id}: {e}. "
                "Run migration 20_fix_in_app_notifications_permissions.sql to fix."
            )
            # Return a structured degraded response rather than faking []
            raise HTTPException(
                status_code=503,
                detail={
                    "error": "notifications_unavailable",
                    "message": "Notifications temporarily unavailable. Please try again later.",
                }
            )
        logger.exception("Unexpected error fetching notifications")
        return []


@router.get("/unread-count")
def get_unread_count(auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        res = service_client.table("in_app_notifications") \
            .select("id", count="exact") \
            .eq("user_id", user.id) \
            .is_("read_at", "null") \
            .execute()

        return {"count": res.count or 0}
    except Exception as e:
        if _is_permission_error(e):
            logger.error(
                f"DB PERMISSION ERROR on in_app_notifications (unread-count) for user {user.id}: {e}. "
                "Run migration 20_fix_in_app_notifications_permissions.sql to fix."
            )
            return {"count": 0, "error": "notifications_unavailable"}
        logger.exception("Unexpected error fetching unread count")
        return {"count": 0}


@router.post("/{notification_id}/read")
def mark_read(notification_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        res = service_client.table("in_app_notifications") \
            .update({"read_at": datetime.now(timezone.utc).isoformat()}) \
            .eq("id", notification_id) \
            .eq("user_id", user.id) \
            .execute()

        if not res.data:
            raise HTTPException(status_code=404, detail="Notification not found")

        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        if _is_permission_error(e):
            logger.error(f"DB PERMISSION ERROR marking notification read: {e}")
            raise HTTPException(status_code=503, detail="Notifications temporarily unavailable.")
        logger.exception("Error marking notification read")
        raise HTTPException(status_code=500, detail="Could not update notification")


@router.post("/read-all")
def mark_all_read(auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        service_client.table("in_app_notifications") \
            .update({"read_at": datetime.now(timezone.utc).isoformat()}) \
            .eq("user_id", user.id) \
            .is_("read_at", "null") \
            .execute()

        return {"success": True}
    except Exception as e:
        if _is_permission_error(e):
            logger.error(f"DB PERMISSION ERROR marking all notifications read: {e}")
            raise HTTPException(status_code=503, detail="Notifications temporarily unavailable.")
        logger.exception("Error marking all notifications read")
        raise HTTPException(status_code=500, detail="Could not update notifications")
