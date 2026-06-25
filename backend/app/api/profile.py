from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from app.db.client import get_user_supabase_client, get_service_role_client
from app.api.auth import get_current_user
from app.schemas.profile import ProfileUpdate, ProfileResponse
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/profile",
    tags=["profile"]
)

@router.get("", response_model=ProfileResponse)
async def get_profile(user: dict = Depends(get_current_user)):
    try:
        supabase = get_service_role_client()
        user_id = user["user"].id
        
        response = supabase.table("profiles").select("*").eq("id", user_id).execute()
        
        if not response.data:
            return ProfileResponse(user_id=user_id)
            
        data = response.data[0]
        # Map db 'id' -> 'user_id' and 'full_name' -> 'name'
        return ProfileResponse(
            user_id=data.get("id", user_id),
            name=data.get("full_name", ""),
            phone=data.get("phone", ""),
            blood_group=data.get("blood_group", ""),
            medical_notes=data.get("medical_notes", "")
        )
    except Exception as e:
        logger.error(f"Error fetching profile: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error while fetching profile")

@router.post("", response_model=ProfileResponse)
@router.put("", response_model=ProfileResponse)
@router.patch("", response_model=ProfileResponse)
async def update_profile(profile_data: ProfileUpdate, user: dict = Depends(get_current_user)):
    try:
        supabase = get_service_role_client()
        user_id = user["user"].id
        
        existing = supabase.table("profiles").select("*").eq("id", user_id).execute()
        
        # Map mobile app 'name' to db 'full_name'
        update_dict = {
            "full_name": profile_data.name,
            "phone": profile_data.phone,
            "blood_group": profile_data.blood_group,
            "medical_notes": profile_data.medical_notes
        }
        
        if existing.data:
            response = supabase.table("profiles").update(update_dict).eq("id", user_id).execute()
        else:
            insert_dict = {**update_dict, "id": user_id}
            response = supabase.table("profiles").insert(insert_dict).execute()
            
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to save profile to database")
            
        data = response.data[0]
        return ProfileResponse(
            user_id=data.get("id", user_id),
            name=data.get("full_name", ""),
            phone=data.get("phone", ""),
            blood_group=data.get("blood_group", ""),
            medical_notes=data.get("medical_notes", "")
        )
    except Exception as e:
        logger.error(f"Error updating profile: {str(e)}")
        # Raise the actual error as a detail so mobile app can see it
        raise HTTPException(status_code=500, detail=str(e))
