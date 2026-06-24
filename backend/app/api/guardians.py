import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import get_current_user
from app.db.client import get_service_role_client, get_supabase_client
from app.schemas.guardian import (
    GuardianLinkRequest,
    GuardianLinkResponse,
    GuardianCreate,
    GuardianResponse,
    GuardianUpdate
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/guardians", tags=["guardians"])


@router.get("", response_model=List[GuardianResponse])
def get_guardians(auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        result = service_client.table("guardians").select("*").eq("user_id", user.id).execute()
        return result.data
    except Exception as e:
        logger.error(f"Error fetching guardians: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not fetch guardians")


@router.post("", response_model=GuardianResponse, status_code=status.HTTP_201_CREATED)
def add_guardian(guardian_in: GuardianCreate, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        guardian_data = guardian_in.model_dump()
        guardian_data["user_id"] = user.id
        
        result = service_client.table("guardians").insert(guardian_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to add guardian")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding guardian: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not add guardian")


@router.delete("/{guardian_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_guardian(guardian_id: str, auth_data: dict = Depends(get_current_user)):
    user = auth_data["user"]
    service_client = get_service_role_client()

    try:
        result = service_client.table("guardians").delete().eq("id", guardian_id).eq("user_id", user.id).execute()
        return
    except Exception as e:
        logger.error(f"Error deleting guardian: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not delete guardian")


@router.post(
    "/link",
    response_model=GuardianLinkResponse,
    status_code=status.HTTP_201_CREATED
)
def link_guardian(
    link_in: GuardianLinkRequest,
    auth_data: dict = Depends(get_current_user)
):
    """
    Link a guardian using their email address.
    """

    user = auth_data["user"]
    service_client = get_service_role_client()

    logger.info(
        f"Linking guardian {link_in.guardian_email} "
        f"to user {user.id}"
    )

    try:
        # Look up guardian in profiles table
        guardian_result = (
            service_client
            .table("profiles")
            .select("user_id,email")
            .eq("email", link_in.guardian_email)
            .execute()
        )

        if not guardian_result.data:
            raise HTTPException(
                status_code=404,
                detail="Guardian not found"
            )

        guardian_id = guardian_result.data[0]["user_id"]

        # Prevent self-linking
        if guardian_id == user.id:
            raise HTTPException(
                status_code=400,
                detail="Cannot link yourself as guardian"
            )

        # Create guardian link
        link_data = {
            "user_id": user.id,
            "guardian_id": guardian_id,
            "status": "ACTIVE"
        }

        result = (
            service_client
            .table("guardian_links")
            .insert(link_data)
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=500,
                detail="Failed to create guardian link"
            )

        return result.data[0]

    except HTTPException:
        raise

    except Exception as e:
        logger.error(
            f"Error linking guardian: {str(e)}",
            exc_info=True
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not link guardian"
        )