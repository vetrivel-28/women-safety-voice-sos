import logging
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import get_current_user
from app.db.client import get_service_role_client
from app.schemas.guardian import (
    GuardianLinkRequest,
    GuardianLinkResponse
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/guardians", tags=["guardians"])


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
            .select("id,email")
            .eq("email", link_in.guardian_email)
            .execute()
        )

        if not guardian_result.data:
            raise HTTPException(
                status_code=404,
                detail="Guardian not found"
            )

        guardian_id = guardian_result.data[0]["id"]

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