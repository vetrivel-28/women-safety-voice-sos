from fastapi import APIRouter, Depends, HTTPException, status
import logging
from app.core.auth import get_current_user
from app.core.config import settings
from supabase import create_client, ClientOptions

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.get("/me")
def get_me(auth_data: dict = Depends(get_current_user)):
    """
    Returns the current user profile. Tests RLS using the user's token.
    """
    try:
        user = auth_data["user"]
        token = auth_data["token"]
        
        # Create a user-scoped client by passing the access token
        # This ensures RLS policies apply to all queries
        options = ClientOptions(headers={'Authorization': f'Bearer {token}'})
        user_client = create_client(
            settings.SUPABASE_URL, 
            settings.SUPABASE_ANON_KEY,
            options=options
        )
        
        # Query the profile. If RLS works, we only get our own profile.
        result = user_client.table("profiles").select("*").eq("id", user.id).execute()
        
        if not result.data:
            logger.warning(f"User {user.id} authenticated, but no profile found in database.")
            return {
                "id": user.id,
                "email": user.email,
                "profile": None,
                "message": "User authenticated, but no profile found in database"
            }
            
        logger.info(f"Successfully retrieved profile for user {user.id}")
        return {
            "id": user.id,
            "email": user.email,
            "profile": result.data[0]
        }
    except Exception as e:
        logger.error(f"Error fetching user profile: {str(e)}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve user profile.")
