import httpx
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from datetime import datetime

from app.core.auth import get_current_user
from app.db.client import get_service_role_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/contacts", tags=["contacts"])

class ContactBase(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None # Keeping in schema so mobile doesn't break if it sends it
    relationship: Optional[str] = "Emergency Contact"
    priority: Optional[int] = 1

class ContactCreate(ContactBase):
    pass

class ContactUpdate(ContactBase):
    pass

class ContactResponse(ContactBase):
    id: str
    user_id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

@router.get("", response_model=List[ContactResponse])
def get_contacts(auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    supabase = get_service_role_client()

    try:
        result = supabase.table("emergency_contacts").select("*").eq("user_id", user.id).order("priority").execute()
        return result.data
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error fetching contacts: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not fetch contacts")

@router.post("", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
def add_contact(contact_in: ContactCreate, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    supabase = get_service_role_client()

    try:
        contact_data = {
            "user_id": user.id,
            "name": contact_in.name,
            "phone": contact_in.phone,
            "relationship": contact_in.relationship,
            "priority": contact_in.priority
        }
        
        result = supabase.table("emergency_contacts").insert(contact_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to add contact")
        return result.data[0]
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error adding contact: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{contact_id}", response_model=ContactResponse)
@router.patch("/{contact_id}", response_model=ContactResponse)
def update_contact(contact_id: str, contact_in: ContactUpdate, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    supabase = get_service_role_client()

    try:
        contact_data = {}
        if contact_in.name is not None: contact_data["name"] = contact_in.name
        if contact_in.phone is not None: contact_data["phone"] = contact_in.phone
        if contact_in.relationship is not None: contact_data["relationship"] = contact_in.relationship
        if contact_in.priority is not None: contact_data["priority"] = contact_in.priority
            
        result = supabase.table("emergency_contacts").update(contact_data).eq("id", contact_id).eq("user_id", user.id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Contact not found")
        return result.data[0]
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error updating contact: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contact(contact_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    supabase = get_service_role_client()

    try:
        result = supabase.table("emergency_contacts").delete().eq("id", contact_id).eq("user_id", user.id).execute()
        return
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error deleting contact: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
