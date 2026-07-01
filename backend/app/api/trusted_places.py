"""
Trusted Places API
Allows users to save frequently visited locations (Home, Office, College, etc.)
that can be used as Safe Window destinations.
"""
import logging
import httpx
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.db.client import get_service_role_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/trusted-places", tags=["trusted-places"])

VALID_LABELS = {"Home", "Office", "College", "Hostel", "Friend's House", "Other"}


class TrustedPlaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    label: Optional[str] = None
    latitude: float
    longitude: float
    address: Optional[str] = None
    radius_meters: int = Field(default=100, ge=50, le=1000)
    notify_guardians_on_arrival: bool = True


class TrustedPlaceUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    label: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    address: Optional[str] = None
    radius_meters: Optional[int] = Field(default=None, ge=50, le=1000)
    notify_guardians_on_arrival: Optional[bool] = None
    is_active: Optional[bool] = None


@router.get("", response_model=List[dict])
def get_trusted_places(auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()
    try:
        res = (
            service_client.table("trusted_places")
            .select("*")
            .eq("user_id", user.id)
            .eq("is_active", True)
            .order("created_at", desc=False)
            .execute()
        )
        return res.data or []
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error fetching trusted places: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not fetch trusted places")


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_trusted_place(place_in: TrustedPlaceCreate, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    if place_in.label and place_in.label not in VALID_LABELS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid label. Choose from: {', '.join(sorted(VALID_LABELS))}"
        )

    try:
        row = {
            "user_id": user.id,
            "name": place_in.name.strip(),
            "label": place_in.label,
            "latitude": place_in.latitude,
            "longitude": place_in.longitude,
            "address": place_in.address,
            "radius_meters": place_in.radius_meters,
            "notify_guardians_on_arrival": place_in.notify_guardians_on_arrival,
            "is_active": True,
        }
        res = service_client.table("trusted_places").insert(row).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to create trusted place")
        return res.data[0]
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error creating trusted place: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not create trusted place")


@router.put("/{place_id}", response_model=dict)
def update_trusted_place(place_id: str, place_in: TrustedPlaceUpdate, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    if place_in.label and place_in.label not in VALID_LABELS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid label. Choose from: {', '.join(sorted(VALID_LABELS))}"
        )

    try:
        existing = (
            service_client.table("trusted_places")
            .select("id")
            .eq("id", place_id)
            .eq("user_id", user.id)
            .execute()
        )
        if not existing.data:
            raise HTTPException(status_code=404, detail="Trusted place not found")

        update_data = {k: v for k, v in place_in.dict(exclude_unset=True).items() if v is not None or k == "is_active"}
        if not update_data:
            raise HTTPException(status_code=400, detail="Nothing to update")

        from datetime import datetime, timezone
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

        res = (
            service_client.table("trusted_places")
            .update(update_data)
            .eq("id", place_id)
            .eq("user_id", user.id)
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to update trusted place")
        return res.data[0]
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error updating trusted place: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not update trusted place")


@router.patch("/{place_id}/archive", response_model=dict)
def archive_trusted_place(place_id: str, auth_data: dict = Depends(get_current_user)):
    """Soft-delete: mark is_active=false. Data is preserved."""
    user = auth_data["user"]
    service_client = get_service_role_client()
    try:
        existing = (
            service_client.table("trusted_places")
            .select("id")
            .eq("id", place_id)
            .eq("user_id", user.id)
            .execute()
        )
        if not existing.data:
            raise HTTPException(status_code=404, detail="Trusted place not found")

        from datetime import datetime, timezone
        res = (
            service_client.table("trusted_places")
            .update({"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")})
            .eq("id", place_id)
            .eq("user_id", user.id)
            .execute()
        )
        return {"detail": "Archived successfully"}
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error archiving trusted place: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not archive trusted place")


@router.delete("/{place_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trusted_place(place_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()
    try:
        existing = (
            service_client.table("trusted_places")
            .select("id")
            .eq("id", place_id)
            .eq("user_id", user.id)
            .execute()
        )
        if not existing.data:
            raise HTTPException(status_code=404, detail="Trusted place not found")

        service_client.table("trusted_places").delete().eq("id", place_id).eq("user_id", user.id).execute()
        return
    except HTTPException:
        raise
    except httpx.TimeoutException:
        raise
    except httpx.RequestError:
        raise
    except Exception as e:
        logger.error(f"Error deleting trusted place: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not delete trusted place")
