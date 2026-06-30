from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional
from app.db.client import get_service_role_client
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
        rows = response.data or []
        
        if not rows:
            # No profile row yet — create a safe default, don't 500
            default_profile = {
                "id": user_id,
                "user_id": user_id,
                "full_name": "",
                "phone": "",
                "email": user["user"].email or "",
                "blood_group": None,
                "medical_notes": None,
            }
            insert_result = supabase.table("profiles").insert(default_profile).execute()
            data = insert_result.data[0] if insert_result.data else default_profile
        else:
            data = rows[0]
            
        # Map db 'id' -> 'user_id' and 'full_name' -> 'name'
        return ProfileResponse(
            user_id=data.get("id", user_id),
            email=data.get("email", ""),
            full_name=data.get("full_name", ""),
            guardian_code=data.get("guardian_code", ""),
            name=data.get("full_name", ""),
            phone=data.get("phone", ""),
            blood_group=data.get("blood_group", ""),
            medical_notes=data.get("medical_notes", "")
        )
    except Exception as e:
        logger.exception(f"Profile fetch failed for user {user.get('user').id if isinstance(user, dict) and user.get('user') else 'Unknown'}: {e}")
        raise HTTPException(status_code=503, detail="Profile service temporarily unavailable")

@router.post("", response_model=ProfileResponse)
@router.put("", response_model=ProfileResponse)
@router.patch("", response_model=ProfileResponse)
async def update_profile(profile_data: ProfileUpdate, user: dict = Depends(get_current_user)):
    try:
        supabase = get_service_role_client()
        user_id = user["user"].id
        
        existing = supabase.table("profiles").select("*").eq("id", user_id).execute()
        existing_row = existing.data[0] if existing.data else {}
        
        incoming = profile_data.dict(exclude_unset=True)
        
        update_data = {}
        # Map frontend keys to backend keys
        key_mapping = {
            "name": "full_name",
            "phone": "phone",
            "blood_group": "blood_group",
            "medical_notes": "medical_notes"
        }
        
        for pydantic_key, db_key in key_mapping.items():
            if pydantic_key in incoming:
                value = incoming[pydantic_key]
                if isinstance(value, str):
                    value = value.strip()
                update_data[db_key] = value if value != "" else None
                
        if not update_data and existing_row:
            data = existing_row
        else:
            if existing.data:
                response = supabase.table("profiles").update(update_data).eq("id", user_id).execute()
            else:
                insert_dict = {**update_data, "id": user_id, "user_id": user_id}
                if "full_name" not in insert_dict: insert_dict["full_name"] = ""
                if "phone" not in insert_dict: insert_dict["phone"] = ""
                response = supabase.table("profiles").insert(insert_dict).execute()
                
            if not response.data:
                raise HTTPException(status_code=500, detail="Failed to save profile to database")
            data = response.data[0]
            
        return ProfileResponse(
            user_id=data.get("id", user_id),
            email=data.get("email", ""),
            full_name=data.get("full_name", ""),
            guardian_code=data.get("guardian_code", ""),
            name=data.get("full_name", ""),
            phone=data.get("phone", ""),
            blood_group=data.get("blood_group", ""),
            medical_notes=data.get("medical_notes", "")
        )
    except Exception as e:
        logger.exception(f"Profile update failed for user {user.get('user').id if isinstance(user, dict) and user.get('user') else 'Unknown'}: {e}")
        raise HTTPException(status_code=503, detail="Profile service temporarily unavailable")
