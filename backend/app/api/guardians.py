import logging
from fastapi import APIRouter, Depends, HTTPException, status
from app.core.auth import get_current_user
from app.db.client import get_service_role_client
from app.schemas.guardian import GuardianLinkRequest, GuardianLinkResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/guardians", tags=["guardians"])

@router.post("/link", response_model=GuardianLinkResponse, status_code=status.HTTP_201_CREATED)
def link_guardian(link_in: GuardianLinkRequest, auth_data: dict = Depends(get_current_user)):
    """
    Links a guardian to the protected user using the guardian's email.
    Uses the service-role client to look up the guardian and insert the link.
    """
    user = auth_data["user"]
    logger.info(f"Linking guardian {link_in.guardian_email} to user_id: {user.id}")

    # Cannot allow users to insert into user_guardian_links from client directly
    service_client = get_service_role_client()
    
    try:
        # Step 1: Look up the guardian by email
        guardian_result = service_client.table("guardians").select("id").eq("email", link_in.guardian_email).execute()
        
        if not guardian_result.data:
            logger.warning(f"Guardian with email {link_in.guardian_email} not found")
            raise HTTPException(status_code=404, detail="Guardian not found. Please ensure they have registered.")
            
        guardian_id = guardian_result.data[0]["id"]
        
        # Prevent linking to self
        if guardian_id == user.id:
            raise HTTPException(status_code=400, detail="Cannot link yourself as a guardian.")

        # Step 2: Create the link
        link_data = {
            "user_id": user.id,
            "guardian_id": guardian_id,
            "is_primary": link_in.is_primary
        }
        
        link_result = service_client.table("user_guardian_links").insert(link_data).execute()
        
        if not link_result.data:
            raise HTTPException(status_code=500, detail="Failed to create guardian link.")
            
        logger.info(f"Successfully linked guardian {guardian_id} to user {user.id}")
        return link_result.data[0]
        
    except HTTPException:
        raise
    except Exception as e:
        # Check for unique constraint violation (already linked)
        if "unique" in str(e).lower() or "duplicate" in str(e).lower() or "23505" in str(e):
            raise HTTPException(status_code=400, detail="Guardian is already linked to this user.")
        logger.error(f"Error linking guardian: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not link guardian."
        )
