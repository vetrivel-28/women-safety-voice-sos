import logging
from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from datetime import datetime

from app.core.auth import get_current_user
from app.db.client import get_user_supabase_client, get_service_role_client
from app.services.notification_service import notification_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/journeys", tags=["journeys"])

class JourneyCreate(BaseModel):
    journey_name: Optional[str] = "Safe Journey"
    start_label: Optional[str] = None
    start_latitude: Optional[float] = None
    start_longitude: Optional[float] = None
    destination_label: Optional[str] = None
    destination_latitude: Optional[float] = None
    destination_longitude: Optional[float] = None
    check_in_interval_minutes: Optional[int] = 5
    expected_duration_minutes: Optional[int] = 30

class JourneyResponse(BaseModel):
    id: str
    user_id: str
    status: str
    started_at: datetime
    ends_at: Optional[datetime]
    completed_at: Optional[datetime]
    missed_at: Optional[datetime]
    duration_minutes: Optional[int]
    start_latitude: Optional[float]
    start_longitude: Optional[float]
    start_address: Optional[str]
    destination_address: Optional[str]

@router.post("", response_model=JourneyResponse, status_code=status.HTTP_201_CREATED)
def start_journey(journey_in: JourneyCreate, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    supabase = get_user_supabase_client(auth_data["token"])

    try:
        journey_data = {
            "user_id": user.id,
            "status": "active",
            "duration_minutes": journey_in.expected_duration_minutes,
            "start_latitude": journey_in.start_latitude,
            "start_longitude": journey_in.start_longitude,
            "start_address": journey_in.start_label,
            "destination_address": journey_in.destination_label,
            "started_at": datetime.utcnow().isoformat(),
        }
        
        result = supabase.table("safe_windows").insert(journey_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to start journey")
            
        return result.data[0]
    except Exception as e:
        logger.error(f"Error starting journey: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("", response_model=List[JourneyResponse])
def get_journeys(auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    supabase = get_user_supabase_client(auth_data["token"])

    try:
        result = supabase.table("safe_windows").select("*").eq("user_id", user.id).order("started_at", desc=True).execute()
        return result.data
    except Exception as e:
        logger.error(f"Error fetching journeys: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not fetch journeys")

@router.post("/{journey_id}/complete", response_model=JourneyResponse)
def complete_journey(journey_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    supabase = get_user_supabase_client(auth_data["token"])

    try:
        update_data = {
            "status": "completed",
            "completed_at": datetime.utcnow().isoformat()
        }
        result = supabase.table("safe_windows").update(update_data).eq("id", journey_id).eq("user_id", user.id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Journey not found")
        return result.data[0]
    except Exception as e:
        logger.error(f"Error completing journey: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{journey_id}/missed-checkin", status_code=status.HTTP_200_OK)
def handle_missed_checkin(journey_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        # Mark journey as missed
        update_res = service_client.table("safe_windows").update({
            "status": "missed",
            "missed_at": datetime.utcnow().isoformat()
        }).eq("id", journey_id).eq("user_id", user.id).execute()
        
        if not update_res.data:
            raise HTTPException(status_code=404, detail="Journey not found")
            
        journey = update_res.data[0]
        
        # Create an SOS Alert THEN
        sos_data = {
            "user_id": user.id,
            "trigger_type": "JOURNEY_MISSED_CHECKIN",
            "safe_window_id": journey_id,
            "status": "ACTIVE",
            "location_lat": journey.get("start_latitude"),
            "location_long": journey.get("start_longitude")
        }
        
        sos_res = service_client.table("sos_alerts").insert(sos_data).execute()
        
        if sos_res.data:
            # Notify contacts about the missed check-in
            location = None
            if journey.get("start_latitude") and journey.get("start_longitude"):
                 location = {
                     "lat": journey.get("start_latitude"),
                     "long": journey.get("start_longitude")
                 }
            try:
                notification_service.notify_all_guardians(
                    user_id=user.id,
                    alert_type="JOURNEY_MISSED_CHECKIN",
                    user=user,
                    location=location
                )
            except Exception as ne:
                logger.error(f"Notification error: {ne}")
            
        return {"status": "SOS triggered for missed checkin"}
    except Exception as e:
        logger.error(f"Error handling missed checkin: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
